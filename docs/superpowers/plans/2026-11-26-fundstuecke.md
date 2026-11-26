# Fundstücke, Forschung und Gestalten – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Echte Kämpfe bringen Fundstücke in einer leuchtenden Truhe. Funde werden durch Behalten erforscht, im Sammelbuch gesammelt und im Gewächshaus aufgestellt. Dazu kommen bessere Erde und Tageszeit.

**Architecture:**
- **Reine Logik** in `app/src/game/finds.ts`:
  - Katalog der 36 Stücke.
  - Drop-Regeln, Würfeln, Doppelte/Dünger.
  - Forschungsregeln, Hinweistext.
- **Daten** in `app/src/data/finds.ts`, nur über die bestehende Spieltabelle `game` (`putGameItem`, Outbox, Sync). Ein Fund ist ein unveränderlicher Datensatz. Geöffnet, erforscht und gemeldet sind eigene kleine Datensätze, damit „neueste Änderung gewinnt“ nie einen Status überschreibt.
- **UI:**
  - `BattleScreen`: Fund-Blitz während des Kampfs, `Chest` vor dem Ergebnis.
  - Neuer `CollectionScreen` (Sammelbuch).
  - `GreenhouseScreen`: Gestalten-Modus, Erde, Tageszeit, Forschungsmeldung.
- **Grafik:** PixelLab, mit festem Haltepunkt nach dem Stil-Entwurf.

**Tech Stack:** React 18, TypeScript, Dexie, ts-fsrs, Vitest + Testing Library (jsdom, fake-indexeddb), PixelLab MCP, `app/scripts/slice_assets.py`.

**Spec:** `docs/superpowers/specs/2026-11-26-fundstuecke-design.md`

## Global Constraints

- **„Richtig“** = Ergebnis nicht `'wrong'` (also `'right'` oder `'partial'`), für Funde und für Forschung.
- **Zählende Antwort:**
  - Richtig.
  - Die Karte hatte vorher keinen State oder keine `last_review` an diesem Lerntag (`studyDay`, Grenze 04:00).
- **Drops pro Kampf:**
  - `third`: bei der 3. zählenden richtigen Antwort.
  - `combo`: bei einer zählenden Antwort mit Combo ≥ 5, einmal.
  - `rested`: nur wenn ausgeruht, bei der 4. zählenden Antwort.
  - Höchstens 3 (`MAX_FINDS = 3`).
- **Seltenheit:**
  - Normal: 80/17/3 (gewöhnlich/selten/legendär).
  - Ausgeruht (alle Funde des Kampfs) und Combo-Fund: 65/28/7.
  - Das Stück wird gleichverteilt aus der Region mit dieser Seltenheit gewählt.
- **Region** = Region des Bosses des Moduls der Karte (`assignBosses`), auch im Kampf über alle Module. Unbekanntes Modul: `'wald'`.
- **Doppelt:** Ein Fund ist doppelt, wenn es einen früheren Fund desselben Stücks gibt (Reihenfolge nach `foundAt`, dann `id`). Das wird beim Lesen abgeleitet und nie gespeichert. Jeder doppelte Fund ist 1 Dünger.
- **Erde:**
  - Stufe 0–3 je Modul, Kosten 2 / 4 / 6 (`SOIL_COST = [2, 4, 6]`).
  - Dünger = doppelte Funde − ausgegebener Dünger, nie unter 0.
  - Pflanzen sind je Stufe +8 % breiter und kräftiger gefärbt; ab Stufe 3 glitzern sie.
- **Forschung:**
  - Ein Stück ist erforscht, sobald ein Fund davon erforscht ist.
  - Fund erforscht, wenn eine der folgenden Regeln gilt:
    - **Antwort:** richtige Antwort auf seine Karte an einem Lerntag > Fundtag.
    - **Kartenzustand:** `last_review` an einem Lerntag > Fundtag und `state !== State.Relearning`.
    - **Karte gelöscht oder fehlt:** heute > Fundtag und ein Thema des Moduls sitzt jetzt sicher (alle spielbaren, nicht gelöschten Karten `isSecure`).
  - Einmal gespeichert, bleibt es erforscht.
- **Spieltabelle, ID-Präfixe:**
  - `find:<id>`, `opened:<id>`, `researched:<id>`, `told:<id>`.
  - `place:<slotId>`, `soil:<moduleId>`.
  - Kein Schema-Wechsel, kein `schema.sql`.
- **Texte (Deutsch, Du-Form):**
  - Kampf: Blitz „✨ Fund!“.
  - Truhe:
    - Überschrift „Eine Truhe!“.
    - Knöpfe „Truhe öffnen“, „Überspringen“, „Nächster Fund“, „Zum Ergebnis“.
    - Doppelt: „doppelt → +1 Dünger“. Neu: „Neu! Wird erforscht, wenn du die Karte an einem anderen Tag wieder weißt.“
  - Seltenheiten: „Gewöhnlich“, „Selten“, „Legendär“.
  - Sammelbuch:
    - Überschrift „Sammelbuch“, „Dünger: N“, Abschnitt „Wird erforscht“.
    - Kopfzeile je Region „Wald 3/6“. Fehlendes Feld „?“ mit `aria-label="Unbekanntes Stück"`.
    - Knopf „Zurück“.
  - Forschungshinweis:
    - `erforscht, wenn du ‚<Frage>‘ heute|morgen|in N Tagen wieder weißt`.
    - Gelöschte Karte: `erforscht, sobald ein Thema aus <Modul> sicher sitzt`.
    - Fragen über 60 Zeichen werden auf 59 Zeichen + „…“ gekürzt.
  - Gewächshaus:
    - Knöpfe „Sammelbuch“, „Gestalten“ / „Fertig“.
    - Meldung „1 Fund erforscht!“ / „N Funde erforscht!“.
    - Platz-Auswahl mit „Leer“ und „Abbrechen“.
    - Erde: „Erde: Stufe L/3 · Dünger: N“, Knopf „Verbessern (K Dünger)“, bei Stufe 3 „Beste Erde erreicht“.
  - Szenenmenü: Knopf „Sammelbuch“.
- **Tageszeit** (Geräteuhr):
  - Morgen 6–10 (`morgen`), Tag 10–17 (`tag`), Abend 17–21 (`abend`), Nacht 21–6 (`nacht`).
  - Nur eine Farbschicht. Nachts leuchten Funde stärker und es gibt Glühwürmchen.
- **Bewegung:**
  - Truhe und Blitz blockieren nie das Antworten.
  - Bei `prefers-reduced-motion: reduce` gibt es kein Drehen, Pulsieren, Glitzern oder Fliegen, nur ruhiges Leuchten.
- **Grafik:**
  - PixelLab nur zur Bauzeit, Stil nach `app/public/game/STIL.md`.
  - Dateien: `app/public/game/finds/<id>.png`, `truhe_zu.png`, `truhe_offen.png`.
  - Fester Haltepunkt nach dem Stil-Entwurf (Task 8).
- **Befehle** (aus dem Repo-Wurzelordner):
  - Einzeltest: `npx.cmd vitest run <datei>`. Kein `-t`, weil die Anführungszeichen unter Windows brechen.
  - Alle Tests: `npm.cmd test`.
  - Typen: `npx.cmd tsc -p app --noEmit`.
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Sync-Konflikt.** Dasselbe Stück wird auf zwei Geräten gefunden, oder dasselbe Stück steht nach dem Sync auf zwei Plätzen. Erwartet: genau ein Stück zählt, der andere Fund ist Dünger, das Stück steht nur auf dem zuletzt geänderten Platz. Tests in Task 2.
2. **App mitten im Kampf geschlossen** nach einem Fund. Erwartet: Die nächste Truhe (auch aus einem Kampf ohne neue Funde) zeigt ihn. Test in Task 4.
3. **Speichern eines Funds schlägt fehl** (z. B. Speicher voll). Erwartet: Antwort und Kampf laufen weiter, kein Absturz. Test in Task 3.
4. **Karte nach dem Fund gelöscht.** Erwartet: Der Fund hängt nicht für immer; er wird über ein sicheres Thema des Moduls erforscht. Test in Task 2.
5. **Sehr lange Frage im Forschungshinweis.** Erwartet: gekürzt, kein Umbruch über den Bildschirm. Test in Task 1.

---

### Task 1: Katalog und Regeln (reine Logik)

**Files:**
- Create: `app/src/game/finds.ts`
- Modify: `app/src/game/bosses.ts` (neue Funktion `regionForModule`)
- Modify: `app/src/cards/prepare.ts` (`questionText` exportieren)
- Test: `app/test/finds.test.ts`

**Interfaces:**
- Consumes:
  - `studyDay(date: Date): string` aus `@lernapp/shared`.
  - `SrsState` aus `app/src/srs/scheduler`, `State` aus `ts-fsrs`.
  - `RegionId`, `assignBosses`, `gameAsset` aus `bosses.ts`.
  - `Outcome` aus `srs/grading`, `Rng` aus `ui/random`.
- Produces:
  ```ts
  // finds.ts
  export type Rarity = 'common' | 'rare' | 'legendary'
  export type FindItem = { id: string; region: RegionId; rarity: Rarity; name: string }
  export const FIND_ITEMS: FindItem[]                       // 36, Reihenfolge = Region, dann gewöhnlich→legendär
  export const RARITY_NAMES: Record<Rarity, string>         // Gewöhnlich / Selten / Legendär
  export const RARITY_ORDER: Rarity[]                       // ['common','rare','legendary']
  export function itemById(id: string): FindItem | undefined
  export function itemSize(item: FindItem): 'small' | 'large' // legendär = large
  export function findImage(id: string): string             // gameAsset(`finds/${id}.png`)
  export const CHEST_IMAGES: { closed: string; open: string } // finds/truhe_zu.png, finds/truhe_offen.png
  export const MAX_FINDS = 3
  export type DropKind = 'third' | 'combo' | 'rested'
  export type LootRun = { counted: number; given: DropKind[] }
  export const EMPTY_RUN: LootRun
  export function countsForLoot(prev: SrsState | undefined, outcome: Outcome, now: Date): boolean
  export function nextDrops(run: LootRun, a: { counts: boolean; combo: number }, rested: boolean): { run: LootRun; drops: DropKind[] }
  export function oddsFor(kind: DropKind, rested: boolean): Record<Rarity, number>
  export function rollFind(kind: DropKind, rested: boolean, region: RegionId, rng: Rng): FindItem
  export type Find = { id: string; item: string; rarity: Rarity; region: RegionId; cardId: string; topicId: string; moduleId: string; foundAt: string; foundDay: string }
  export type FindStatus = Find & { opened: boolean; researchedAt: string | null; told: boolean }
  export type Owned = { item: FindItem; finds: FindStatus[]; researched: boolean }
  export function isDuplicate(find: Find, all: Find[]): boolean
  export function collection(finds: FindStatus[]): Map<string, Owned>   // itemId → Owned
  export const SOIL_COST = [2, 4, 6]
  export const MAX_SOIL = 3
  export function soilSpent(levels: Iterable<number>): number           // 0,2,6,12 je Stufe aufsummiert
  export function fertilizer(finds: Find[], levels: Iterable<number>): number
  export function researchedByState(find: Find, state: SrsState | undefined): boolean
  export function researchedByModule(find: Find, topicSecureNow: boolean, now: Date): boolean
  export function researchHint(a: { question: string | null; moduleName: string; due: Date | null; foundDay: string; now: Date }): string
  // bosses.ts
  export function regionForModule(moduleId: string, modules: Pick<Module, 'id'>[], chosen?: AreaChoices): RegionId
  // prepare.ts
  export function questionText(d: Pick<CardDraft, 'type' | 'payload'>): string
  ```

**Katalog (feste Namen und IDs, je Region 4 gewöhnlich, 1 selten, 1 legendär):**

| Region | gewöhnlich | selten | legendär |
|---|---|---|---|
| wald | `leuchtpilze` Leuchtpilze, `moosstein` Moosstein, `baumstumpf` Moosiger Baumstumpf, `farn` Farnbüschel | `eulenstatue` Eulenstatue | `waldteich` Waldteich |
| sumpf | `rohrkolben` Rohrkolben, `giftpilz` Giftpilz, `wurzel` Knorrige Wurzel, `froschstein` Froschstein | `irrlicht` Irrlicht-Laterne | `sporenbaum` Sporenbaum |
| kristallberge | `kristallgruppe` Kristallgruppe, `bergkristall` Bergkristall, `geode` Geode, `eisstein` Eisstein | `runenstein` Runenstein | `kristallbrunnen` Kristallbrunnen |
| kueste | `muschel` Muschel, `koralle` Koralle, `seestern` Seestern, `treibholz` Treibholz | `perlmuschel` Perlmuschel | `gezeitenbecken` Gezeitenbecken |
| arena | `bronzehelm` Bronzehelm, `rundschild` Rundschild, `saeulenstumpf` Säulenstumpf, `amphore` Amphore | `siegerpokal` Siegerpokal | `titanenstatue` Titanenstatue |
| vulkan | `glutstein` Glutstein, `obsidian` Obsidian, `ascheblume` Ascheblume, `schwefelkristall` Schwefelkristall | `phoenixfeder` Phönixfeder | `glutbaum` Glutbaum |

- [ ] **Step 1: Write the failing tests** in `app/test/finds.test.ts`. Make dates with the local-time constructor `new Date(y, m, d, h)`. Use a helper `seq(...values)` that returns an rng giving these values in order.

```ts
it('Katalog: 36 Stücke, je Region 4/1/1, eindeutige IDs', () => {
  expect(FIND_ITEMS).toHaveLength(36)
  expect(new Set(FIND_ITEMS.map((i) => i.id)).size).toBe(36)
  for (const r of REGIONS) {
    const own = FIND_ITEMS.filter((i) => i.region === r.id)
    expect(own.map((i) => i.rarity).sort()).toEqual(['common', 'common', 'common', 'common', 'legendary', 'rare'])
  }
  expect(itemSize(itemById('waldteich')!)).toBe('large')
  expect(itemSize(itemById('moosstein')!)).toBe('small')
})

it('countsForLoot: nur richtig und nur erste Antwort des Lerntags', () => {
  const now = new Date(2026, 2, 10, 10)
  const earlierToday = { ...newSrsState(now), last_review: new Date(2026, 2, 10, 5).toISOString() }
  const yesterday = { ...newSrsState(now), last_review: new Date(2026, 2, 10, 3).toISOString() } // vor 04:00 = Vortag
  expect(countsForLoot(undefined, 'right', now)).toBe(true)
  expect(countsForLoot(undefined, 'partial', now)).toBe(true)
  expect(countsForLoot(undefined, 'wrong', now)).toBe(false)
  expect(countsForLoot(earlierToday, 'right', now)).toBe(false)
  expect(countsForLoot(yesterday, 'right', now)).toBe(true)
})

it('nextDrops: dritte zählende Antwort, nicht zählende werden übersprungen', () => {
  let run = EMPTY_RUN; const all: DropKind[] = []
  for (const counts of [true, false, true, false, true]) {
    const r = nextDrops(run, { counts, combo: 1 }, false); run = r.run; all.push(...r.drops)
  }
  expect(all).toEqual(['third'])
})

it('nextDrops: ausgeruht bei der vierten, Combo 5 einmal, nie mehr als 3', () => {
  let run = EMPTY_RUN; const all: DropKind[] = []
  for (let i = 1; i <= 12; i++) {
    const r = nextDrops(run, { counts: true, combo: i }, true); run = r.run; all.push(...r.drops)
  }
  expect(all).toEqual(['third', 'rested', 'combo'])
})

it('nextDrops: Combo 5 auf einer nicht zählenden Antwort wartet auf die nächste zählende', () => {
  const a = nextDrops({ counted: 3, given: ['third'] }, { counts: false, combo: 5 }, false)
  expect(a.drops).toEqual([])
  expect(nextDrops(a.run, { counts: true, combo: 6 }, false).drops).toEqual(['combo'])
})

it('oddsFor: normal 80/17/3, ausgeruht oder Combo 65/28/7', () => {
  expect(oddsFor('third', false)).toEqual({ common: 0.8, rare: 0.17, legendary: 0.03 })
  expect(oddsFor('third', true)).toEqual({ common: 0.65, rare: 0.28, legendary: 0.07 })
  expect(oddsFor('combo', false)).toEqual({ common: 0.65, rare: 0.28, legendary: 0.07 })
})

it('rollFind: erster Wurf Seltenheit, zweiter Wurf Stück der Region', () => {
  expect(rollFind('third', false, 'wald', seq(0.5, 0)).id).toBe('leuchtpilze')
  expect(rollFind('third', false, 'wald', seq(0.5, 0.99)).id).toBe('farn')
  expect(rollFind('third', false, 'wald', seq(0.81, 0)).id).toBe('eulenstatue')
  expect(rollFind('third', false, 'vulkan', seq(0.975, 0)).id).toBe('glutbaum')
  expect(rollFind('combo', false, 'wald', seq(0.94, 0)).id).toBe('waldteich')
})

it('isDuplicate und fertilizer: früherer Fund gewinnt, auch bei gleichem Zeitpunkt (nach id)', () => {
  const f = (id: string, item: string, at: string): Find => ({ id, item, rarity: 'common', region: 'wald', cardId: 'c', topicId: 't', moduleId: 'm', foundAt: at, foundDay: '2026-03-10' })
  const a = f('b', 'moosstein', '2026-03-10T10:00:00Z'), b = f('a', 'moosstein', '2026-03-10T10:00:00Z'), c = f('c', 'farn', '2026-03-09T10:00:00Z')
  expect(isDuplicate(a, [a, b, c])).toBe(true)
  expect(isDuplicate(b, [a, b, c])).toBe(false)
  expect(fertilizer([a, b, c], [])).toBe(1)
  expect(soilSpent([1, 2, 3])).toBe(2 + 6 + 12)
  expect(fertilizer([a, b, c], [1])).toBe(0) // nie negativ
})

it('collection: Stück erforscht, sobald ein Fund erforscht ist', () => { /* zwei FindStatus desselben Stücks, einer mit researchedAt → researched true; ohne → false */ })

it('researchedByState: späterer Lerntag und nicht im Wiederlernen', () => {
  const find = { foundDay: '2026-03-10' } as Find
  const review = (at: Date, state: State) => ({ ...newSrsState(at), last_review: at.toISOString(), state })
  expect(researchedByState(find, review(new Date(2026, 2, 11, 3), State.Review))).toBe(false) // 03:00 = noch 10.
  expect(researchedByState(find, review(new Date(2026, 2, 11, 5), State.Review))).toBe(true)
  expect(researchedByState(find, review(new Date(2026, 2, 11, 5), State.Relearning))).toBe(false)
  expect(researchedByState(find, undefined)).toBe(false)
})

it('researchedByModule: nur an einem späteren Tag und wenn ein Thema sitzt', () => {
  const find = { foundDay: '2026-03-10' } as Find
  expect(researchedByModule(find, true, new Date(2026, 2, 10, 20))).toBe(false)
  expect(researchedByModule(find, false, new Date(2026, 2, 11, 5))).toBe(false)
  expect(researchedByModule(find, true, new Date(2026, 2, 11, 5))).toBe(true)
})

it('researchHint: heute/morgen/in N Tagen, frühestens am Tag nach dem Fund', () => {
  const now = new Date(2026, 2, 10, 10)
  const base = { question: 'Was sind Moose?', moduleName: 'Bio', foundDay: '2026-03-10', now }
  expect(researchHint({ ...base, due: new Date(2026, 2, 10, 12) })).toBe('erforscht, wenn du ‚Was sind Moose?‘ morgen wieder weißt')
  expect(researchHint({ ...base, due: new Date(2026, 2, 13, 12) })).toBe('erforscht, wenn du ‚Was sind Moose?‘ in 3 Tagen wieder weißt')
  expect(researchHint({ ...base, foundDay: '2026-03-08', due: new Date(2026, 2, 9, 12) })).toBe('erforscht, wenn du ‚Was sind Moose?‘ heute wieder weißt')
  expect(researchHint({ ...base, question: null, due: null })).toBe('erforscht, sobald ein Thema aus Bio sicher sitzt')
})

it('researchHint: lange Frage wird auf 60 Zeichen gekürzt', () => {
  const q = 'x'.repeat(100)
  const hint = researchHint({ question: q, moduleName: 'Bio', due: new Date(2026, 2, 11, 12), foundDay: '2026-03-10', now: new Date(2026, 2, 10, 10) })
  expect(hint).toContain(`‚${'x'.repeat(59)}…‘`)
})

it('regionForModule: Region des zugewiesenen Bosses, unbekannt = wald', () => {
  expect(regionForModule('m1', [{ id: 'm1' }], new Map([['m1', 'aschephoenix']]))).toBe('vulkan')
  expect(regionForModule('fehlt', [{ id: 'm1' }])).toBe('wald')
})
```

Write the `collection` test with concrete objects the way the comment says.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx.cmd vitest run app/test/finds.test.ts`
Expected: FAIL, because `../src/game/finds` cannot be resolved.

- [ ] **Step 3: Implement `finds.ts`, `regionForModule`, and export `questionText`**
  - **Rarity roll:** one `rng()` value `r`. It is common if `r < odds.common`, rare if `r < odds.common + odds.rare`, otherwise legendary.
  - **Item pick:** `pool[Math.floor(rng() * pool.length)]`, where `pool` is the items of that region and rarity, in catalog order.
  - **`nextDrops`:** if `counts` is false, return `run` unchanged and no drops. Otherwise `counted + 1`, then check in this order, while `given.length < MAX_FINDS`:
    - `third` when `counted === 3`
    - `rested` when `rested && counted === 4`
    - `combo` when `combo >= 5` and not yet given
  - **`researchHint`:**
    - Days = max(studyDay of `due`, foundDay + 1 day, today) minus today, counted in calendar days on the `YYYY-MM-DD` strings (via `Date.UTC`).
    - The question is trimmed; if longer than 60 characters, it becomes the first 59 characters plus „…“.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx.cmd vitest run app/test/finds.test.ts`
Expected: PASS. Then `npx.cmd vitest run app/test/cards/prepare.test.ts` stays green.

- [ ] **Step 5: Commit**

```bash
git add app/src/game/finds.ts app/src/game/bosses.ts app/src/cards/prepare.ts app/test/finds.test.ts
git commit -m "feat(game): Fundstücke – Katalog, Drop-Regeln, Seltenheit, Forschungsregeln"
```

---

### Task 2: Datenschicht für Funde, Plätze und Erde

**Files:**
- Create: `app/src/data/finds.ts`
- Test: `app/test/findsData.test.ts`

**Interfaces:**
- Consumes:
  - `putGameItem(item: GameItem)` from `data/game.ts`, `db` from `data/db.ts`.
  - Task 1: `Find`, `FindStatus`, `researchedByState`, `researchedByModule`, `fertilizer`, `SOIL_COST`, `MAX_SOIL`.
  - `isSecure`, `isPlayable` from `game/mastery`, `loadSettings` from `data/settings`.
- Produces:
  ```ts
  export async function saveFind(find: Find): Promise<void>                       // id 'find:'+find.id, updatedAt = find.foundAt
  export async function loadFinds(): Promise<FindStatus[]>                        // sorted by foundAt, id
  export async function markOpened(ids: string[], now: Date): Promise<void>
  export async function markTold(ids: string[], now: Date): Promise<void>
  export async function researchByAnswer(cardId: string, now: Date): Promise<number> // unresearched finds of the card with foundDay < studyDay(now)
  export async function checkResearch(now: Date): Promise<number>                 // card-state and module rules; number newly researched
  export type Design = { placements: Map<string, string>; soil: Map<string, number> } // slotId → itemId, moduleId → level
  export async function loadDesign(): Promise<Design>
  export async function placeItem(slotId: string, itemId: string | null, design: Design, now: Date): Promise<void>
  export async function raiseSoil(moduleId: string, now: Date): Promise<number>   // new level; throws Error('Nicht genug Dünger') / Error('Beste Erde erreicht')
  ```
  - Stored `data`:
    - `find:` → the `Find` without `id`.
    - `opened:` / `researched:` / `told:` → `{ at: ISO }`.
    - `place:` → `{ item: string | null }`.
    - `soil:` → `{ level: number }`.

- [ ] **Step 1: Write the failing tests.** Use fake-indexeddb, clear the db in `beforeEach` like `app/test/game.test.ts`, and use a helper `find(over)`.

```ts
it('saveFind + loadFinds: Fund samt Status; landet in der Outbox', async () => {
  await saveFind(find({ id: 'f1' }))
  await markOpened(['f1'], NOW)
  const [f] = await loadFinds()
  expect(f).toMatchObject({ id: 'f1', item: 'moosstein', opened: true, researchedAt: null, told: false })
  expect((await db.outbox.toArray()).map((e) => e.kind)).toEqual(['game', 'game'])
})

it('researchByAnswer: nur Funde dieser Karte von einem früheren Lerntag', async () => {
  await saveFind(find({ id: 'alt', cardId: 'a', foundDay: '2026-03-09' }))
  await saveFind(find({ id: 'heute', cardId: 'a', foundDay: '2026-03-10' }))
  await saveFind(find({ id: 'andere', cardId: 'b', foundDay: '2026-03-09' }))
  expect(await researchByAnswer('a', new Date(2026, 2, 10, 10))).toBe(1)
  const byId = new Map((await loadFinds()).map((f) => [f.id, f.researchedAt]))
  expect(byId.get('alt')).not.toBeNull()
  expect(byId.get('heute')).toBeNull()
  expect(byId.get('andere')).toBeNull()
})

it('checkResearch: aus dem Kartenzustand, schon erforschte bleiben unverändert', async () => { /* card a + state with last_review on a later day, State.Review → 1; second call → 0 */ })

it('checkResearch: gelöschte Karte – erforscht, sobald ein Thema des Moduls sicher sitzt', async () => {
  // Fund für Karte 'weg' (deleted: true) in Modul m1, foundDay gestern; Thema t2 in m1 mit einer Karte, deren State isSecure ist.
  // → 1; ohne sichere Karte → 0
})

it('Sync-Konflikt: zwei Funde desselben Stücks → einer ist doppelt (1 Dünger)', async () => {
  await saveFind(find({ id: 'x', item: 'farn', foundAt: '2026-03-10T09:00:00.000Z' }))
  await saveFind(find({ id: 'y', item: 'farn', foundAt: '2026-03-10T08:00:00.000Z' }))
  expect(fertilizer(await loadFinds(), [])).toBe(1)
})

it('placeItem: Stück zieht um, alter Platz wird leer', async () => {
  let d = await loadDesign()
  await placeItem('gang-links', 'farn', d, NOW)
  d = await loadDesign()
  await placeItem('gang-rechts', 'farn', d, NOW)
  d = await loadDesign()
  expect([...d.placements]).toEqual([['gang-rechts', 'farn']])
})

it('loadDesign: dasselbe Stück auf zwei Plätzen (Sync) → nur der neueste zählt', async () => {
  await db.game.bulkPut([
    { id: 'place:gang-links', data: { item: 'farn' }, updatedAt: '2026-03-10T08:00:00.000Z' },
    { id: 'place:tuer-links', data: { item: 'farn' }, updatedAt: '2026-03-10T09:00:00.000Z' },
  ])
  expect([...(await loadDesign()).placements]).toEqual([['tuer-links', 'farn']])
})

it('raiseSoil: kostet 2/4/6 Dünger, zu wenig wirft', async () => {
  // 2 doppelte Funde → raiseSoil('m1') === 1; erneut → wirft 'Nicht genug Dünger'; Stufe bleibt 1
})
```

Write the three tests marked with comments using the data the comments describe.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx.cmd vitest run app/test/findsData.test.ts`
Expected: FAIL, because `../src/data/finds` cannot be resolved.

- [ ] **Step 3: Implement `app/src/data/finds.ts`**
  - Read with `db.game.where('id').startsWith(prefix)`.
  - `checkResearch`:
    - Loads cards, states, settings, the finds and the existing `researched:` IDs.
    - For each unresearched find, apply the rules in order:
      - The card exists and is not deleted: `researchedByState`.
      - Otherwise: `researchedByModule`, with `topicSecureNow` = some topic of `find.moduleId` whose playable, non-deleted cards are all `isSecure` (at least 1 card).
    - Writes `researched:<id>`.
  - `placeItem` writes `place:` rows with `item: null` for every other slot that holds the item, then the target slot.
  - `raiseSoil` reads the current level, takes `cost = SOIL_COST[level]`, and checks `fertilizer(finds, allLevels) >= cost` before writing.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx.cmd vitest run app/test/findsData.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/data/finds.ts app/test/findsData.test.ts
git commit -m "feat(data): Funde, Forschung, Plätze und Erde in der Spieltabelle"
```

---

### Task 3: Funde im Kampf (Blitz, Speichern, Forschung bei der Antwort)

**Files:**
- Modify: `app/src/ui/BattleScreen.tsx` (in `answer`, plus a new `flash` state)
- Modify: `app/src/ui/theme.css` (`.find-flash`)
- Test: `app/test/ui/findsBattle.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `countsForLoot`, `nextDrops`, `EMPTY_RUN`, `rollFind`, `regionForModule`, `type LootRun`.
  - Task 2: `saveFind`, `researchByAnswer`.
- Produces: one `find:` row per find, created during the battle with `id = crypto.randomUUID()`, `foundDay = studyDay(t)`, and `topicId` / `moduleId` / `cardId` of the card. The text „✨ Fund!“ shows on screen for each find. Task 4 relies on this.

- [ ] **Step 1: Write the failing tests** (setup like `app/test/ui/battle.test.tsx`: `NOW`, `choiceCard`, `pick`, `seededRng`). Use a helper `answerRight(n)` that picks „Richtig B“ and then „Weiter“ n times.

```ts
it('dritte richtige Antwort (heute erstmals) bringt einen Fund und den Blitz', async () => {
  await db.cards.bulkPut(['a', 'b', 'c', 'd'].map((id) => choiceCard(id)))
  render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
  await answerRight(2)
  expect(screen.queryByText('✨ Fund!')).toBeNull()
  await pick(await screen.findByRole('button', { name: /Richtig B/ }))
  expect(await screen.findByText('✨ Fund!')).toBeInTheDocument()
  const finds = await loadFinds()
  expect(finds).toHaveLength(1)
  expect(finds[0]).toMatchObject({ moduleId: 'm1', topicId: 't1', foundDay: studyDay(NOW), opened: false })
})

it('Karten, die heute schon beantwortet wurden, bringen keinen Fund', async () => {
  // 4 Karten mit State: last_review = NOW − 1 h (gleicher Lerntag), due = NOW − 1 min → alle in der Lernliste
  // 4× richtig → loadFinds() hat Länge 0
})

it('ausgeruht: zweiter Fund bei der vierten zählenden Antwort', async () => {
  // 5 neue Karten, rested → nach 3 richtig: 1 Fund, nach 4: 2 Funde
})

it('nie mehr als 3 Funde pro Kampf', async () => {
  // 10 neue Karten, rested, 10× richtig → 3 Funde
})

it('Region kommt vom Modul der Karte (Kampf über alle Module)', async () => {
  // Modul m1 mit saveAreaChoice('m1', 'aschephoenix'), 3 Karten → finds[0].region === 'vulkan'
})

it('richtige Antwort an einem späteren Lerntag erforscht den Fund der Karte', async () => {
  await saveFind({ id: 'f', item: 'farn', rarity: 'common', region: 'wald', cardId: 'a', topicId: 't1', moduleId: 'm1', foundAt: '2026-03-09T10:00:00.000Z', foundDay: '2026-03-09' })
  await db.cards.bulkPut([choiceCard('a')])
  render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
  await pick(await screen.findByRole('button', { name: /Richtig B/ }))
  await vi.waitFor(async () => expect((await loadFinds())[0]!.researchedAt).not.toBeNull())
})

it('Fehler beim Speichern eines Funds hält den Kampf nicht auf', async () => {
  await db.cards.bulkPut(['a', 'b', 'c', 'd'].map((id) => choiceCard(id)))
  render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
  await answerRight(2)
  const put = vi.spyOn(db.game, 'put').mockRejectedValueOnce(new Error('voll'))
  await pick(await screen.findByRole('button', { name: /Richtig B/ }))
  await userEvent.click(await screen.findByRole('button', { name: 'Weiter' }))
  expect(await screen.findByRole('button', { name: /Richtig B/ })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).toBeNull()
  put.mockRestore()
})
```

Write the tests marked with comments using the data the comments describe. Also update the outbox count in the existing test „speichert jede Antwort und endet nach 25 Karten“ in `battle.test.tsx`: it becomes 51 + the number of finds. There the only find is `third`: the right answers come in runs of 4, so combo 5 is never reached. That makes **52**. Check the real value in Step 4 and record any difference as a ruling.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx.cmd vitest run app/test/ui/findsBattle.test.tsx`
Expected: FAIL: no „✨ Fund!“ and `loadFinds()` has length 0.

- [ ] **Step 3: Implement in `BattleScreen.answer`**
  - After `applyAnswer`, compute `nb` and call `setBattle(nb)`.
  - `counts = countsForLoot(prev, outcome, t)`.
  - `const { run, drops } = nextDrops(loot.current, { counts, combo: nb.combo }, rested)`, where `loot` is a `useRef<LootRun>(EMPTY_RUN)`.
  - For each drop: `rollFind(kind, rested, regionForModule(card.moduleId, modules, areas), rng)`, then `saveFind(...)`.
  - The flash appears only if saving succeeds: `setFlash((n) => n + 1)`.
  - If `outcome !== 'wrong'`, call `void researchByAnswer(card.id, t).catch(() => {})`.
  - Find errors are caught (`.catch(() => {})`) and never land in `saveError`.
  - Render: `{flash > 0 && <span key={flash} className="find-flash" role="status">✨ Fund!</span>}` at the top of `.battle-main`.
  - CSS: absolutely positioned, `pointer-events: none`, 1.2 s scale/fade animation with `forwards`. With reduced motion, only the fade.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx.cmd vitest run app/test/ui/findsBattle.test.tsx app/test/ui/battle.test.tsx`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git add app/src/ui/BattleScreen.tsx app/src/ui/theme.css app/test/ui/findsBattle.test.tsx app/test/ui/battle.test.tsx
git commit -m "feat(battle): Funde fallen im Kampf, Blitz „✨ Fund!“, Forschung bei der Antwort"
```

---

### Task 4: Truhe mit Seltenheits-Leuchten

**Files:**
- Create: `app/src/ui/game/Chest.tsx`
- Modify: `app/src/ui/BattleScreen.tsx` (end branch and `done` effect)
- Modify: `app/src/ui/theme.css` (`.chest`, `.glow`, `.rarity-*`, reduced-motion)
- Test: `app/test/ui/chest.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `FindItem`, `FindStatus`, `Rarity`, `RARITY_NAMES`, `RARITY_ORDER`, `itemById`, `isDuplicate`, `findImage`, `CHEST_IMAGES`; `REGIONS` from bosses.
  - Task 2: `loadFinds`, `markOpened`, `checkResearch`.
- Produces:
  ```ts
  export type ChestItem = { find: FindStatus; item: FindItem; duplicate: boolean }
  export function rarest(rarities: Rarity[]): Rarity
  export function Chest(props: { items: ChestItem[]; onDone: () => void }): JSX.Element
  ```
  - CSS classes `glow rarity-common|rarity-rare|rarity-legendary`. Task 5 and Task 6 use them for the subtle glow (`glow soft`).

- [ ] **Step 1: Write the failing tests**

```ts
it('Truhe leuchtet in der Farbe des seltensten Funds und zeigt die Funde nacheinander', async () => {
  const onDone = vi.fn()
  render(<Chest items={[item('moosstein', false), item('waldteich', false)]} onDone={onDone} />)
  expect(screen.getByRole('heading', { name: 'Eine Truhe!' })).toBeInTheDocument()
  expect(document.querySelector('.chest .glow')).toHaveClass('rarity-legendary')
  await userEvent.click(screen.getByRole('button', { name: 'Truhe öffnen' }))
  expect(screen.getByText('Moosstein')).toBeInTheDocument()
  expect(screen.queryByText('Waldteich')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Nächster Fund' }))
  expect(screen.getByText('Waldteich')).toBeInTheDocument()
  expect(screen.getByText('Legendär')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Zum Ergebnis' }))
  expect(onDone).toHaveBeenCalledTimes(1)
})

it('Überspringen zeigt alles auf einmal; doppelt → +1 Dünger', async () => {
  render(<Chest items={[item('moosstein', true), item('farn', false)]} onDone={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Überspringen' }))
  expect(screen.getByText('Moosstein')).toBeInTheDocument()
  expect(screen.getByText('Farnbüschel')).toBeInTheDocument()
  expect(screen.getByText('doppelt → +1 Dünger')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Zum Ergebnis' })).toBeInTheDocument()
})

it('rarest', () => {
  expect(rarest(['common', 'rare'])).toBe('rare')
  expect(rarest(['common'])).toBe('common')
})

it('BattleScreen: Truhe vor dem Ergebnis, danach Funde als geöffnet gespeichert', async () => {
  // 3 neue Karten, 3× richtig → „Eine Truhe!“; Überspringen, Zum Ergebnis → „3 richtig“; loadFinds() alle opened
})

it('BattleScreen: ungeöffneter Fund aus einem abgebrochenen Kampf erscheint in der nächsten Truhe', async () => {
  // saveFind(alter Fund, nicht geöffnet); 1 Karte, 1× richtig (kein neuer Fund) → „Eine Truhe!“ mit dem alten Stück
})

it('BattleScreen: ohne Funde direkt das Ergebnis', async () => {
  // 1 Karte, 1× richtig → kein „Eine Truhe!“, „1 richtig“ sichtbar
})
```

`item(id, duplicate)` builds a `ChestItem` from `itemById(id)` and a minimal `FindStatus`. Write the BattleScreen tests marked with comments using the data the comments describe.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx.cmd vitest run app/test/ui/chest.test.tsx`
Expected: FAIL, because `../../src/ui/game/Chest` cannot be resolved.

- [ ] **Step 3: Implement**
  - **`Chest` layout:**
    - Phase `closed`: heading, closed chest image in `div.glow.rarity-<rarest>`, „Truhe öffnen“ (primary), „Überspringen“.
    - Phase `open`: shown finds as a list, the newest at the top with full glow. Each find shows image, name, `RARITY_NAMES`, region name, and the duplicate or new text from Global Constraints.
    - Buttons: „Nächster Fund“ while some are hidden, plus „Überspringen“; when all are shown, „Zum Ergebnis“ (primary).
  - **`BattleScreen`:**
    - State `chest: ChestItem[] | null`.
    - In the `done` effect, after `onFinished`: `checkResearch(now()).catch(() => {})`, then `loadFinds()`. Unopened finds become `ChestItem`, with `duplicate = isDuplicate(f, all)`.
    - If loading fails: `setChest([])`.
    - Done branch: `chest === null` → „Lade …“; `chest.length > 0` → `<Chest onDone={() => { void markOpened(ids, now()).catch(() => {}); setChest([]) }} />`; otherwise the existing result.
  - **CSS glow:**
    - `.glow::before`: radial gradient behind the image.
    - Common `#6fdc8c`, rare `#4aa8ff` with `glow-pulse` 1.6 s, legendary `#ffcf4a` with a rotating `conic-gradient` (rays, 6 s) and `::after` sparks (`glint`).
    - `.glow.soft`: reduced opacity, no rays. Legendary glints every ~7 s.
    - Under `prefers-reduced-motion: reduce`, all glow animations are `none`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx.cmd vitest run app/test/ui/chest.test.tsx app/test/ui/findsBattle.test.tsx app/test/ui/battle.test.tsx`
Expected: PASS. Existing battle tests that check the result after 3 or more correct answers now see the chest first. Adjust them by clicking „Überspringen“ → „Zum Ergebnis“, or give them fewer than 3 counting answers. Record each change as a ruling.

- [ ] **Step 5: Commit**

```bash
git add app/src/ui/game/Chest.tsx app/src/ui/BattleScreen.tsx app/src/ui/theme.css app/test/ui/chest.test.tsx app/test/ui/battle.test.tsx app/test/ui/findsBattle.test.tsx
git commit -m "feat(ui): Truhe mit Seltenheits-Leuchten vor dem Kampfergebnis"
```

---

### Task 5: Sammelbuch

**Files:**
- Create: `app/src/ui/CollectionScreen.tsx`
- Modify: `app/src/ui/game/SceneMenu.tsx` (prop `onCollection`, button „Sammelbuch“)
- Modify: `app/src/ui/GreenhouseScreen.tsx`, `app/src/ui/CampScreen.tsx` (pass `onCollection` through)
- Modify: `app/src/App.tsx` (view `{ name: 'collection'; from: Scene }`)
- Modify: `app/src/ui/theme.css` (`.collection`, `.find-grid`, `.find-cell`)
- Test: `app/test/ui/collection.test.tsx`, extend `app/test/ui/app.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `FIND_ITEMS`, `collection`, `fertilizer`, `researchHint`, `findImage`, `questionText`; `REGIONS`.
  - Task 2: `checkResearch`, `loadFinds`, `loadDesign`.
  - Task 4: classes `glow soft rarity-*`.
- Produces:
  - `CollectionScreen(props: { now?: () => Date; onBack: () => void })`.
  - `SceneMenu` and `GreenhouseScreen` / `CampScreen` get `onCollection?: () => void`.
  - The greenhouse button „Sammelbuch“ comes in Task 6 (the tool row). Task 5 adds only the menu entry.

- [ ] **Step 1: Write the failing tests**

```ts
it('zeigt Dünger, Regionen mit Zählern und Silhouetten', async () => {
  await saveFind(find({ id: 'a', item: 'moosstein' }))
  await saveFind(find({ id: 'b', item: 'moosstein', foundAt: '2026-03-10T11:00:00.000Z' })) // doppelt
  render(<CollectionScreen now={() => NOW} onBack={vi.fn()} />)
  expect(await screen.findByText('Dünger: 1')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Wald 1/6' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Vulkan 0/6' })).toBeInTheDocument()
  expect(screen.getAllByLabelText('Unbekanntes Stück')).toHaveLength(35)
})

it('unerforschte Funde oben mit Hinweis auf ihre Karte', async () => {
  // Karte 'a' (Frage „Frage a?“) mit State due = NOW + 3 Tage; Fund heute für Karte 'a'
  // → Abschnitt „Wird erforscht“ enthält „Moosstein“ und „erforscht, wenn du ‚Frage a?‘ in 3 Tagen wieder weißt“
})

it('prüft beim Öffnen die Forschung', async () => {
  // Fund gestern für Karte 'a'; State last_review heute 05:00, State.Review → kein Abschnitt „Wird erforscht“; researchedAt gesetzt
})

it('App: Sammelbuch aus dem Szenenmenü und zurück', async () => {
  // in app.test.tsx: angemeldet, Gewächshaus, Menü → „Sammelbuch“ → Überschrift „Sammelbuch“ → „Zurück“ → Gewächshaus
})
```

Write the tests marked with comments using the data the comments describe. Put the last one in `app/test/ui/app.test.tsx`, following its existing sign-in helpers.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx.cmd vitest run app/test/ui/collection.test.tsx`
Expected: FAIL, because `../../src/ui/CollectionScreen` cannot be resolved.

- [ ] **Step 3: Implement**
  - **Loading:** `checkResearch(now()).catch(() => {})`, then load `loadFinds`, `loadDesign`, `db.cards`, `db.states`, `db.modules`.
  - **Header:** `<h1 className="pixel">Sammelbuch</h1>`, `Dünger: N`.
  - **„Wird erforscht“:** for each unresearched owned piece, its earliest find. Show the name and `researchHint`, where:
    - question = `questionText(card)` if the card exists and is not deleted, otherwise `null`.
    - `due = state ? new Date(state.due) : null`.
    - moduleName from `db.modules`.
  - **Region rows:** `<h2>` „Name n/6“ and 6 cells in catalog order.
    - Found: `<img>` in `div.glow.soft.rarity-*` plus name. Unresearched pieces also get the class `unerforscht` (dimmed).
    - Missing: `<div className="find-cell missing" aria-label="Unbekanntes Stück">?</div>`.
  - **Error:** loading error → `role="alert"` text plus „Zurück“.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx.cmd vitest run app/test/ui/collection.test.tsx app/test/ui/app.test.tsx app/test/ui/greenhouse.test.tsx app/test/ui/camp.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/ui/CollectionScreen.tsx app/src/ui/game/SceneMenu.tsx app/src/ui/GreenhouseScreen.tsx app/src/ui/CampScreen.tsx app/src/App.tsx app/src/ui/theme.css app/test/ui/collection.test.tsx app/test/ui/app.test.tsx
git commit -m "feat(ui): Sammelbuch mit Lücken, Dünger und Forschungshinweisen"
```

---

### Task 6: Gewächshaus – Gestalten, Erde, Forschungsmeldung

**Files:**
- Modify: `app/src/game/scenes.ts` (`GardenSlot`, `GARDEN_SLOTS`)
- Modify: `app/src/ui/GreenhouseScreen.tsx` (`loadGarden` extended, tool row, design mode, deco, soil)
- Modify: `app/src/ui/theme.css` (`.garden-tools`, `.deco`, `.slot-mark`, `.slot-picker`, `.soil-panel`, `.soil-1..3`)
- Test: extend `app/test/scenes.test.ts`, new `app/test/ui/greenhouseDesign.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `collection`, `fertilizer`, `itemById`, `itemSize`, `findImage`, `SOIL_COST`, `MAX_SOIL`.
  - Task 2: `checkResearch`, `loadFinds`, `loadDesign`, `placeItem`, `raiseSoil`, `markTold`, `type Design`.
  - Task 4: `glow soft rarity-*`.
  - Task 5: prop `onCollection`.
- Produces:
  ```ts
  // scenes.ts
  export type GardenSlot = { id: string; view: ViewId; x: number; y: number; w: number; size: 'small' | 'large' }
  export const GARDEN_SLOTS: GardenSlot[]
  // GreenhouseScreen.tsx – loadGarden returns additionally:
  type Data = { beds: BedView[]; dead: number; finds: FindStatus[]; design: Design; announce: FindStatus[] }
  ```
  - `announce` = researched finds without `told`. Only one find per piece is reported.

**Slots** (x / y = foot point in % of the backdrop, w = width in %):

| id | view | x | y | w | size |
|---|---|---|---|---|---|
| gang-mitte | gang | 50 | 84 | 26 | large |
| gang-links | gang | 16 | 90 | 12 | small |
| gang-rechts | gang | 84 | 90 | 12 | small |
| zurueck-mitte | zurueck | 50 | 84 | 26 | large |
| zurueck-links | zurueck | 16 | 90 | 12 | small |
| zurueck-rechts | zurueck | 84 | 90 | 12 | small |
| tuer-links | tuer | 18 | 88 | 14 | small |
| tuer-rechts | tuer | 82 | 88 | 14 | small |
| beetL-links | beetL | 6 | 84 | 11 | small |
| beetL-rechts | beetL | 94 | 84 | 11 | small |
| beetR-links | beetR | 6 | 84 | 11 | small |
| beetR-rechts | beetR | 94 | 84 | 11 | small |

The values are starting points. Task 10 moves them if they look wrong; the `scenes.test.ts` tests must stay green.

- [ ] **Step 1: Write the failing tests**

```ts
// scenes.test.ts
it('GARDEN_SLOTS: 10–14 Plätze, eindeutig, jede Sicht hat welche, keiner im Beet oder unter dem Beet-Schild', () => {
  expect(GARDEN_SLOTS.length).toBeGreaterThanOrEqual(10)
  expect(GARDEN_SLOTS.length).toBeLessThanOrEqual(14)
  expect(new Set(GARDEN_SLOTS.map((s) => s.id)).size).toBe(GARDEN_SLOTS.length)
  for (const id of Object.keys(GARDEN_VIEWS)) expect(GARDEN_SLOTS.some((s) => s.view === id)).toBe(true)
  for (const s of GARDEN_SLOTS) {
    for (const b of GARDEN_VIEWS[s.view].beds) {
      const overlapsX = s.x + s.w / 2 > b.x && s.x - s.w / 2 < b.x + b.w
      const signY = b.y + b.h + (b.scale === 1 ? 9 : 4)
      const signHalf = b.scale === 1 ? 35 : b.w / 2 // .bed-sign.near max-width 70 %
      const underSign = Math.abs(s.x - (b.x + b.w / 2)) < signHalf + s.w / 2 && s.y > signY - 4
      expect(overlapsX && s.y > b.y - 2 && s.y - s.w < b.y + b.h).toBe(false)
      expect(underSign).toBe(false)
    }
    if (s.view === 'beetL' || s.view === 'beetR') expect(s.y).toBeLessThanOrEqual(86) // über dem Beet-Blättern
  }
})
```

```ts
// greenhouseDesign.test.tsx (Setup wie greenhouse.test.tsx; Modul m1 mit Thema und Karte, damit ein Beet existiert)
it('Gestalten: Platz wählen zeigt nur erforschte, passende Stücke und stellt sie auf', async () => {
  // erforscht: moosstein (gewöhnlich), waldteich (legendär); unerforscht: farn
  // „Gestalten“ → Platz-Knopf „Platz gang-links: leer“ → Auswahl enthält „Moosstein“, nicht „Waldteich“ (zu groß), nicht „Farnbüschel“ (unerforscht)
  // „Moosstein“ → Deko-Bild mit alt „Moosstein“ sichtbar; loadDesign().placements.get('gang-links') === 'moosstein'
})

it('großer Platz bietet auch legendäre Stücke an; „Leer“ räumt ab', async () => {
  // „Platz gang-mitte: leer“ → „Waldteich“ wählbar → aufstellen → „Platz gang-mitte: Waldteich“ → „Leer“ → Platz leer
})

it('außerhalb des Gestalten-Modus keine Platz-Markierungen', async () => {
  // ohne Klick auf „Gestalten“: queryByRole('button', { name: /^Platz / }) === null; aufgestellte Deko trotzdem sichtbar
})

it('Erde verbessern über das Beet-Schild', async () => {
  // 2 doppelte Funde (Dünger 2); „Gestalten“ → Knopf „Erde von <Modul> verbessern“ → „Erde: Stufe 0/3 · Dünger: 2“ → „Verbessern (2 Dünger)“
  // → „Erde: Stufe 1/3 · Dünger: 0“, Knopf „Verbessern (4 Dünger)“ disabled; Pflanze hat Klasse soil-1
})

it('meldet erforschte Funde genau einmal', async () => {
  // zwei erforschte, nicht gemeldete Funde → role=status „2 Funde erforscht!“; erneutes Rendern (refreshKey+1) → keine Meldung; told-Zeilen vorhanden
})

it('Knopf „Sammelbuch“ ruft onCollection', async () => { /* … */ })
```

Write the tests marked with comments using the data the comments describe.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx.cmd vitest run app/test/scenes.test.ts app/test/ui/greenhouseDesign.test.tsx`
Expected: FAIL, because `GARDEN_SLOTS` is not exported and there is no „Gestalten“ button.

- [ ] **Step 3: Implement**
  - **`loadGarden`:**
    - First `checkResearch(t).catch(() => 0)`, then `loadFinds()` and `loadDesign()`. Their errors are caught (empty lists), so the garden always shows.
    - Shows the announcement once per load and calls `markTold` right away (errors ignored).
  - **Tool row** below the scene (`.garden-tools`, outside `.scene`): „Sammelbuch“ (only with `onCollection`), „Gestalten“ / „Fertig“ (toggles `design`).
  - **Deco:**
    - For each slot of the current view with a placed piece: `<img className="deco" alt={item.name}>` in `div.glow.soft.rarity-*`.
    - Style `left: x%`, `top: y%`, `width: w%`, transform `translate(-50%, -100%)`, `pointer-events: none`, z-index below plants.
  - **Design mode:**
    - Slots become buttons `aria-label="Platz <id>: leer|<Name>"` (dashed frame, `.slot-mark`).
    - Tapping a slot opens `.slot-picker` with:
      - Every researched piece whose `itemSize` fits (`large` only on large slots; marked „steht schon woanders“ when placed elsewhere).
      - „Leer“ and „Abbrechen“.
    - Picking calls `placeItem`, then reloads `design` via `loadDesign()`.
  - **Soil:**
    - In design mode the bed sign is a button `aria-label="Erde von <Modul> verbessern"`. It opens `.soil-panel` with the texts from Global Constraints.
    - `raiseSoil` errors show as `role="alert"` in the panel.
    - Plants: width `s.size * (1 + 0.08 * level)`, class `soil-<level>`.
    - CSS: `soil-1..3` with `filter: saturate(1.15 / 1.3 / 1.45)`; `soil-3` with a light `glint` animation (none under reduced motion).
  - **Announcement:** `<p className="plant-sign found-sign" role="status">N Funde erforscht!</p>`; tap closes it.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx.cmd vitest run app/test/scenes.test.ts app/test/ui/greenhouseDesign.test.tsx app/test/ui/greenhouse.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/game/scenes.ts app/src/ui/GreenhouseScreen.tsx app/src/ui/theme.css app/test/scenes.test.ts app/test/ui/greenhouseDesign.test.tsx
git commit -m "feat(garden): Gestalten mit Plätzen, bessere Erde, Meldung „Funde erforscht!“"
```

---

### Task 7: Tageszeit

**Files:**
- Modify: `app/src/game/scenes.ts` (`dayPhase`)
- Modify: `app/src/ui/GreenhouseScreen.tsx` (overlay, fireflies, scene class)
- Modify: `app/src/ui/theme.css` (`.daylight.phase-*`, `.firefly`, `.scene.night .glow`)
- Test: extend `app/test/scenes.test.ts` and `app/test/ui/greenhouseDesign.test.tsx`

**Interfaces:**
- Consumes: the `now` prop of `GreenhouseScreen`.
- Produces: `export type DayPhase = 'morgen' | 'tag' | 'abend' | 'nacht'` and `export function dayPhase(d: Date): DayPhase` (local hour).

- [ ] **Step 1: Write the failing tests**

```ts
it('dayPhase: Grenzen 6, 10, 17, 21 Uhr', () => {
  const at = (h: number, m = 0) => dayPhase(new Date(2026, 0, 1, h, m))
  expect(at(5, 59)).toBe('nacht')
  expect(at(6)).toBe('morgen')
  expect(at(9, 59)).toBe('morgen')
  expect(at(10)).toBe('tag')
  expect(at(17)).toBe('abend')
  expect(at(21)).toBe('nacht')
  expect(at(0)).toBe('nacht')
})

it('Gewächshaus: Farbschicht nach Uhrzeit, nachts Glühwürmchen', async () => {
  // now = 22:00 → document.querySelector('.daylight.phase-nacht') vorhanden, .scene hat Klasse night, ≥ 1 .firefly
  // now = 12:00 → .daylight.phase-tag, keine .firefly
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx.cmd vitest run app/test/scenes.test.ts app/test/ui/greenhouseDesign.test.tsx`
Expected: FAIL, because `dayPhase` is not exported.

- [ ] **Step 3: Implement**
  - In `.scene`: `<div className={`daylight phase-${p}`} aria-hidden="true" />` with `pointer-events: none`, above the backdrop and plants, below the signs and the menu.
  - Colours: `morgen` `rgba(170,210,255,.18)` with `mix-blend-mode: soft-light`; `tag` transparent; `abend` `rgba(255,170,60,.22)`; `nacht` `rgba(20,30,90,.38)` with `multiply`.
  - At night: the class `night` on `.scene` (stronger `.glow.soft`), and 6 `span.firefly` at fixed positions with a glow and slow flicker (calm under reduced motion).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx.cmd vitest run app/test/scenes.test.ts app/test/ui/greenhouseDesign.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/game/scenes.ts app/src/ui/GreenhouseScreen.tsx app/src/ui/theme.css app/test/scenes.test.ts app/test/ui/greenhouseDesign.test.tsx
git commit -m "feat(garden): Tageszeit als Farbschicht, nachts Glühwürmchen"
```

---

### Task 8: Stil-Entwurf der Grafiken — FESTER HALTEPUNKT

**Files:**
- Create: `app/public/game/finds/moosstein.png`, `eulenstatue.png`, `waldteich.png`, `truhe_zu.png`, `truhe_offen.png`

**Interfaces:**
- Consumes: the IDs from the Task 1 catalog, the slots from Task 6, the chest from Task 4.
- Produces: the approved style (prompt wording, sizes, view) for Task 9.

- [ ] **Step 1: Generate** (check the balance first with `mcp__pixellab__get_balance`)
  - Use `mcp__pixellab__create_1_direction_object` with `view: 'low top-down'`.
  - Description base: "small decorative object standing on the floor, seen slightly from above, muted dusky night palette with one glowing accent color, dark outline".
  - `moosstein` and `eulenstatue` at 64 px. `waldteich` at 128 px (a small pond with stones and reeds).
  - Chest closed at 64 px; open via `mcp__pixellab__create_object_state` from the closed chest (lid open, warm light from inside).
  - Request several candidates per call and pick the best.
- [ ] **Step 2: Bring them onto the canvas**
  - Run `python app/scripts/slice_assets.py foot …` (square canvas, foot at bottom centre), as in STIL.md.
  - Save to `app/public/game/finds/`.
- [ ] **Step 3: Visual check in the greenhouse**
  - Use a temporary `app/vcheck.html` + `app/src/vcheck.tsx` (pattern: `sed 's#/src/main.tsx#/src/vcheck.tsx#' app/index.html`), preview `app-dev`, `http://localhost:5173/vcheck.html`, `resize_window` mobile.
  - Shots:
    - The greenhouse view `gang` with the pond on `gang-mitte` and the moss stone on `gang-links`.
    - The beet view with the owl statue.
    - `Chest` closed (legendary glow) and opened.
  - Take screenshots, copy them to the scratchpad, and send them with `SendUserFile`.
- [ ] **Step 4: STOP. Ask the user for an OK on the style.**
  - Continue only after a clear OK.
  - If they want changes: regenerate, show again, ask again.
  - Leave the vcheck files in place until Task 10.
- [ ] **Step 5: Commit** (after the OK)

```bash
git add app/public/game/finds
git commit -m "feat(assets): Stil-Entwurf Fundstücke (Wald) und Truhe"
```

---

### Task 9: Restliche 33 Fundstücke

**Files:**
- Create: `app/public/game/finds/<id>.png` for every remaining catalog ID
- Modify: `app/public/game/STIL.md` (new section „Fundstücke (Teil 4b, freigegeben am …)“)
- Test: `app/test/findAssets.test.ts`

**Interfaces:**
- Consumes: the style approved in Task 8; `FIND_ITEMS`, `CHEST_IMAGES` from Task 1.
- Produces: a file for every `findImage(id)`.

- [ ] **Step 1: Write the failing test**

```ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
it('jedes Fundstück und die Truhe haben eine Grafik', () => {
  const dir = join(__dirname, '../public/game/finds')
  for (const { id } of FIND_ITEMS) expect(existsSync(join(dir, `${id}.png`)), id).toBe(true)
  for (const f of ['truhe_zu.png', 'truhe_offen.png']) expect(existsSync(join(dir, f)), f).toBe(true)
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx.cmd vitest run app/test/findAssets.test.ts`
Expected: FAIL, with `leuchtpilze` as the first missing file.

- [ ] **Step 3: Generate**
  - Per region, one call with `item_descriptions` for its 5 small pieces (64 px, many candidates), and the legendary piece separately at 128 px.
  - Use exactly the Task 8 wording; each region uses its palette accent from STIL.md.
  - Run `slice_assets.py foot` on everything.
  - Note in STIL.md: tool, sizes, wording, and the generations used.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx.cmd vitest run app/test/findAssets.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/public/game/finds app/public/game/STIL.md app/test/findAssets.test.ts
git commit -m "feat(assets): alle 36 Fundstücke"
```

---

### Task 10: Sichtprüfung und Feinschliff

**Files:**
- Modify where needed: `app/src/game/scenes.ts` (slot positions), `app/src/ui/theme.css`
- Delete: `app/vcheck.html`, `app/src/vcheck.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: no new interfaces.

- [ ] **Step 1: Check on mobile** (375×812, vcheck pattern from Task 8). For each item, take a screenshot and judge it:
  - Each of the 5 views with all slots filled in design mode: no slot covers plants, the bed sign, the pager, the menu or the location label.
  - Deco stands on the floor and does not float.
  - Chest of all three rarities. Under reduced motion (`matchMedia` emulation via CSS class or devtools), rays and pulse are off.
  - The battle flash does not cover the answer buttons.
  - Sammelbuch with gaps and the hint list. A long question does not wrap past the screen edge.
  - Day phases morning, evening and night.
- [ ] **Step 2: Fix what you find.** Move slot positions in `GARDEN_SLOTS` only within the `scenes.test.ts` rules. Check CSS again.
- [ ] **Step 3: Delete the vcheck files and run everything**

Run: `npm.cmd test` and `npx.cmd tsc -p app --noEmit`
Expected: all test files green (previously 49 files / 483 tests plus the new ones), tsc without output.

- [ ] **Step 4: Send the screenshots** to the user with `SendUserFile` (greenhouse with deco at night, chest legendary, Sammelbuch).
- [ ] **Step 5: Commit**

```bash
git add -A app/src app/test
git commit -m "fix(ui): Feinschliff aus der Sichtprüfung der Fundstücke"
```
