# Lern-Kern (Stufe 1a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine nutzbare Lern-App ohne Spielschicht: PDF (Skript/Altklausur) → Fragen mit Erklärungen über lokales Claude Code → Lernen mit FSRS auf PC und Handy, synchron über Supabase, offline-fähig.

**Architecture:** npm-Workspaces-Monorepo mit drei Paketen. `shared` enthält das Fragen-Schema (zod) für beide Seiten. `app` ist eine React-PWA (gehostet, PC + Handy), die lokal in IndexedDB arbeitet und über eine Outbox mit Supabase synchronisiert. `werkstatt` ist ein lokaler Node-Server mit eigener Weboberfläche, der PDFs in Abschnitte teilt, `claude -p` aufruft, das Ergebnis validiert und nach Freigabe in Supabase schreibt.

**Tech Stack:** TypeScript, Node ≥ 20 (vorhanden: 26), React 18 + Vite + `vite-plugin-pwa`, Vitest, `ts-fsrs`, `zod`, `dexie` + `fake-indexeddb` (Tests), `@supabase/supabase-js`, `express` + `multer`, `pdf-lib`.

**Spec:** `docs/superpowers/specs/2026-11-19-lern-app-design.md`

**Nicht in diesem Plan:** Spielschicht (Stufe 1b: Weltkarte, Kampf, Lagerfeuer, Quest, Belohnungen, PixelLab-Grafiken) bekommt einen eigenen Plan, sobald dieser umgesetzt ist. Stufe 2 ebenso.

## Global Constraints

- 0 € laufende Kosten: nur Supabase Free Tier und kostenloses Hosting (GitHub Pages). Keine Anthropic-API; KI ausschließlich über lokales `claude -p` (Pro-Abo).
- PDFs verlassen den PC nie. In Supabase landen nur Fragen, Lernstand, Modul-/Themen-Metadaten.
- Jede Tabelle hat `user_id` und RLS `user_id = auth.uid()`.
- Supabase-URL und öffentlicher Schlüssel kommen aus Build-Variablen (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), überschreibbar in den App-Einstellungen („eigene Datenbank“).
- FSRS-Standards: Ziel-Behaltensrate `0.9`, neue Fragen pro Tag `20`. Beides einstellbar.
- Ein „Lerntag“ beginnt um **04:00 Ortszeit** (Tageszähler für neue Fragen, Fälligkeit „heute“).
- Oberfläche komplett auf Deutsch.
- Android ist Hauptziel, iOS (installierte PWA, iOS 16.4+) muss funktionieren.
- Werkstatt bindet nur an `127.0.0.1`, Port `5174`.

## Review Focus

1. **Claude liefert kaputtes/abgeschnittenes JSON oder einzelne ungültige Fragen** → gültige Fragen übernehmen, ungültige mit Grund auflisten, nie alles verwerfen. (Test in Task 6)
2. **Offline gelernt, später synchronisiert; dieselbe Frage auf zwei Geräten bewertet** → alle Bewertungen bleiben im Log, Lernstand mit neuerem `updated_at` gewinnt, nichts geht verloren. (Test in Task 5)
3. **Lückentext-Eingaben mit Groß/Klein, Leerzeichen, Umlaut-Ersatz, Tippfehler, Plural** → „gametophyt “, „Gametophyt“, „Gametofyt“ richtig; „ae“ für „ä“ richtig; ganz anderes Wort falsch. (Test in Task 3)
4. **Gescanntes PDF ohne Text oder sehr großes PDF** → klare Meldung bzw. Verarbeitung in Abschnitten mit korrekten Seitenzahlen. (Test in Task 6)
5. **Tagesgrenze und Zeitzone** → um 03:59 zählt noch zum Vortag, das Limit für neue Fragen setzt sich um 04:00 zurück. (Test in Task 4)

---

## Dateistruktur

```
package.json                     # npm workspaces: shared, app, werkstatt
tsconfig.base.json
.gitignore
supabase/schema.sql              # Tabellen + RLS
docs/setup.md                    # Supabase, Hosting, Werkstatt (Schritt für Schritt)
shared/src/card.ts               # Typen + zod-Schemas
shared/src/day.ts                # Lerntag-Berechnung (04:00)
app/src/srs/scheduler.ts         # ts-fsrs-Wrapper
app/src/srs/grading.ts           # Antwort → FSRS-Rating
app/src/answers/check.ts         # Antwortprüfung je Fragetyp
app/src/session/queue.ts         # Tages-Warteschlange
app/src/data/db.ts               # Dexie-Datenbank
app/src/data/remote.ts           # Supabase-Zugriff (Interface + Implementierung)
app/src/data/sync.ts             # Outbox-Sync
app/src/data/config.ts           # Supabase-Konfiguration auflösen
app/src/ask/askPrompt.ts         # Nachfragen-Text + Weg (Werkstatt / Zwischenablage)
app/src/ui/…                     # Screens + Fragetyp-Komponenten
werkstatt/src/pdf.ts             # PDF in Abschnitte teilen, Textprüfung
werkstatt/src/claude.ts          # claude -p ausführen
werkstatt/src/prompts.ts         # Prompts Skript / Altklausur / Nachfragen
werkstatt/src/parse.ts           # Ausgabe → validierte Fragen
werkstatt/src/examRelevance.ts   # Klausurrelevanz markieren
werkstatt/src/server.ts          # Express-Routen
werkstatt/public/index.html|app.js|style.css   # Werkstatt-Oberfläche
```

---

### Task 1: Projektgerüst + gemeinsames Fragen-Schema

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `shared/package.json`, `shared/src/card.ts`, `shared/src/day.ts`, `shared/src/text.ts`, `shared/src/index.ts`
- Test: `shared/test/card.test.ts`, `shared/test/day.test.ts`, `shared/test/text.test.ts`

**Interfaces:**
- Produces (`shared/src/card.ts`):
  - `type QuestionType = 'choice' | 'cloze' | 'matching' | 'order' | 'free'`
  - `type Source = { file: string; page: number; quote: string }`
  - Payload je Typ:
    - `ChoicePayload = { question: string; options: { text: string; correct: boolean; why: string }[] }` (genau 4 Optionen, genau 1 richtig, `why` bei allen Pflicht)
    - `ClozePayload = { text: string; gaps: { answers: string[] }[] }` (Lücken im Text als `{{1}}`, `{{2}}` …; Anzahl Platzhalter = `gaps.length`)
    - `MatchingPayload = { prompt: string; pairs: { left: string; right: string }[] }` (3–6 Paare)
    - `OrderPayload = { prompt: string; steps: string[] }` (richtige Reihenfolge, 3–8 Schritte)
    - `FreePayload = { question: string; modelAnswer: string; keyPoints: string[] }`
  - `type Card = { id: string; moduleId: string; topicId: string; type: QuestionType; payload: …; explanation: string; source: Source | null; examRelevant: boolean; fromExam: boolean; difficulty: 1|2|3; createdAt: string; updatedAt: string; deleted: boolean }`
  - `CardDraftSchema` (zod, ohne `id/moduleId/topicId/createdAt/updatedAt/deleted`, dafür `topic: string`) — das liefert Claude.
  - `GenerationResultSchema = { cards: CardDraft[]; styleProfile?: string; examTopics?: string[] }`
- Produces (`shared/src/day.ts`): `studyDay(date: Date): string` → `'YYYY-MM-DD'` in Ortszeit mit Tagesgrenze 04:00.
- Produces (`shared/src/text.ts`): `normalize(s: string): string` — trim, lowercase, Mehrfach-Leerzeichen → eins, `ä→ae ö→oe ü→ue ß→ss`, Satzzeichen am Rand weg. Genutzt von Antwortprüfung (Task 3) und Klausurrelevanz (Task 6).

- [ ] **Step 1: `git init`, Workspaces anlegen** (`package.json` mit `"workspaces": ["shared","app","werkstatt"]`, Vitest als Dev-Abhängigkeit im Root, `npm test` läuft `vitest run` in allen Paketen). `.gitignore`: `node_modules`, `dist`, `.env*`, `werkstatt/tmp`.
- [ ] **Step 2: Failing tests schreiben**

```ts
// shared/test/card.test.ts
it('akzeptiert gültige Auswahlfrage', () => expect(CardDraftSchema.safeParse(validChoice).success).toBe(true))
it('lehnt Auswahl mit 2 richtigen Optionen ab', …)
it('lehnt Auswahl ohne why bei falscher Option ab', …)
it('lehnt Lückentext ab, wenn Platzhalteranzahl != gaps.length', …)
it('lehnt Reihenfolge mit 2 Schritten ab', …)
// shared/test/day.test.ts
it('03:59 gehört zum Vortag', () => expect(studyDay(new Date(2026,10,20,3,59))).toBe('2026-11-19'))
it('04:00 ist neuer Tag', () => expect(studyDay(new Date(2026,10,20,4,0))).toBe('2026-11-20'))
// shared/test/text.test.ts
it('normalize: " Kräuter. " → "kraeuter"', …)
```

- [ ] **Step 3: `npm test` → FAIL** (Module fehlen)
- [ ] **Step 4: Schemas und `studyDay` implementieren** (Payload-Regeln als zod `.refine`)
- [ ] **Step 5: `npm test` → PASS**
- [ ] **Step 6: Commit** `feat: Projektgerüst und Fragen-Schema`

---

### Task 2: FSRS-Planung + Bewertung

**Files:**
- Create: `app/package.json` (Vite-React-TS-Gerüst), `app/src/srs/scheduler.ts`, `app/src/srs/grading.ts`
- Test: `app/test/srs.test.ts`

**Interfaces:**
- Consumes: `QuestionType`
- Produces:
  - `type SrsState` = serialisierbare ts-fsrs-`Card` (Datumsfelder als ISO-String)
  - `newSrsState(now: Date): SrsState`
  - `review(state: SrsState, rating: Rating, now: Date, retention?: number): { state: SrsState; log: ReviewLog }`
  - `isDue(state: SrsState, now: Date): boolean`
  - `recall(state: SrsState, now: Date): number` (Abrufwahrscheinlichkeit 0–1; neue Karte → 0)
  - `type Outcome = 'wrong' | 'partial' | 'right'`
  - `toRating(outcome: Outcome): Rating` → wrong=Again, partial=Hard, right=Good. (Easy wird in Stufe 1a nicht vergeben; bewusst einfach.)
  - `type ReviewLog = { cardId: string; rating: 1|2|3|4; reviewedAt: string; studyDay: string; elapsedDays: number }`

- [ ] **Step 1: Failing tests**

```ts
it('neue Karte ist sofort fällig', …isDue(newSrsState(t0), t0) === true)
it('Good verschiebt Fälligkeit in die Zukunft', …)
it('Again nach Good macht Intervall kürzer als zweites Good', …)
it('recall sinkt mit der Zeit', …recall(s, +1d) > recall(s, +30d))
it('State überlebt JSON round-trip', …review(JSON.parse(JSON.stringify(s)), …) funktioniert)
it('toRating mappt wrong/partial/right auf 1/2/3', …)
```

- [ ] **Step 2: FAIL** (`npm test -w app`)
- [ ] **Step 3: Implementieren** mit `fsrs({ request_retention })`, `createEmptyCard`, `next`, `get_retrievability(card, now, false)`.
- [ ] **Step 4: PASS**
- [ ] **Step 5: Commit** `feat: FSRS-Planung`

---

### Task 3: Antwortprüfung

**Files:**
- Create: `app/src/answers/check.ts`
- Test: `app/test/check.test.ts`

**Interfaces:**
- Consumes: `normalize` aus `shared` (Task 1)
- Produces:
  - `checkCloze(inputs: string[], payload: ClozePayload): { perGap: boolean[]; outcome: Outcome }` — Lücke richtig, wenn normalisierte Eingabe einer normalisierten Antwort entspricht **oder** Levenshtein-Abstand ≤ 1 bei Antwortlänge ≥ 5 bzw. ≤ 2 bei ≥ 10. Alle richtig → right, mind. die Hälfte → partial, sonst wrong.
  - `checkChoice(index: number, p: ChoicePayload): Outcome` (right/wrong)
  - `checkMatching(mapping: number[], p: MatchingPayload): Outcome` — alle → right, ≥ 50 % → partial.
  - `checkOrder(order: number[], p: OrderPayload): Outcome` — exakt → right, höchstens eine Vertauschung benachbarter Schritte → partial.
  - Freitext: kein Check; die UI fragt die Selbsteinschätzung ab und liefert direkt `Outcome`.

- [ ] **Step 1: Failing tests** (Review Focus 3)

```ts
it.each([['gametophyt ', true], ['Gametophyt', true], ['Gametofyt', true], ['Sporophyt', false]])
  ('Lücke "%s" → %s', (input, ok) => expect(checkCloze([input], gap('Gametophyt')).perGap[0]).toBe(ok))
it('Umlaut-Ersatz: "Kraeuter" = "Kräuter"', …)
it('Toleranz ab 5 Zeichen: "Phloen" für "Phloem" richtig', …)
it('keine Toleranz unter 5 Zeichen: "ADP" für "ATP" falsch', …)
it('2 von 3 Lücken → partial', …)
it('Reihenfolge mit einer Nachbarvertauschung → partial', …)
```

- [ ] **Step 2: FAIL** → **Step 3: implementieren** → **Step 4: PASS**
- [ ] **Step 5: Commit** `feat: Antwortprüfung`

---

### Task 4: Tages-Warteschlange

**Files:**
- Create: `app/src/session/queue.ts`
- Test: `app/test/queue.test.ts`

**Interfaces:**
- Consumes: `Card`, `SrsState`, `isDue`, `recall`, `studyDay`
- Produces:
  - `type Settings = { retention: number; newPerDay: number }`
  - `buildQueue(input: { cards: Card[]; states: Map<string, SrsState>; newDoneToday: number; now: Date; settings: Settings; moduleId?: string }): string[]` (Karten-IDs)

Regeln: gelöschte Karten nie. Fällige Karten zuerst, sortiert nach niedrigstem `recall`. Dann neue Karten bis `newPerDay - newDoneToday`, klausurrelevante zuerst, sonst nach `createdAt`. Danach **verzahnen**: keine zwei aufeinanderfolgenden Karten aus demselben Thema, solange es sich vermeiden lässt.

- [ ] **Step 1: Failing tests**

```ts
it('fällige vor neuen', …)
it('neue Karten begrenzt auf newPerDay - newDoneToday', …)
it('klausurrelevante neue Karten zuerst', …)
it('verzahnt Themen A,A,B,B → A,B,A,B', …)
it('gelöschte Karten erscheinen nie', …)
it('Tageszähler: newDoneToday vom Vortag (03:59) zählt nicht', …) // Review Focus 5, nutzt studyDay
```

- [ ] **Step 2: FAIL** → **Step 3: implementieren** → **Step 4: PASS**
- [ ] **Step 5: Commit** `feat: Tages-Warteschlange`

---

### Task 5: Datenhaltung – Supabase-Schema, lokale DB, Sync

**Files:**
- Create: `supabase/schema.sql`, `app/src/data/config.ts`, `app/src/data/db.ts`, `app/src/data/remote.ts`, `app/src/data/sync.ts`
- Test: `app/test/config.test.ts`, `app/test/sync.test.ts`

**Interfaces:**
- `supabase/schema.sql`: Tabellen `modules(id uuid pk, user_id, name, exam_date date null, style_profile text null, updated_at)`, `topics(id, user_id, module_id, name, updated_at)`, `cards(id, user_id, module_id, topic_id, type, payload jsonb, explanation, source jsonb, exam_relevant bool, from_exam bool, difficulty int, created_at, updated_at, deleted bool)`, `card_states(card_id pk, user_id, state jsonb, updated_at)`, `review_logs(id uuid pk, user_id, card_id, rating int, reviewed_at, study_day text, elapsed_days real)`. RLS auf allen: select/insert/update/delete nur `user_id = auth.uid()`. `user_id default auth.uid()`.
- `config.ts`: `resolveSupabaseConfig(env: {url?: string; key?: string}, override: {url: string; key: string} | null): {url: string; key: string} | null` — Override gewinnt, wenn beide Felder gesetzt; sonst Env; sonst `null` (App zeigt Einrichtungsbildschirm).
- `db.ts` (Dexie `lernapp`): Stores `modules`, `topics`, `cards`, `states` (key `cardId`), `outbox` (auto-id; `{ kind: 'state' | 'log'; payload }`), `meta` (key-value: `lastPull`, `settings`, `supabaseOverride`, `newDone:<studyDay>`).
- `type StateRow = { cardId: string; state: SrsState; updatedAt: string }`
- `remote.ts`: `interface Remote { pullSince(iso: string): Promise<{ modules; topics; cards; states }>; pushStates(s: StateRow[]): Promise<void>; pushLogs(l: ReviewLog[]): Promise<void> }` + `createSupabaseRemote(client): Remote`.
- `sync.ts`:
  - `recordReview(cardId: string, result: { state: SrsState; log: ReviewLog }): Promise<void>` — schreibt `states` + zwei Outbox-Einträge, erhöht `newDone:<studyDay>` falls Karte neu war.
  - `sync(remote: Remote, now: Date): Promise<{ pushed: number; pulled: number }>` — erst Outbox pushen (bei Fehler Einträge behalten), dann `pullSince(lastPull)`; eingehende States nur übernehmen, wenn `updated_at` neuer als lokal. Logs sind nur anhängend.
  - Auslöser in der UI: App-Start, `online`-Event, nach jeder Lerneinheit.

- [ ] **Step 1: Failing tests** (Remote als In-Memory-Fake, `fake-indexeddb/auto`)

```ts
it('Override schlägt Env, halbes Override wird ignoriert', …)
it('offline: recordReview landet in Outbox, sync bei Fehler behält Outbox', …)
it('sync leert Outbox nach Erfolg', …)
it('zwei Geräte: neuerer State gewinnt, beide Logs bleiben', …) // Review Focus 2
it('pull übernimmt neue Karten und gelöschte (deleted=true) Markierungen', …)
```

- [ ] **Step 2: FAIL** → **Step 3: implementieren** → **Step 4: PASS**
- [ ] **Step 5: `schema.sql` in einem echten Supabase-Projekt ausführen** (Nutzer legt Projekt nach `docs/setup.md` an; dieser Schritt wird gemeinsam mit dem Nutzer gemacht) und prüfen: zweiter Testnutzer sieht keine Zeilen des ersten.
- [ ] **Step 6: Commit** `feat: Datenhaltung und Sync`

---

### Task 6: Werkstatt-Kern – PDF, Claude, Auswertung

**Files:**
- Create: `werkstatt/package.json`, `werkstatt/src/pdf.ts`, `werkstatt/src/claude.ts`, `werkstatt/src/prompts.ts`, `werkstatt/src/parse.ts`, `werkstatt/src/examRelevance.ts`
- Test: `werkstatt/test/pdf.test.ts`, `werkstatt/test/parse.test.ts`, `werkstatt/test/examRelevance.test.ts`, `werkstatt/test/fixtures/*`

**Interfaces:**
- `pdf.ts`:
  - `splitPdf(path: string, pagesPerChunk = 15): Promise<{ path: string; firstPage: number; lastPage: number }[]>` (pdf-lib, Dateien in `werkstatt/tmp/`)
  - `hasText(path: string): Promise<boolean>` — falls kein extrahierbarer Text: Fehler „Dieses PDF scheint gescannt zu sein …“. (Textprüfung mit `pdfjs-dist`.)
- `claude.ts`: `runClaude(prompt: string, opts: { addDir: string; timeoutMs?: number }): Promise<string>` — `spawn('claude', ['-p', prompt, '--output-format', 'json', '--allowedTools', 'Read', '--add-dir', addDir])`, liefert das `result`-Feld. Timeout Standard 10 min. Fehler mit verständlicher Meldung (Claude nicht installiert / nicht angemeldet / Limit erreicht).
- `prompts.ts`:
  - `scriptPrompt(chunk, ctx: { moduleName: string; existingTopics: string[]; styleProfile: string | null; fileName: string }): string`
  - `examPrompt(chunk, ctx: { moduleName: string; existingTopics: string[]; fileName: string }): string` → verlangt zusätzlich `styleProfile` und `examTopics` (aus `existingTopics` oder neu).
  - `askPrompt(card: Card, userAnswer: string, history: {role; text}[]): string`
  - Alle Prompts: Deutsch, Antwort **nur** JSON gemäß `GenerationResultSchema`, Seitenzahlen **im Original-PDF** (Offset `firstPage - 1` angeben), Fragetyp-Mischung, Erklärungen kurz, bei Auswahl jede falsche Option begründen, Schwerpunkt Prüfungswissen, keine Fragen zu Inhaltsverzeichnis/Literatur.
- `parse.ts`: `parseGeneration(raw: string): { result: GenerationResult; rejected: { index: number; reason: string }[] }` — JSON aus Codeblock/Fließtext extrahieren; bei abgeschnittenem Array die vollständigen Elemente retten; jede Karte einzeln mit `CardDraftSchema` prüfen. Komplett unbrauchbar → wirft `ParseError`.
- `examRelevance.ts`: `markExamRelevant(cards: Card[], topics: { id: string; name: string }[], examTopics: string[]): Card[]` — Themenvergleich über `normalize` aus `shared`; ändert `examRelevant` und `updatedAt`.

- [ ] **Step 1: Failing tests** (Review Focus 1 + 4)

```ts
it('splitPdf: 40 Seiten → 3 Abschnitte mit firstPage 1,16,31', …) // Fixture via pdf-lib erzeugt
it('hasText: leeres/gescanntes PDF → false', …)
it('parse: JSON in ```json-Block', …)
it('parse: 1 von 3 Karten ungültig → 2 übernommen, 1 rejected mit Grund', …)
it('parse: abgeschnittenes Array → vollständige Karten gerettet', …)
it('parse: reiner Text → ParseError', …)
it('markExamRelevant: "Moose " matcht Thema "moose"', …)
```

- [ ] **Step 2: FAIL** → **Step 3: implementieren** → **Step 4: PASS**
- [ ] **Step 5: Echter Lauf** mit einem kurzen Test-PDF: `npx tsx werkstatt/scripts/try.ts <pdf>` (kleines Skript, das split → runClaude → parse ausgibt). Erwartet: ≥ 5 gültige Karten, Seitenzahlen passen zum PDF.
- [ ] **Step 6: Commit** `feat: Werkstatt-Kern`

---

### Task 7: Werkstatt-Server + Oberfläche

**Files:**
- Create: `werkstatt/src/server.ts`, `werkstatt/src/supabase.ts`, `werkstatt/public/index.html`, `werkstatt/public/app.js`, `werkstatt/public/style.css`, `werkstatt/start.cmd`
- Test: `werkstatt/test/server.test.ts` (supertest, `runClaude` gemockt)

**Interfaces:**
- Consumes: alles aus Task 6, `schema.sql`-Tabellen.
- Routen (alle unter `http://127.0.0.1:5174`):
  - `GET /` → Oberfläche
  - `POST /api/login {email, password}` → Supabase-Session im Speicher (gleiche Konten wie die App)
  - `GET /api/modules` → Module + Themen des Nutzers
  - `POST /api/modules {name}` → neues Modul
  - `POST /api/generate` (multipart: `file`, `moduleId`, `kind: 'script'|'exam'`) → startet Job, antwortet `{ jobId }`
  - `GET /api/jobs/:id` → `{ status: 'running'|'done'|'error', progress: {done,total}, cards?, rejected?, styleProfile?, examTopics?, error? }`
  - `POST /api/commit {moduleId, cards, styleProfile?, examTopics?}` → legt fehlende Themen an, schreibt Karten, speichert `styleProfile` am Modul (bei Altklausur), markiert bestehende Karten per `markExamRelevant`
  - `POST /api/ask {card, userAnswer, history}` → `{ answer }` (für Nachfragen am PC)
  - CORS: erlaubt nur die konfigurierte App-Origin (`APP_ORIGIN`, Standard GitHub-Pages-URL) und `http://localhost:5173`; antwortet auf Preflight zusätzlich mit `Access-Control-Allow-Private-Network: true`.
- Oberfläche: Login → Modul wählen/anlegen → PDF ablegen + Typ wählen → Fortschritt pro Abschnitt → Vorschau aller Karten (je Karte: Typ, Frage, Antwort, Erklärung, Quelle; Bearbeiten im Textfeld als JSON-light-Formular, Löschen) → „Übernehmen“. Abgelehnte Karten werden mit Grund angezeigt.
- `start.cmd`: startet Server und öffnet den Browser — Doppelklick genügt.

- [ ] **Step 1: Failing tests**: `generate`→`jobs` liefert Karten aus gemocktem Claude; `commit` ruft Supabase-Insert mit `user_id`-loser Zeile (Default greift) und markiert Klausurrelevanz; CORS lehnt fremde Origin ab; Preflight enthält Private-Network-Header.
- [ ] **Step 2: FAIL** → **Step 3: implementieren** → **Step 4: PASS**
- [ ] **Step 5: Manuell**: `start.cmd`, echtes Botanik-Skript hochladen, Vorschau prüfen, übernehmen; in Supabase-Tabelle `cards` erscheinen die Karten.
- [ ] **Step 6: Commit** `feat: Werkstatt-Oberfläche`

---

### Task 8: App – Anmeldung, Übersicht, Lernen

**Files:**
- Create: `app/src/main.tsx`, `app/src/App.tsx`, `app/src/ui/SetupScreen.tsx`, `app/src/ui/LoginScreen.tsx`, `app/src/ui/HomeScreen.tsx`, `app/src/ui/StudyScreen.tsx`, `app/src/ui/Feedback.tsx`, `app/src/ui/questions/{Choice,Cloze,Matching,Order,Free}.tsx`, `app/src/ui/SettingsScreen.tsx`, `app/src/ui/theme.css`
- Test: `app/test/ui/*.test.tsx` (Testing Library)

**Interfaces:**
- Consumes: `buildQueue`, `review`, `toRating`, `check*`, `recordReview`, `sync`, `resolveSupabaseConfig`.
- Bildschirme:
  - **Setup** (nur wenn keine Supabase-Konfiguration): URL + Schlüssel eintragen.
  - **Login**: E-Mail + Passwort (Supabase Auth), Registrieren.
  - **Home**: „Heute fällig: X · Neu: Y“, Start-Knopf „Lernen“, Liste der Module mit Fortschritt (Anteil Karten mit `recall ≥ retention`), Sync-Status.
  - **Study**: eine Einheit = max. 25 Karten aus `buildQueue`; danach Zusammenfassung („20 richtig, 5 zum Wiederholen“) und Hinweis auf Pause. Fragetyp-Komponente → Outcome → `Feedback`.
  - **Feedback**: richtig/falsch, richtige Antwort, Erklärung, bei Auswahl das `why` der gewählten Option, Quelle („Skript_Botanik.pdf, S. 12: „…““), Knopf „Nachfragen“ (Task 9), Knopf „Weiter“.
  - **Free**: Eingabefeld → „Lösung zeigen“ → Musterantwort + Kernpunkte → drei Knöpfe „Gewusst / Teilweise / Nicht gewusst“.
  - **Settings**: Ziel-Behaltensrate (0.80–0.95), neue Fragen/Tag, eigene Datenbank (Override), Abmelden.
- Optik in 1a: schlicht, dunkles Retro-Farbschema mit Pixel-Schrift (z. B. „Press Start 2P“ für Überschriften, gut lesbare Schrift für Fragetext) als Basis für Stufe 1b.

- [ ] **Step 1: Failing tests**: Choice-Klick auf falsche Option zeigt deren `why`; Cloze-Eingabe mit Tippfehler zählt richtig; Free zeigt drei Selbsteinschätzungsknöpfe erst nach „Lösung zeigen“; Study ruft `recordReview` pro Antwort und endet nach 25 Karten; Home zeigt korrekte Fällig-/Neu-Zahlen aus Testdaten.
- [ ] **Step 2: FAIL** → **Step 3: implementieren** → **Step 4: PASS**
- [ ] **Step 5: Manuell** mit `npm run dev -w app` im Browser-Pane: einloggen, Karten aus Task 7 lernen, Handy-Breite (375 px) prüfen.
- [ ] **Step 6: Commit** `feat: Lern-Oberfläche`

---

### Task 9: Nachfragen, PWA/Offline, iOS-Hinweis

**Files:**
- Create: `app/src/ask/askPrompt.ts`, `app/src/ui/AskDialog.tsx`, `app/src/ui/InstallHint.tsx`
- Modify: `app/vite.config.ts` (vite-plugin-pwa), `app/src/ui/Feedback.tsx`
- Test: `app/test/ask.test.ts`, `app/test/installHint.test.tsx`

**Interfaces:**
- `buildAskText(card: Card, userAnswer: string): string` — fertiger deutscher Text: Frage, meine Antwort, richtige Antwort, Erklärung, Quelle, Bitte „Erkläre mir genauer, warum meine Antwort falsch ist und wo mein Denkfehler liegt.“
- `detectAskMode(): Promise<'werkstatt' | 'clipboard'>` — `fetch('http://127.0.0.1:5174/api/health', { signal: timeout 800ms })` ok → `werkstatt`, sonst `clipboard`.
- `AskDialog`: Modus `werkstatt` → kleiner Chat über `POST /api/ask` mit Verlauf. Modus `clipboard` → Text in Zwischenablage kopieren, Hinweis „Text kopiert – in Claude einfügen“, Knopf öffnet `https://claude.ai/new` (öffnet auf Android die Claude-App, sofern installiert). Kein Inhalt in der URL.
- PWA: Manifest (Name „Lernabenteuer“, `display: standalone`, Icons 192/512 als Platzhalter), Service Worker cached App-Shell; Daten kommen aus Dexie, daher offline lernbar.
- `isIosNotInstalled(ua: string, standalone: boolean): boolean` → `InstallHint` mit Anleitung „Teilen → Zum Home-Bildschirm“.
- Persistenter Speicher: beim Start `navigator.storage.persist()` anfragen.

- [ ] **Step 1: Failing tests**: `buildAskText` enthält Frage, Nutzerantwort, richtige Antwort, Erklärung; `detectAskMode` fällt bei Timeout auf `clipboard` zurück; `isIosNotInstalled` true für iPhone-Safari nicht standalone, false für Android und für iOS standalone.
- [ ] **Step 2: FAIL** → **Step 3: implementieren** → **Step 4: PASS**
- [ ] **Step 5: Manuell**: `npm run build -w app && npm run preview -w app`; im Browser-Pane Offline-Modus simulieren → Lernen funktioniert, nach Online-Schalten werden Bewertungen synchronisiert.
- [ ] **Step 6: Commit** `feat: Nachfragen und Offline`

---

### Task 10: Veröffentlichung + Einrichtungsanleitung

**Files:**
- Create: `.github/workflows/deploy.yml`, `docs/setup.md`, `app/.env.example`, `werkstatt/.env.example`
- Modify: `app/vite.config.ts` (`base` = Repo-Pfad)

**Interfaces:**
- `deploy.yml`: bei Push auf `main` → `npm ci && npm test && npm run build -w app` mit Secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` → GitHub Pages.
- `docs/setup.md` (Deutsch, für Nicht-Programmierer, auch für Freunde): 1) Supabase-Projekt anlegen, `schema.sql` im SQL-Editor ausführen, E-Mail-Bestätigung nach Wunsch; 2) GitHub-Repo + Pages + Secrets; 3) Werkstatt: Node + Claude Code installieren, `npm install`, `start.cmd`; 4) Handy: Link öffnen, „Zur Startseite hinzufügen“; 5) Variante „eigene Datenbank“ für Freunde; 6) Hinweis auf Pausieren des Gratis-Projekts nach ~1 Woche und Reaktivieren.

- [ ] **Step 1: Konten einrichten – gemeinsam mit dem Nutzer.** Nutzer legt GitHub-Konto/Repo und Supabase-Projekt selbst an und trägt Schlüssel selbst als Secrets ein (Claude gibt keine Zugangsdaten ein).
- [ ] **Step 2: Push → Workflow grün**, App unter der Pages-URL erreichbar.
- [ ] **Step 3: Ende-zu-Ende-Prüfung**: echtes Botanik-Skript + eine Altklausur über die Werkstatt verarbeiten → am PC lernen → am Android-Handy dieselben Fälligkeiten sehen → Handy offline lernen → online → am PC aktualisiert. Nachfragen am PC (Werkstatt-Chat) und am Handy (Zwischenablage → Claude-App) ausprobieren.
- [ ] **Step 4: Commit** `chore: Veröffentlichung und Anleitung`
