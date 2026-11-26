# Eintippen (Teil 5a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auswahlkarten mit Kernantwort erscheinen ab „sitzt“ als Eingabefeld; die Werkstatt erzeugt Kernantworten für neue und vorhandene Karten.

**Architecture:** Das Kartenformat (`shared`) bekommt ein optionales, nullbares Feld `typed` an `ChoicePayload`. Die App entscheidet beim Laden des Kampfs je Karte, ob sie als „Eintippen“ erscheint, prüft tolerant und speichert eine nicht erkannte Antwort erst nach „Doch richtig“/„Weiter“. Die Werkstatt erweitert die Auftragsregeln und bekommt einen Hintergrund-Auftrag „Kernantworten ergänzen“ über alle Module.

**Tech Stack:** TypeScript, zod, React 18, Vitest + Testing Library (jsdom, fake-indexeddb), Express + supertest (Werkstatt), Supabase.

**Spec:** `docs/superpowers/specs/2026-11-26-eintippen-design.md`

## Global Constraints

- Keine bezahlte API; Claude läuft in der Werkstatt über `deps.runClaude` (eigenes Claude-CLI).
- Bestehende Karten ohne `typed` bleiben gültig und spielbar; ein fehlerhaftes `typed` macht eine Karte nie unspielbar.
- `typed`: `{ answers: string[] }` (≥ 1, `answers[0]` = angezeigte Lösung) | `null` (geprüft, keine Kurzantwort) | fehlt (nicht geprüft).
- Eingabeform nur bei: Karte hat gültige Antworten **und** Zustand `State.Review` **und** `stability >= SECURE_STABILITY_DAYS` (7), Zustand vor der Antwort.
- Reihenfolge-, Zuordnungs-, Lückentext- und Erklärkarten bleiben unverändert.
- Kampf-Balance und Beute unverändert; eine eingetippte Antwort zählt wie jede andere.
- Texte (exakt): Kennzeichnung „Eintippen“; Knöpfe „Prüfen“, „Weiß nicht“, „Doch richtig“, „Weiter“; Werkstatt-Knopf „Kernantworten ergänzen“.
- Der Ergänzungs-Lauf schreibt nur `payload.typed` und `updatedAt`; nichts anderes an der Karte ändert sich. Keine PDFs.
- Repo-Dateien LF; Befehle unter Windows mit `npx.cmd` / `npm.cmd`.

## Review Focus

1. **Lauf abgebrochen oder Claude liefert Unsinn** (fremde IDs, fehlendes Feld, kaputtes JSON): betroffene Karten bleiben unverändert, alle anderen Felder unangetastet, erneuter Lauf macht nur den Rest. Tests in Task 6.
2. **Fehlerhaftes `typed` in einer synchronisierten Karte** (leeres Array, Zahl statt Text): Karte spielt als normale Auswahlfrage. Test in Task 1.
3. **App wird geschlossen oder „Beenden“ gedrückt, während die Lösung einer nicht erkannten Eingabe steht:** nichts gespeichert, kein Boss-Treffer, keine Beute. Test in Task 5.
4. **Schreibvarianten:** Groß/klein, Umlaute vs. ae/oe/ue (so weit `normalize` das abdeckt), führender Artikel, Satzzeichen, kleiner Tippfehler, Synonym aus der Liste → richtig; anderes Wort → nicht erkannt. Tests in Task 2.
5. **Karte vergessen** (Wiederlernen, Stabilität < 7): erscheint wieder als Auswahl. Test in Task 3.

---

### Task 1: Kartenformat `typed` und Auftragsregeln (shared)

**Files:**
- Modify: `shared/src/card.ts` (ChoicePayloadSchema, neue Exporte)
- Modify: `shared/src/generation.ts` (`PAYLOAD_RULES`, `CARD_EXAMPLE`)
- Test: `shared/test/card.test.ts`, `shared/test/generation.test.ts`

**Interfaces:**
- Produces:
  - `TypedSchema = z.object({ answers: z.array(z.string().min(1)).min(1) })`
  - `ChoicePayload.typed?: { answers: string[] } | null` (Schema: `TypedSchema.nullable().optional().catch(undefined)` — ein ungültiger Wert wird beim Parsen zu „fehlt“, die Karte bleibt gültig)
  - `typedAnswers(p: ChoicePayload): string[] | null` — getrimmte, nicht leere Antworten; `null` wenn `typed` fehlt, `null` ist oder nach dem Trimmen nichts übrig bleibt. Akzeptiert auch ungeparste Payloads (prüft selbst).

- [ ] **Step 1: Failing tests**

`card.test.ts`:
```ts
it('choice: typed optional, null erlaubt, ungültig macht die Karte nicht ungültig', () => {
  const base = { /* gültiger choice-Entwurf wie in den vorhandenen Tests */ }
  expect(CardDraftSchema.safeParse(base).success).toBe(true)
  expect(CardDraftSchema.safeParse({ ...base, payload: { ...base.payload, typed: { answers: ['Mitochondrien'] } } }).success).toBe(true)
  expect(CardDraftSchema.safeParse({ ...base, payload: { ...base.payload, typed: null } }).success).toBe(true)
  const bad = CardDraftSchema.safeParse({ ...base, payload: { ...base.payload, typed: { answers: [] } } })
  expect(bad.success).toBe(true)
  expect(bad.success && bad.data.type === 'choice' && bad.data.payload.typed).toBeUndefined()
})
it('typedAnswers', () => {
  const p = (typed: unknown) => ({ question: 'q', options: [], typed }) as never
  expect(typedAnswers(p({ answers: [' Mitochondrien ', '', 'Mitochondrium'] }))).toEqual(['Mitochondrien', 'Mitochondrium'])
  expect(typedAnswers(p(null))).toBeNull()
  expect(typedAnswers(p(undefined))).toBeNull()
  expect(typedAnswers(p({ answers: ['  '] }))).toBeNull()
  expect(typedAnswers(p({ answers: [3] }))).toBeNull()
})
```
`generation.test.ts`: `expect(PAYLOAD_RULES).toContain('"typed"')` und `expect(CARD_EXAMPLE).toContain('"typed"')`; ein `parseGeneration`-Fall, bei dem eine choice-Karte mit `typed: { answers: ['ATP'] }` das Feld behält.

- [ ] **Step 2: Run** `npx.cmd vitest run shared/test/card.test.ts shared/test/generation.test.ts` — Expected: FAIL (`typedAnswers` fehlt, Rules ohne `"typed"`).

- [ ] **Step 3: Implement.** Schema wie oben. In `PAYLOAD_RULES` die choice-Zeile ergänzen um (Wortlaut frei, Inhalt fest): `"typed": { "answers": [...] }` = kurze Kernantwort zum Eintippen (Begriff oder knappe Wortgruppe, höchstens etwa 4 Wörter), `answers[0]` ist die Hauptlösung, danach gängige Varianten (Singular/Plural, Fachwort/deutsches Wort, Abkürzung, andere Schreibweise); bei Fragen ohne sinnvolle Kurzantwort (z. B. „Warum …?“, ganze Sätze) `"typed": null`. In `CARD_EXAMPLE` beim choice-Payload `"typed": { "answers": ["…", "…"] }` ergänzen.

- [ ] **Step 4: Run** dieselben Tests — Expected: PASS. Dann `npm.cmd test` — alle grün (prüft, dass App/Werkstatt-Tests, die PAYLOAD_RULES/Schema nutzen, nicht brechen).

- [ ] **Step 5: Commit** `git commit -m "feat(shared): Kernantwort typed an Auswahlkarten"`

---

### Task 2: Tolerante Prüfung der Eingabe

**Files:**
- Modify: `app/src/answers/check.ts`
- Test: `app/test/check.test.ts`

**Interfaces:**
- Consumes: `normalize` (`@lernapp/shared`), vorhandenes `gapMatches`-Verhalten (tokenweise, Levenshtein).
- Produces: `checkTyped(input: string, answers: string[]): boolean`

Vergleich: Eingabe und jede Antwort vorbereiten — Satzzeichen (alles außer Buchstaben, Ziffern, Leerraum, Bindestrich) entfernen, Leerraum zusammenfassen, einen führenden deutschen Artikel entfernen (`der die das den dem des ein eine einen einem einer eines`) — dann mit der Logik von `gapMatches` vergleichen (wiederverwenden, nicht kopieren). Leere Eingabe → `false`.

- [ ] **Step 1: Failing tests** (`describe('checkTyped')`):
```ts
const A = ['Mitochondrien', 'Mitochondrium', 'Kraftwerk der Zelle']
expect(checkTyped('Mitochondrien', A)).toBe(true)
expect(checkTyped('mitochondrien', A)).toBe(true)
expect(checkTyped('die Mitochondrien', A)).toBe(true)
expect(checkTyped('Mitochondrien.', A)).toBe(true)
expect(checkTyped('Mitochondiren', A)).toBe(true)        // Tippfehler, Toleranz wie Lücken
expect(checkTyped('das Kraftwerk der Zelle', A)).toBe(true)
expect(checkTyped('Ribosomen', A)).toBe(false)
expect(checkTyped('', A)).toBe(false)
expect(checkTyped('   ', A)).toBe(false)
expect(checkTyped('ATP', ['ATP', 'Adenosintriphosphat'])).toBe(true)
expect(checkTyped('ADP', ['ATP'])).toBe(false)            // kurze Tokens exakt
```
- [ ] **Step 2: Run** `npx.cmd vitest run app/test/check.test.ts` — Expected: FAIL (`checkTyped` fehlt).
- [ ] **Step 3: Implement** `checkTyped` wie beschrieben.
- [ ] **Step 4: Run** — Expected: PASS (auch alle vorhandenen Lücken-Tests).
- [ ] **Step 5: Commit** `git commit -m "feat(app): tolerante Prüfung eingetippter Antworten"`

---

### Task 3: Wann eine Karte zur Eingabe wird

**Files:**
- Modify: `app/src/game/mastery.ts`
- Test: `app/test/mastery.test.ts`

**Interfaces:**
- Consumes: `typedAnswers` (Task 1), `SECURE_STABILITY_DAYS`.
- Produces: `isTypedReady(card: Card, state: SrsState | undefined): boolean` — `card.type === 'choice'` und `typedAnswers(card.payload) !== null` und `state?.state === State.Review` und `state.stability >= SECURE_STABILITY_DAYS`. Kein `now`/Abrufwert (eine fällige Karte liegt gerade unter dem Zielwert).

- [ ] **Step 1: Failing tests** `describe('isTypedReady')`: (a) choice mit Antworten, Review, Stabilität 7 → `true`; (b) Stabilität 6.9 → `false`; (c) `State.Relearning` mit Stabilität 30 → `false`; (d) `State.Learning` → `false`; (e) ohne State → `false`; (f) `typed: null` → `false`; (g) cloze-Karte mit Review/30 → `false`; (h) Review mit Stabilität 30, fällig seit 10 Tagen → `true`.
- [ ] **Step 2: Run** `npx.cmd vitest run app/test/mastery.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(app): Auswahlkarte wird ab sitzt zur Eingabe"`

---

### Task 4: Fragedarstellung „Eintippen“ und Rückmeldung

**Files:**
- Create: `app/src/ui/questions/Typed.tsx`
- Modify: `app/src/ui/types.ts` (Answer), `app/src/ui/Feedback.tsx` (Details), `app/src/ask/askPrompt.ts` (Antwort für „Nachfragen“)
- Test: `app/test/ui/typed.test.tsx`, ggf. `app/test/ui/feedback.test.tsx`, `app/test/ask.test.ts`

**Interfaces:**
- Consumes: `checkTyped` (Task 2), `typedAnswers` (Task 1), `AnswerBar`.
- Produces:
  - `Answer` erweitert um `{ kind: 'typed'; text: string; matched: boolean; overridden: boolean }` (`text` leer bei „Weiß nicht“).
  - `Typed({ card, onAnswer }: QuestionProps<'choice'>)`

Verhalten `Typed`:
- Formular mit `ask-kind` „Eintippen“, Frage, einzeiliges `input` (`aria-label="Deine Antwort"`, `autoCapitalize="off"`, `autoComplete="off"`, `spellCheck={false}`), Absenden per Enter oder „Prüfen“ (deaktiviert bei leerem/nur Leerzeichen), daneben Knopf „Weiß nicht“.
- Treffer → sofort `onAnswer('right', { kind: 'typed', text, matched: true, overridden: false })`.
- „Weiß nicht“ → sofort `onAnswer('wrong', { kind: 'typed', text: '', matched: false, overridden: false })`.
- Kein Treffer → **kein** `onAnswer`; Eingabe gesperrt, Lösung sichtbar: „Lösung: {answers[0]}“, „Deine Antwort: {text}“, die `why` der richtigen Option; Knöpfe „Doch richtig“ → `onAnswer('right', {…, matched: false, overridden: true})` und „Weiter“ → `onAnswer('wrong', {…, matched: false, overridden: false})`.

Feedback-Details für `typed`: „✓/✗ Deine Antwort: {text oder „(weiß nicht)“}“, bei nicht erkannt zusätzlich „Richtig: {answers[0]}“ samt `why` der richtigen Option; bei `overridden` der Zusatz „(selbst als richtig gewertet)“. Frage oben wie bei choice.
askPrompt: für `typed` `answer.text.trim() || '(weiß nicht)'`, bei `overridden` mit Zusatz „(selbst als richtig gewertet)“.

- [ ] **Step 1: Failing tests** (`typed.test.tsx`, choice-Fixture mit `typed: { answers: ['Mitochondrien', 'Mitochondrium'] }`):
  - richtige Eingabe + Enter → `onAnswer` einmal mit `('right', { kind: 'typed', text: 'mitochondrium', matched: true, overridden: false })`.
  - „Prüfen“ deaktiviert bei leerem Feld.
  - falsche Eingabe „Ribosomen“ + „Prüfen“ → `onAnswer` **nicht** aufgerufen; Text „Lösung: Mitochondrien“ sichtbar; Klick „Doch richtig“ → `('right', { …, text: 'Ribosomen', matched: false, overridden: true })`.
  - falsche Eingabe + „Weiter“ → `('wrong', { …, overridden: false })`.
  - „Weiß nicht“ → `('wrong', { kind: 'typed', text: '', matched: false, overridden: false })`.
  - Feedback: `typed`-Antwort „Ribosomen“, wrong → zeigt „Deine Antwort: Ribosomen“ und „Richtig: Mitochondrien“.
- [ ] **Step 2: Run** `npx.cmd vitest run app/test/ui/typed.test.tsx` — Expected: FAIL (Modul fehlt).
- [ ] **Step 3: Implement** Komponente, Typ, Feedback-Zweig, askPrompt-Zweig; Stil mit vorhandenen Klassen (`ask`, `ask-kind`, `question`, `solution`, `answer-bar`).
- [ ] **Step 4: Run** typed-, feedback- und ask-Tests — Expected: PASS; `npx.cmd tsc -p app --noEmit` ohne Ausgabe.
- [ ] **Step 5: Commit** `git commit -m "feat(ui): Frage Eintippen mit Doch richtig und Weiß nicht"`

---

### Task 5: Im Kampf einsetzen

**Files:**
- Modify: `app/src/ui/BattleScreen.tsx` (Laden + `Question`)
- Test: `app/test/ui/typedBattle.test.tsx`

**Interfaces:**
- Consumes: `isTypedReady` (Task 3), `Typed` (Task 4).
- Produces: keine neuen Exporte.

Beim Laden (wo `map` der States vorliegt) die IDs der Karten bestimmen, für die `isTypedReady(card, map.get(card.id))` gilt, und als `Set<string>` im State halten (fest für den ganzen Kampf). `Question` bekommt `typed: boolean`; bei `card.type === 'choice' && typed` → `<Typed …/>`. Der Speicherweg in `answer()` bleibt unverändert: weil `Typed` bei nicht erkannter Eingabe erst nach „Doch richtig“/„Weiter“ `onAnswer` ruft, wird vorher nichts gespeichert.

- [ ] **Step 1: Failing tests** (Muster wie `app/test/ui/battle.test.tsx`; Modul + eine choice-Karte mit `typed`, State: Review, Stabilität 30, fällig):
  - zeigt Eingabefeld „Deine Antwort“ statt der vier Optionen; richtige Eingabe → „Richtig!“; `db.states` der Karte geändert.
  - gleiche Karte mit State Stabilität 2 → vier Optionen, kein Eingabefeld.
  - falsche Eingabe → Lösung sichtbar, `db.outbox.count()` unverändert und State unverändert; „Beenden“ → Ergebnis ohne Antwort (0 richtig, 0 falsch), State weiterhin unverändert.
  - falsche Eingabe → „Doch richtig“ → „Richtig!“ und State geändert.
- [ ] **Step 2: Run** `npx.cmd vitest run app/test/ui/typedBattle.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** typedBattle + battle + findsBattle — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(battle): sichere Auswahlkarten als Eintippen"`

---

### Task 6: Werkstatt-Auftrag „Kernantworten ergänzen“

**Files:**
- Modify: `werkstatt/src/prompts.ts`, `werkstatt/src/server.ts`
- Test: `werkstatt/test/prompts.test.ts`, `werkstatt/test/server.test.ts`

**Interfaces:**
- Consumes: `Gateway.listModules/listCards/upsertCards`, `deps.runClaude`, vorhandenes `jobs`-Map + `GET /api/jobs/:id`, `batches`.
- Produces:
  - `typedPrompt(cards: { id: string; question: string; answer: string; why: string }[]): string` — verlangt reines JSON `{ "items": [{ "id": "…", "typed": { "answers": [...] } | null }] }` mit denselben Kernantwort-Regeln wie `PAYLOAD_RULES` (Verweis/Wiederholung erlaubt).
  - `POST /api/typed` (guard) → `{ jobId }`; Job: `status`, `progress { done, total }` (total = Anzahl Karten), `updated: number`, `error?`.
  - `POST /api/jobs/:id/cancel` (guard) → `{ ok: true }`; setzt `job.cancelled = true`, der Lauf stoppt vor dem nächsten Stapel mit `status: 'done'`.

Lauf: alle Module → `listCards` → nicht gelöschte choice-Karten mit `payload.typed === undefined`; Stapel zu 25; je Stapel `runClaude(typedPrompt(...), { addDir: askDir })`; Antwort mit `JSON.parse` auf den ersten `{…}`-Block; je Eintrag: ID muss im Stapel sein, `typed` muss `null` oder gültiges `TypedSchema` sein, sonst ignorieren; gültige Karten mit `{ ...card, payload: { ...card.payload, typed }, updatedAt: new Date().toISOString() }` per `upsertCards` schreiben; `progress.done += stapel.length`, `updated += geschrieben`. Ein fehlgeschlagener Stapel (Claude-Fehler/kaputtes JSON) wird übersprungen und in `error` gesammelt, der Lauf geht weiter.

- [ ] **Step 1: Failing tests** (`server.test.ts`, `fakeGateway` mit drei choice-Karten — eine ohne `typed`, eine mit `typed: null`, eine mit Antworten — plus eine cloze-Karte):
  - `POST /api/typed` → Job; `runClaude` bekommt nur die Karte ohne `typed`; Antwort `{ items: [{ id, typed: { answers: ['ATP'] } }] }` → `upsertCards` mit genau dieser Karte, `payload.typed` gesetzt, Frage/Optionen/`explanation` unverändert, `updatedAt` neu; Job `done`, `updated: 1`.
  - Claude liefert fremde ID und `typed: { answers: [] }` → nichts geschrieben, `updated: 0`.
  - Claude liefert `typed: null` → Karte mit `typed: null` geschrieben.
  - `runClaude` wirft beim ersten von zwei Stapeln (26 Karten) → zweiter Stapel trotzdem geschrieben, `error` gesetzt, `status: 'done'`.
  - Abbrechen: nach `POST /api/jobs/:id/cancel` wird kein weiterer Stapel gestartet.
  - ohne Anmeldung → 401 wie andere guard-Routen.
  - `prompts.test.ts`: `typedPrompt` enthält jede ID und Frage und das Wort `"typed"`.
- [ ] **Step 2: Run** `npx.cmd vitest run werkstatt/test/server.test.ts werkstatt/test/prompts.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(werkstatt): Kernantworten für vorhandene Karten ergänzen"`

---

### Task 7: Werkstatt-Oberfläche

**Files:**
- Modify: `werkstatt/public/index.html`, `werkstatt/public/app.js`
- Test: `werkstatt/test/publicApp.test.ts`

**Interfaces:**
- Consumes: `POST /api/typed`, `GET /api/jobs/:id`, `POST /api/jobs/:id/cancel` (Task 6).

Im Arbeitsbereich ein eigener Abschnitt `<h2>Kernantworten</h2>` mit kurzem Satz („Ergänzt bei vorhandenen Auswahlkarten die kurze Antwort zum Eintippen.“), Knopf `#typed-run` „Kernantworten ergänzen“, Knopf `#typed-cancel` „Abbrechen“ (nur während des Laufs sichtbar) und Statuszeile `#typed-status` (`aria-live="polite"`): während des Laufs „{done} / {total} Karten geprüft“, am Ende „Fertig: {updated} Karten ergänzt.“ plus ggf. Fehlertext.

- [ ] **Step 1: Failing test:** mit Antworten `'/api/typed': { jobId: 't1' }`, `'/api/jobs/t1': { status: 'done', progress: { done: 3, total: 3 }, updated: 2 }` → Klick `#typed-run` → `posted` enthält `/api/typed`; `#typed-status` zeigt „Fertig: 2 Karten ergänzt.“.
- [ ] **Step 2: Run** `npx.cmd vitest run werkstatt/test/publicApp.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** (Polling wie `poll()` bei der Erzeugung).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(werkstatt): Knopf Kernantworten ergänzen"`

---

### Task 8: Sichtprüfung und Abschluss

**Files:**
- Temporär: `app/vcheck.html`, `app/src/vcheck.tsx` (danach löschen; unter `http://[::1]:5173`, eigene IndexedDB, nie echte Daten)

- [ ] **Step 1:** Auf Handygröße (390×664) die `Typed`-Frage zeigen: leer, mit Eingabe, nicht erkannt mit Lösung und beiden Knöpfen, Rückmeldung danach. Prüfen: Eingabefeld und Knöpfe sichtbar, nicht von der klebenden Kampfbühne verdeckt, Tastatur-Enter schickt ab.
- [ ] **Step 2:** Gefundenes beheben (nur CSS/Markup), vcheck-Dateien löschen.
- [ ] **Step 3: Run** `npm.cmd test` und `npx.cmd tsc -p app --noEmit` — Expected: alles grün, tsc ohne Ausgabe.
- [ ] **Step 4: Commit** `git commit -m "fix(ui): Feinschliff Eintippen aus der Sichtprüfung"` (nur wenn etwas geändert wurde).
