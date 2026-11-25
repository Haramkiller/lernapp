# Boss-Leben = Wissen im Modul – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Boss hat im Kampf dasselbe Leben wie auf der Karte, nämlich das fehlende Wissen im ganzen Modul. Jede Antwort macht ehrlichen, kleinen Schaden.

**Architecture:**
- Eine reine Funktion `cardLife` in `game/mastery.ts` ist die einzige Quelle für das Leben. Kampf, Karte und Gewächshaus rechnen damit.
- `game/battle.ts` verwaltet nur noch angezeigte Zahlen. BattleScreen liefert für jede Antwort das Leben der Karte vorher und nachher.
- Das Endleben je Modul wird als Spielzeile gespeichert. Daraus entsteht beim nächsten Kampfstart die Meldung „hat sich erholt“.

**Tech Stack:** React 18 + Vite 7, TypeScript, Dexie, ts-fsrs, Vitest + Testing Library (jsdom, fake-indexeddb).

**Spec:** `docs/superpowers/specs/2026-11-25-boss-leben-design.md` (ändert 6.5 in `docs/superpowers/specs/2026-11-20-spielschicht-stufe-1b-design.md`)

## Global Constraints

- **Formel für das Leben einer Karte:** `cardLife = 10 × (1 − min(1, Stabilität / 7) × min(1, Abruf / Zielwert))`.
  - Eine neue Karte zählt 10.
  - `cardLife = 0` genau dann, wenn `isSecure` gilt.
- **Boss-Leben** = Summe über alle nicht gelöschten, gültigen Karten im Umfang. Höchstwert = 10 × Anzahl. Angezeigt werden ganze Zahlen.
- **Die Leiste steigt im Kampf nie.** Schaden = vorher − nachher, höchstens bis 0 nach unten. Angezeigte Zahlen gehen auf: Start − Summe der angezeigten Schäden = Ende.
- **Combo, Krit und Glück** sind nur noch Effekte und ändern den Schaden nicht. Kampf-Leben, Phasen und K.-o. fallen weg.
- **Ungültige Karten** (`CardDraftSchema` schlägt fehl) zählen überall nicht: weder im Kampf noch auf der Karte noch im Gewächshaus.
- **Erholungsmeldung** nur, wenn das gerundete echte Leben beim Start mindestens 1 über dem gespeicherten Endleben liegt.
- **Texte (Deutsch, exakt):**
  - „Boss-Leben x %“
  - „Noch unerforscht“
  - „{Bosstitel} hat sich erholt: A → B“
  - Überschriften „Endgültig besiegt!“, „Geschwächt“, „Hält stand“
  - „A → B“, „−N Leben in dieser Runde“, „Noch x %“, „1 Karte sitzt jetzt sicher“ / „N Karten sitzen jetzt sicher“
- **Dateien:** Repo-Dateien sind LF. Python-Skripte schreiben mit `newline=''`. Prettier nicht laufen lassen.
- **UI-Tests:** Sie warten auf asynchronen Zustand mit `findBy…` oder `vi.waitFor`, weil die CI langsamer ist.
- **Tests:**
  - einzeln: `npm.cmd test -w app -- <Dateifilter>`
  - alle: `npm.cmd test`
  - Typen: `npx.cmd tsc -p app --noEmit`
- **Commits** enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nicht pushen ohne Zustimmung des Nutzers.

## Review Focus

1. **Falsche Antwort auf eine schon gelernte Karte.** Ihr Leben steigt, der Schaden ist 0, die Anzeige bleibt stehen. Das echte Endleben ist höher als das angezeigte. Getestet in Task 2.
2. **Wenn alle Karten sicher werden, muss die Anzeige wirklich bei 0 ankommen.** Gerundete Einzelschäden dürfen nicht auseinanderlaufen. Darum wird die Summe der exakten Schäden gerundet, nicht jeder Einzelschaden. Getestet in Task 2.
3. **Kampf ohne Modul (Umfang „alle“):** Das Endleben wird unter einem eigenen Schlüssel gespeichert und vermischt sich nicht mit einem Modul. Getestet in Task 3.
4. **Fehlerhafte Karte im Modul:** Karte, Gewächshaus und Kampf zeigen dasselbe Leben. Das Gewächshaus kann den Boss trotzdem als besiegt eintragen. Getestet in Task 1 und Task 4.
5. **Speichern des Endlebens schlägt fehl:** Der Abschluss-Bildschirm erscheint trotzdem, der Fehler wird verschluckt. Getestet in Task 3.

---

### Task 1: Leben einer Karte und eines Bosses (Spiellogik)

**Files:**
- Modify: `app/src/game/mastery.ts`
- Modify: `app/src/game/overview.ts`
- Modify: `app/src/game/garden.ts` (`buildGarden`: Karten filtern)
- Modify: `app/src/ui/BattleScreen.tsx` (nur `schemaValid` → `isPlayable` importieren)
- Test: `app/test/mastery.test.ts`, `app/test/overview.test.ts`, `app/test/garden.test.ts`

**Interfaces:**
- Produces:
  - `isPlayable(card: Card): boolean`. Gleiche Prüfung wie das heutige `schemaValid` in BattleScreen: `CardDraftSchema.safeParse({ ...card, topic: 'x' }).success`.
  - `CARD_LIFE = 10`
  - `cardLife(s: SrsState | undefined, now: Date, retention: number): number`. Ungerundet, zwischen 0 und 10.
  - `type Life = { hp: number; max: number }`. `hp` ist ungerundet.
  - `bossLife(cards: Card[], states: Map<string, SrsState>, now: Date, retention: number): Life`. Zählt nur Karten, die nicht gelöscht sind und `isPlayable` erfüllen.
  - `lifePercent(life: Life): number | null`. Rechnet `Math.round(hp / max × 100)`; bei `max === 0` kommt `null` zurück.
  - `ModuleView.life: number | null` ersetzt `threat`.
- `moduleThreat` entfällt.

- [ ] **Step 1: Failing tests in `mastery.test.ts`.** Die Tests zu `moduleThreat` werden ersetzt.

```ts
it('neue Karte zählt 10, sicher sitzende 0', () => {
  expect(cardLife(undefined, NOW, 0.9)).toBe(10)
  expect(cardLife(secureState, NOW, 0.9)).toBe(0) // denselben State nutzen, für den isSecure in den bestehenden Tests true ist
})
it('cardLife ist genau dann 0, wenn isSecure', () => { /* für mehrere States: (cardLife === 0) === isSecure */ })
it('halbe Stabilität bei vollem Abruf: 5', () => {
  // State mit stability 3.5, last_review = NOW → Abruf 1
  expect(cardLife(s35, NOW, 0.9)).toBeCloseTo(5)
})
it('verblasste Karte gewinnt Leben zurück', () => {
  // gleicher State, 60 Tage später: Abruf < Zielwert → cardLife > 0
})
it('bossLife: Summe und Höchstwert, gelöschte und ungültige Karten zählen nicht', () => {
  const bad = { ...choiceCard('x'), payload: {} } as Card
  expect(bossLife([choiceCard('a'), choiceCard('b'), choiceCard('d', { deleted: true }), bad], new Map(), NOW, 0.9))
    .toEqual({ hp: 20, max: 20 })
})
it('lifePercent: null ohne Karten, sonst gerundet', () => {
  expect(lifePercent({ hp: 0, max: 0 })).toBeNull()
  expect(lifePercent({ hp: 13.4, max: 20 })).toBe(67)
})
```

Den vorhandenen Fixture-Import `choiceCard` aus `./ui/fixtures` verwenden. Erst prüfen, ob `choiceCard` selbst `isPlayable` besteht. Falls nicht, das Fixture reparieren.

- [ ] **Step 2: Rot prüfen.** `npm.cmd test -w app -- mastery`. Erwartet: FAIL, weil `cardLife` / `bossLife` / `lifePercent` fehlen.

- [ ] **Step 3: Umsetzen in `mastery.ts`.**
  - `isPlayable`, `CARD_LIFE`, `cardLife`, `bossLife` und `lifePercent` wie im Interfaces-Block. `cardLife` nutzt `recall()` aus `srs/scheduler` und `SECURE_STABILITY_DAYS`.
  - `moduleThreat` entfernen.
  - In BattleScreen `schemaValid` durch `isPlayable` ersetzen. Der Prop `validate` bleibt mit dem Standardwert `isPlayable`.

- [ ] **Step 4: Failing tests für Karte und Gewächshaus.**
  - `overview.test.ts`: Erwartungen zu `threat` werden zu `life`.
    - Ein Modul nur mit neuen Karten: `life: 100`.
    - Bestehender Test „Bedrohung aus den gelernten Karten“: als `life` mit der Formel neu formulieren. Erwartungswert über `lifePercent(bossLife(...))` im Test berechnen, nicht von Hand.
    - Ein Modul ohne Karten: `life: null`.
  - `garden.test.ts`, neuer Test „ungültige Karte zählt nicht: Thema blüht und Modul wird besiegt“: alle gültigen Karten sicher plus eine Karte mit `payload: {}` im selben Thema. Erwartet: Pflanze `bloom`, und `newMilestones` liefert das Modul.

- [ ] **Step 5: Rot prüfen.** `npm.cmd test -w app -- overview garden`. Erwartet: FAIL.

- [ ] **Step 6: Umsetzen.**
  - `overview.ts`: `mine` filtert zusätzlich `isPlayable`. `life: lifePercent(bossLife(mine, states, now, retention))`.
  - `garden.ts` (`buildGarden`): `byTopic` nimmt nur Karten mit `!c.deleted && isPlayable(c)`.

- [ ] **Step 7: Grün prüfen.** `npm.cmd test -w app -- mastery overview garden` und `npx.cmd tsc -p app --noEmit`. Erwartet: PASS. `tsc` meldet noch Fehler in `MapDialog.tsx` (`threat`). Die behebt Task 4. Nur diese Fehler sind erlaubt.

- [ ] **Step 8: Commit** `feat(game): Leben je Karte und Boss aus dem Lernstand`.

### Task 2: Kampf rechnet mit echtem Schaden

**Files:**
- Modify: `app/src/game/battle.ts` (neu geschrieben)
- Test: `app/test/battle.test.ts` (neu geschrieben)

**Interfaces:**
- Consumes: `Life` aus Task 1.
- Produces:

```ts
export type Hit = { outcome: Outcome; damage: number; tier: Tier; crit: boolean; lucky: boolean; secured: boolean }
export type Battle = {
  total: number; answered: number
  /** Exaktes Leben beim Start; Anzeige = round(start − dealt). */
  start: number; dealt: number
  /** Exaktes echtes Leben (steigt auch, z. B. bei falschen Antworten). */
  real: number
  startHp: number; hp: number; maxHp: number
  combo: number; bestCombo: number; secured: number
  finished: boolean; last: Hit | null
}
export function startBattle(total: number, life: Life): Battle
export function applyAnswer(b: Battle, a: { outcome: Outcome; elapsedDays: number | null; before: number; after: number }, rng: Rng, luckyChance?: number): Battle
export function endBattle(b: Battle): Battle            // setzt nur finished
export function hpPercent(b: Battle): number            // round(hp / maxHp × 100), 0 bei maxHp 0
export function defeated(b: Battle): boolean            // Math.round(b.real) === 0
```

`LUCKY_CHANCE`, `RESTED_LUCKY_CHANCE`, `Tier` und die Combo-Stufen (3 → Stufe 2, 6 → Stufe 3) bleiben. `HP_PER_QUESTION`, Phasen, `knockouts`, `defeated` als Feld und alle Schadensboni entfallen.

- [ ] **Step 1: Failing tests (`battle.test.ts`).** Den Inhalt ersetzen. `L = { hp: 40, max: 40 }`.

```ts
it('startet mit gerundetem Leben', () => {
  expect(startBattle(3, { hp: 30.4, max: 40 })).toMatchObject({ startHp: 30, hp: 30, maxHp: 40, finished: false })
})
it('Schaden = vorher − nachher, Anzeige sinkt', () => {
  const b = applyAnswer(startBattle(3, L), { outcome: 'right', elapsedDays: 1, before: 10, after: 4.4 }, never)
  expect(b.hp).toBe(34); expect(b.last!.damage).toBe(6)
})
it('falsche Antwort: 0 Schaden, Anzeige bleibt, echtes Leben steigt', () => {
  const b = applyAnswer(startBattle(3, { hp: 20, max: 40 }), { outcome: 'wrong', elapsedDays: 1, before: 2, after: 7 }, never)
  expect(b.hp).toBe(20); expect(b.last!.damage).toBe(0); expect(b.real).toBe(25)
})
it('angezeigte Schäden gehen auf und erreichen 0', () => {
  // start 10.6 → Anzeige 11; zwei Antworten mit je 5.3 Schaden
  let b = startBattle(2, { hp: 10.6, max: 20 })
  b = applyAnswer(b, { outcome: 'right', elapsedDays: 1, before: 5.3, after: 0 }, never)
  const first = b.last!.damage
  b = applyAnswer(b, { outcome: 'right', elapsedDays: 1, before: 5.3, after: 0 }, never)
  expect(first + b.last!.damage).toBe(11); expect(b.hp).toBe(0); expect(defeated(b)).toBe(true)
})
it('Combo, Krit und Glück ändern den Schaden nicht', () => {
  // Krit (elapsedDays 7) und Glück (rng 0.05) bei before 10, after 4: damage 6, crit true, lucky true
})
it('Combo-Stufen und bestCombo wie bisher; falsch setzt Combo zurück, teilweise nicht', () => { /* … */ })
it('secured zählt Karten, die auf 0 fallen', () => {
  // before 3, after 0 → last.secured true, secured 1; before 0, after 0 → zählt nicht
})
it('rng wird bei falsch und teilweise nicht benutzt', () => { /* wie bisher */ })
it('ausgeruht: Glückstreffer schon bei rng 0.2', () => { /* wie bisher, mit before/after */ })
it('nach der letzten Frage finished; endBattle beendet vorzeitig', () => { /* … */ })
```

- [ ] **Step 2: Rot prüfen.** `npm.cmd test -w app -- test/battle.test.ts`. Erwartet: FAIL, weil sich die Signaturen geändert haben.

- [ ] **Step 3: `battle.ts` umsetzen.** Pro Antwort:
  - `exact = Math.max(0, before − after)`
  - `dealt += exact`, `real += after − before`
  - `hp = Math.max(0, Math.round(start − dealt))`, `damage = vorheriges hp − neues hp`
  - `secured = before > 0 && after === 0`

- [ ] **Step 4: Grün prüfen.** `npm.cmd test -w app -- test/battle.test.ts`. Erwartet: PASS. Bis Task 3 meldet `tsc` Fehler in BattleScreen und Arena; das ist erwartet.

- [ ] **Step 5: Commit** `feat(game): Kampf rechnet mit dem echten Boss-Leben`.

### Task 3: Kampfbildschirm – Leben, Erholung, Abschluss

**Files:**
- Modify: `app/src/data/game.ts`
- Modify: `app/src/ui/BattleScreen.tsx`
- Modify: `app/src/ui/game/Arena.tsx`
- Modify: `app/src/ui/theme.css` (`.phase` und `.phase-up` raus; `.hp-text` und `.arena-recovery` dazu, im Stil des bestehenden HUD)
- Test: `app/test/game.test.ts`, `app/test/ui/battle.test.tsx`, `app/test/ui/arena.test.tsx`

**Interfaces:**
- Consumes: `cardLife`, `bossLife`, `isPlayable` (Task 1); `startBattle`, `applyAnswer`, `defeated`, `hpPercent` (Task 2).
- Produces in `data/game.ts`:
  - Präfix `LIFE = 'life:'`. Schlüssel: `moduleId ?? ALL_MODULES` mit `export const ALL_MODULES = '*'`.
  - `loadBossLife(key: string): Promise<number | null>`. Liest `data.hp`, wenn es eine Zahl ist.
  - `saveBossLife(key: string, hp: number, now: Date): Promise<void>`. Schreibt über `putGameItem` mit `{ hp }`.

- [ ] **Step 1: Failing tests in `game.test.ts`.**
  - Speichern und Laden geben denselben Wert zurück, und die Outbox bekommt einen `game`-Eintrag.
  - Ohne Zeile kommt `null` zurück.
  - `'*'` und `'m1'` sind getrennt.

- [ ] **Step 2: Rot prüfen.** Danach `loadBossLife` und `saveBossLife` umsetzen und grün prüfen: `npm.cmd test -w app -- test/game.test.ts`.

- [ ] **Step 3: Failing UI-Tests in `battle.test.tsx`.** Die bestehenden Tests zu Leben, Besiegt und Geflohen anpassen. Werte nicht hart kodieren, die aus FSRS kommen. Die Helfer `cards(n)`, `right()`, `wrong()` und `next()` gibt es schon. Neue oder geänderte Tests:
  - **„zeigt Boss mit Modulnamen und vollem Leben“:** 2 neue Karten. Erwartet: `aria-valuenow` 100 und Text `20 / 20`.
  - **„neue Karten machen den Boss stärker: Leben über das ganze Modul“:** 30 neue Karten im Modul. Erwartet: Text `300 / 300`, obwohl der Kampf nur 25 Karten zieht (`UNIT_SIZE`).
  - **„richtige Antwort senkt das Leben ehrlich, falsche lässt es stehen“:**
    - Nach `right()` per `vi.waitFor` warten, bis `aria-valuenow` unter 100 liegt.
    - `.fx-damage` zeigt `-N` mit N gleich der Differenz der Zahlen in `.hp-text`.
    - Nach `wrong()` bleibt der Text gleich, und `.arena` hat `boss-attacks`.
  - **„Abschluss zeigt vorher → nachher“:**
    - 2 Karten richtig beantworten.
    - Überschrift „Geschwächt“.
    - Text matcht `/^20 → \d+$/`.
    - `/Leben in dieser Runde/`.
    - `/^Noch \d+ %$/`.
    - Zusammenfassung mit richtig/teilweise/falsch, „Höchste Combo: 2“ und Pause wie bisher.
  - **„Endgültig besiegt, wenn das Modul danach ganz sicher sitzt“:**
    - 1 Karte mit State Stabilität ≥ 20, letzte Wiederholung vor 30 Tagen. Sie ist fällig, verliert durch Verblassen etwas Leben und wird mit „richtig“ wieder sicher.
    - Überschrift „Endgültig besiegt!“ und „1 Karte sitzt jetzt sicher“.
    - Falls FSRS dafür keinen passenden State liefert, den State so wählen, dass `cardLife` nach der Wiederholung 0 ist. Im Test mit `cardLife` prüfen.
  - **„Beenden ohne Antwort: Hält stand“:** Überschrift „Hält stand“, `onFinished` mit 0.
  - **„Erholung beim Start“:**
    - `saveBossLife('m1', 15, NOW)`, 2 neue Karten.
    - Erwartet: Text „{Bosstitel} hat sich erholt: 15 → 20“. Den Bosstitel über `bossFor` ermitteln.
    - Nach der ersten Antwort ist die Meldung weg.
  - **„keine Erholungsmeldung ohne gespeichertes Leben oder bei weniger als 1“:** Mit `saveBossLife('m1', 20, NOW)` gibt es keinen Text „hat sich erholt“.
  - **„Kampfende speichert das angezeigte Endleben“:**
    - Nach dem Abschluss gilt per `vi.waitFor`: `loadBossLife('m1')` ist gleich der Zahl rechts vom Pfeil.
    - Bei einem Kampf ohne Modul wird unter `'*'` gespeichert.
  - **„Speichern des Endlebens schlägt fehl: Abschluss erscheint trotzdem“:** `db.game.put` mit `vi.spyOn` werfen lassen.
  - **„Speichern schlägt fehl: kein Schaden“:** Bleibt, mit Text `20 / 20`.
  - **Entfernen:** alle Erwartungen zu „Phase“, „Er steht wieder auf“ und festen Schadenszahlen (`-10`, `75`, `50`). Den Test „reduzierte Bewegung: Leben sinkt trotzdem“ auf „unter 100“ umstellen.
  - **`arena.test.tsx`:** Battle-Objekte über das neue `startBattle(n, life)` bauen.

- [ ] **Step 4: Rot prüfen.** `npm.cmd test -w app -- ui/battle ui/arena`. Erwartet: FAIL.

- [ ] **Step 5: Umsetzen.**
  - **Laden** in BattleScreen:
    - `life = bossLife(valid, map, t, s.retention)` (`valid` ist die geprüfte Kartenliste, bereits mit `validate` gefiltert).
    - `saved = await loadBossLife(key)`.
    - `recovery = saved !== null && Math.round(life.hp) − saved >= 1 ? { from: saved, to: Math.round(life.hp) } : null`.
    - `startBattle(ids.length, life)`.
  - **Antwort:**
    - Im `recordReview`-Callback `prev` merken, das Ergebnis heißt `res`.
    - `before = cardLife(prev, t, retention)`, `after = cardLife(res.state, t, retention)`.
    - Dann `applyAnswer(…, { outcome, elapsedDays, before, after }, …)`.
    - Die Erholungsmeldung verschwindet mit der ersten Antwort (`turn > 0`).
  - **Kampfende:** Im bestehenden `done`-Effekt einmal `saveBossLife(key, battle.hp, now()).catch(() => {})` aufrufen.
  - **Abschluss:**
    - Überschrift: `defeated(final)` ergibt „Endgültig besiegt!“. Sonst `final.startHp > final.hp` ergibt „Geschwächt“, sonst „Hält stand“.
    - Darunter wie heute `name`.
    - Dann `{startHp} → {hp}`, `−{startHp − hp} Leben in dieser Runde` (nur wenn > 0), `Noch {hpPercent} %`.
    - Bei `secured > 0` der Satz mit der Kartenzahl, für 1 und für N.
    - Danach Zusammenfassung, Combo, übersprungene Karten und Pause wie heute.
  - **Arena:**
    - Neben der Leiste `<span className="hp-text pixel">{hp} / {maxHp}</span>`.
    - `.fx-damage` nur bei `damage > 0`.
    - Phase-Anzeige und `phase-up`-Callout entfernen.
    - Neuer Prop `recovery: { from: number; to: number } | null`. Solange `turn === 0` und `recovery` gesetzt ist, steht `<p className="arena-recovery pixel" role="status">{boss.title} hat sich erholt: {from} → {to}</p>`.

- [ ] **Step 6: Grün prüfen.** `npm.cmd test -w app -- ui/battle ui/arena game` und `npx.cmd tsc -p app --noEmit`. Erwartet: PASS. `tsc` meldet nur noch `MapDialog`-Fehler aus Task 1.

- [ ] **Step 7: Commit** `feat(ui): Kampf zeigt das echte Boss-Leben, Erholung und Abschluss vorher → nachher`.

### Task 4: Karte zeigt Boss-Leben

**Files:**
- Modify: `app/src/ui/game/MapDialog.tsx:60-92`
- Test: `app/test/ui/camp.test.tsx`

**Interfaces:**
- Consumes: `ModuleView.life: number | null` (Task 1).

- [ ] **Step 1: Failing tests in `camp.test.tsx`.**
  - „Bedrohung 67 %“ wird zu „Boss-Leben x %“. Den Wert über `lifePercent(bossLife(...))` mit denselben Testdaten berechnen.
  - Der Test „unerforschtes Modul ohne Bedrohung“ wird geteilt:
    - Modul nur mit neuen Karten → „Boss-Leben 100 %“.
    - Modul ohne Karten → „Noch unerforscht“.
  - Die Regionsüberschrift zeigt den höchsten Wert als „Boss-Leben x %“, wenn er > 0 ist.

- [ ] **Step 2: Rot prüfen.** `npm.cmd test -w app -- ui/camp`. Erwartet: FAIL.

- [ ] **Step 3: Umsetzen.** In MapDialog `threat` durch `life` ersetzen und die Texte wie oben setzen. Die CSS-Klassen `threat` und `threat-bar` dürfen bleiben.

- [ ] **Step 4: Alles prüfen.** `npm.cmd test` und `npx.cmd tsc -p app --noEmit`. Erwartet: alle Tests grün, keine Typfehler.

- [ ] **Step 5: Sichtprüfung.**
  - Temporär `app/vcheck.html` und `app/src/vcheck.tsx` mit Beispieldaten anlegen (Muster aus Teil 3). Card-Objekte brauchen alle Base-Felder.
  - Dev-Server `app-dev` starten und am Handy-Format (375×812) prüfen:
    - Kampf mit Erholungsmeldung
    - Treffer mit „−N“
    - Abschluss-Bildschirm
    - Karte mit „Boss-Leben“
  - Screenshot für den Nutzer machen. Danach die vcheck-Dateien löschen.

- [ ] **Step 6: Alte Spec verweisen.** In `docs/superpowers/specs/2026-11-20-spielschicht-stufe-1b-design.md` unter 6.5 bei „zwei Arten von Boss-Leben“ und „Nur Gelerntes zählt“ den Hinweis „*Ersetzt durch `2026-11-25-boss-leben-design.md`.*“ ergänzen.

- [ ] **Step 7: Commit** `feat(ui): Karte zeigt Boss-Leben statt Bedrohung` (mit der Spec-Änderung).
