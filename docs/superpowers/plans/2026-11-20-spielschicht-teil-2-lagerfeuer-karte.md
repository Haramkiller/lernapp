# Spielschicht Teil 2: Lagerfeuer, Karte, Titelbild – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein neuer Einstieg ersetzt die heutige Startseite: Titelbild → Waldplatz mit animiertem Lagerfeuer → Feuer antippen öffnet die Karte mit Regionen (Module), Tages-Quest, Gebiets-Bedrohung und Themen-Fähnchen → Kampf → zurück ans Feuer. Wer zwischen zwei Kämpfen 5 Minuten Pause macht, ist „Ausgeruht“.

**Architecture:** Alles, was aus dem Lernstand folgt (sitzt sicher, Bedrohung, Quest, Fähnchen), berechnen reine Funktionen in `app/src/game/` bei jedem Laden. Gespeichert werden nur zwei echte Spielentscheidungen: das gewählte Gebiet je Modul und der Zeitpunkt des letzten Kampfes. Beides liegt in einer neuen, allgemeinen Tabelle `game_items` (Dexie und Supabase, gleiche Outbox und Konfliktregel wie `card_states`), die Teil 3 und 4 weiterverwenden. Neue Bildschirme: `TitleScreen`, `CampScreen` (Szene, Feuer, Menü) und `MapDialog`. `HomeScreen` entfällt.

**Tech Stack:** React 18, TypeScript, Vite 7 + vite-plugin-pwa, Dexie, supabase-js, ts-fsrs, Vitest + Testing Library (jsdom), PixelLab-MCP (nur zur Bauzeit), `app/scripts/slice_assets.py` (Pillow).

**Spec:** `docs/superpowers/specs/2026-11-20-spielschicht-stufe-1b-design.md` (Abschnitte 5, 6.1, 6.3, 6.4, 6.5 „Gebiets-Bedrohung“/„sitzt sicher“, 7, 8, 9 Teil 2)

## Global Constraints

- 0 € laufende Kosten, keine bezahlte API. PixelLab nur beim Bauen, nie zur Laufzeit.
- Grafiken liegen unter `app/public/game/`, werden vom Service Worker vorab gespeichert und kommen zusammen (Teil 1 + 2) auf höchstens **4 MB** (bestehender Test in `app/test/bosses.test.ts`).
- Oberfläche komplett auf Deutsch.
- **Fortschritt im Spiel bildet echten Lernfortschritt ab** (FSRS). Noch nie gelernte Karten erhöhen die Bedrohung nicht.
- Abgeleitetes wird **berechnet, nicht gespeichert** (Bedrohung, sitzt sicher, Quest, Fähnchen).
- **Keine gesperrten Orte**, keine Strafen. „Ausgeruht“ ist nur ein Bonus; Weiterkämpfen ohne Pause bleibt erlaubt.
- Einstellungen und Synchronisieren bleiben erreichbar (Menü oben am Waldplatz), sind aber nicht mehr der Startbildschirm.
- `prefers-reduced-motion: reduce` → Feuer als Standbild, alles bleibt bedienbar.
- Handy hochkant zuerst; am PC (quer) sieht es ebenfalls gut aus. Pixel-Art scharf (`image-rendering: pixelated`).
- `supabase/schema.sql` bleibt auf bestehenden Datenbanken gefahrlos erneut ausführbar. RLS „nur eigene Zeilen“, Rechte nur für `authenticated`.
- **Stil-Freigabe:** Task 5 ist ein Haltepunkt. Erst nach dem OK des Nutzers kommen Grafiken in die App.
- **Live-Schalten (Task 8)** erst, nachdem der Nutzer das erweiterte `schema.sql` selbst in Supabase ausgeführt hat; ohne die Tabelle bricht der Pull ab. Kein Push ohne Zustimmung.
- Tests: `npx vitest run <datei>` im Repo-Wurzelordner für einzelne Dateien, `npm test` (Git Bash) bzw. `npm.cmd test` (PowerShell) für alle. Typen: `npx tsc -p app --noEmit`. Build: `npm run build -w app`.
- UI-Tests warten auf asynchrone Zustände (`findBy…`, `vi.waitFor`), nie direkt nach einem Klick prüfen (CI ist langsamer).
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Entscheidungen dieses Plans (dem Builder überlassen laut Spec, dem Nutzer zur Prüfung)

1. **Titelbild → direkt ans Lagerfeuer.** Das Gewächshaus kommt erst in Teil 3; bis dahin gibt es noch keine Tür.
2. **Gebiet = Heimat des Bosses.** Jeder der 6 Bosse lebt in einer Region (Moosgolem → Wald, Sporenhexe → Sumpf, Kristallwächter → Kristallberge, Tiefseekraken → Küste, Bronzetitan → Arena, Aschephönix → Vulkan). Die Spec erlaubt, Boss und Regionsthema getrennt zu ändern; hier gibt es **eine** Wahl je Modul („Gebiet“), weil Boss und Kulisse zusammengehören. Die Karte hat 6 feste Regionen; Regionen ohne Modul liegen im Nebel; teilen sich Module eine Region, listet die Region alle.
3. **Sitzt sicher** (eine Karte): schon gelernt **und** Abrufwahrscheinlichkeit ≥ Ziel-Behaltensrate **und** Stabilität ≥ 7 Tage. Ein Thema sitzt sicher, wenn jede seiner Karten so sitzt.
4. **Gebiets-Bedrohung** = Anteil der gelernten Karten des Moduls, die nicht sicher sitzen (0–100 %). Ohne gelernte Karte: keine Bedrohung, Anzeige „Noch unerforscht“.
5. **Ausgeruht:** Seit dem Ende des letzten Kampfes mit mindestens einer Antwort sind ≥ 5 Minuten vergangen (oder es gab noch keinen). Bonus: Glückstreffer-Chance 25 % statt 10 % für den ganzen Kampf. Auch eine Pause außerhalb der App zählt.
6. **Tages-Quest** = heute erledigte Karten / (erledigte + noch offene Karten der heutigen Lernliste). Keine Tagesserie in Teil 2.
7. **Neue Tabelle `game_items`** (Schlüssel Nutzer + ID, Inhalt JSON) statt einzelner Spezialtabellen, damit Teil 3/4 ohne neue Sync-Wege auskommen.

## Review Focus

- Fällige Karten, deren Modul fehlt (gelöscht oder noch nicht synchronisiert) → am Feuer erscheint „Verirrte Karten: n“ mit Kampf-Knopf (gemischter Kampf wie heute), nichts geht verloren (Test in Task 7).
- Mehr als 6 Module oder zwei Module mit gleich gewähltem Gebiet → beide erscheinen in derselben Region, jedes mit eigenem Kampf-Knopf (Tests in Task 2 und 7).
- Kampf geöffnet und sofort „Beenden“ ohne Antwort → der Ausgeruht-Zeitpunkt bleibt unverändert (Test in Task 4).
- Gewähltes Gebiet zeigt auf einen Boss, den es nicht mehr gibt, oder auf ein gelöschtes Modul → automatische Zuordnung, kein Absturz (Test in Task 2).
- Die Tabelle `game_items` fehlt in Supabase (Schema nicht ausgeführt) → bekannter Fall: Haltepunkt in Task 8; der Sync meldet einen Fehler, Lernen bleibt offline möglich (kein Test, Haltepunkt).

---

### Task 1: Sitzt sicher, Bedrohung, Quest

**Files:**
- Create: `app/src/game/mastery.ts`
- Test: `app/test/mastery.test.ts`

**Interfaces:**
- Consumes: `recall`, `SrsState` aus `app/src/srs/scheduler.ts`; `buildQueue`, `Settings` aus `app/src/session/queue.ts`; `studyDay` aus `@lernapp/shared`; `Card`, `Topic` aus `@lernapp/shared`; `State` aus `ts-fsrs`.
- Produces:
  ```ts
  export const SECURE_STABILITY_DAYS = 7
  export function isLearned(s: SrsState | undefined): s is SrsState          // vorhanden und nicht State.New
  export function isSecure(s: SrsState | undefined, now: Date, retention: number): boolean
  export type TopicStatus = { topic: Topic; total: number; due: number; fresh: number; secure: boolean }
  export function topicStatus(topic: Topic, cards: Card[], states: Map<string, SrsState>, queue: Set<string>, now: Date, retention: number): TopicStatus
  /** null = noch keine gelernte Karte im Modul. Sonst 0–100, gerundet. */
  export function moduleThreat(cards: Card[], states: Map<string, SrsState>, now: Date, retention: number): number | null
  export type Quest = { done: number; total: number }
  export function dailyQuest(input: { cards: Card[]; states: Map<string, SrsState>; newDoneToday: number; now: Date; settings: Settings }): Quest
  ```
  `cards` sind jeweils schon auf das Modul bzw. Thema gefiltert; gelöschte Karten (`deleted`) zählen nirgends. `queue` ist die heutige Lernliste (IDs) des Moduls; `due` = Karten des Themas in der Liste mit State, `fresh` = in der Liste ohne State.

- [ ] **Step 1: Tests schreiben** (`NOW = 2026-03-10T10:00Z`, Zustände über `review(newSrsState(t), 3|4, t, {cardId})`, Fixture `choiceCard` aus `app/test/ui/fixtures`):
  - `isSecure`: ohne State → false; neue Karte (State.New) → false; frisch gelernt (Stabilität < 7) → false; State mit `stability: 30` und `last_review` = NOW → true; derselbe State 200 Tage später (recall < 0,9) → false.
  - `topicStatus`: Thema mit einer sicheren und einer nie gelernten Karte → `secure: false`, `fresh` zählt nur, wenn die Karte in `queue` steht; alle Karten sicher → `secure: true`; gelöschte Karte zählt nicht in `total`.
  - `moduleThreat`: keine gelernte Karte (nur neue) → `null`; 1 sicher + 1 unsicher gelernt + 3 nie gelernt → `50`; alle gelernten sicher → `0`.
  - `dailyQuest`: 2 Karten heute gelernt (nicht mehr in der Liste) + 3 noch offen → `{ done: 2, total: 5 }`; Karte heute gelernt, aber im Lernschritt erneut fällig → zählt nur in den offenen, nicht doppelt; Wiederholung von gestern zählt nicht als erledigt; Lerntag-Wechsel um 04:00 (Review um 03:30 gehört zum Vortag).
- [ ] **Step 2:** `npx vitest run app/test/mastery.test.ts` → FAIL (Modul fehlt).
- [ ] **Step 3:** `mastery.ts` umsetzen. „Heute erledigt“ = nicht gelöschte Karten mit `studyDay(new Date(state.last_review)) === studyDay(now)`, die **nicht** in `buildQueue(...)` stehen; `total = done + queue.length`.
- [ ] **Step 4:** Test erneut → PASS.
- [ ] **Step 5: Commit** `feat(game): sitzt sicher, Gebiets-Bedrohung und Tages-Quest`

### Task 2: Regionen und gewähltes Gebiet

**Files:**
- Modify: `app/src/game/bosses.ts`
- Test: `app/test/bosses.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type RegionId = 'wald' | 'sumpf' | 'kristallberge' | 'kueste' | 'arena' | 'vulkan'
  export type RegionDef = { id: RegionId; name: string }   // Namen: Wald, Sumpf, Kristallberge, Küste, Arena, Vulkan
  export const REGIONS: RegionDef[]                          // Reihenfolge = Reihenfolge auf der Karte
  export type BossDef = { id: string; title: string; region: RegionId; frames: …; fps: number }
  /** Gewähltes Gebiet je Modul: moduleId → bossId. */
  export type AreaChoices = Map<string, string>
  export function assignBosses(modules: Pick<Module, 'id'>[], chosen?: AreaChoices): Map<string, BossDef>
  export function bossFor(moduleId: string | undefined, modules: Pick<Module, 'id' | 'name'>[], chosen?: AreaChoices): { boss: BossDef; name: string }
  export function regionOf(boss: BossDef): RegionDef
  ```
  Boss → Region: moosgolem→wald, sporenhexe→sumpf, kristallwaechter→kristallberge, tiefseekraken→kueste, bronzetitan→arena, aschephoenix→vulkan.

- [ ] **Step 1: Tests ergänzen** (bestehende bleiben grün):
  - `REGIONS` hat 6 Einträge, jede Region hat genau einen Boss.
  - Gewählter Boss gewinnt: `assignBosses(mods(3), new Map([['mod-0', 'aschephoenix']])).get('mod-0')!.id === 'aschephoenix'`.
  - Die übrigen Module meiden einen gewählten Boss, solange noch freie da sind (mods(3), mod-0 gewählt → mod-1/mod-2 ≠ aschephoenix).
  - Zwei Module wählen denselben Boss → beide bekommen ihn.
  - Unbekannte Boss-ID in der Wahl → automatische Zuordnung wie ohne Wahl.
  - Wahl für ein Modul, das es nicht gibt, ändert nichts an den anderen.
- [ ] **Step 2:** `npx vitest run app/test/bosses.test.ts` → FAIL.
- [ ] **Step 3:** Umsetzen: erst gültige Wahlen setzen und deren Plätze als belegt markieren, dann die übrigen Module wie bisher (Hash + lineares Sondieren, sortiert nach ID). Kommentar „(Teil 2 speichert die Wahl dauerhaft.)“ entfernen.
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: Commit** `feat(game): Regionen und frei wählbares Gebiet je Modul`

### Task 3: Spieldaten speichern und synchronisieren (`game_items`)

**Files:**
- Modify: `app/src/data/db.ts`, `app/src/data/remote.ts`, `app/src/data/sync.ts`, `supabase/schema.sql`
- Create: `app/src/data/game.ts`
- Test: `app/test/game.test.ts`, `app/test/sync.test.ts`, `app/test/remote.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // db.ts
  export type GameItem = { id: string; data: Record<string, unknown>; updatedAt: string }
  // LernDb: game!: Table<GameItem, string>; version(3).stores({ game: 'id' })
  // OutboxEntry bekommt { id?: number; kind: 'game'; payload: GameItem }; DeadEntry.kind um 'game' erweitert
  // game.ts
  export async function putGameItem(item: GameItem): Promise<void>     // Transaktion: db.game.put + Outbox-Eintrag
  export async function loadAreaChoices(): Promise<AreaChoices>          // IDs `area:<moduleId>`, data { bossId }
  export async function saveAreaChoice(moduleId: string, bossId: string | null, now: Date): Promise<void>  // null = automatisch (data { bossId: null })
  export async function loadLastBattleAt(): Promise<Date | null>         // ID `rest`, data { at: ISO }
  export async function saveLastBattleAt(at: Date): Promise<void>
  // remote.ts
  export type SyncTable = 'modules' | 'topics' | 'cards' | 'states' | 'game'
  // Pulled bekommt game: GameItem[]; Remote bekommt pushGame(items: GameItem[]): Promise<void>
  ```
  Supabase-Spalten: `id text`, `user_id uuid default auth.uid()`, `data jsonb not null`, `updated_at timestamptz`, `synced_at timestamptz`, Primärschlüssel `(user_id, id)`. Mapper `gameToRow`/`rowToGame` in `remote.ts` (keine Änderung in `shared`). Upsert mit `onConflict: 'user_id,id'`; Pull mit Keyset-Schlüssel `id`.

- [ ] **Step 1: Tests schreiben:**
  - `game.test.ts`: `saveAreaChoice('m1','sporenhexe',T)` → `loadAreaChoices()` liefert `m1 → sporenhexe` und legt genau einen Outbox-Eintrag `kind: 'game'` an; `saveAreaChoice('m1', null, T2)` → Wahl verschwindet aus der Map; `saveLastBattleAt`/`loadLastBattleAt` hin und zurück; ohne Eintrag → `null`.
  - `sync.test.ts` (Fake-Remote um `game` und `pushGame` erweitern): Outbox mit zwei `game`-Einträgen derselben ID → nur der neuere geht raus, beide Outbox-Einträge weg; gepullte `game`-Zeile ersetzt eine ältere lokale, aber keine neuere; Cursor `lastPull:game` wird gespeichert.
  - `remote.test.ts`: Pull fragt `game_items` ab und mappt `updated_at`→`updatedAt`; `pushGame` ruft `upsert` mit `onConflict: 'user_id,id'` und ohne `user_id` im Datensatz.
- [ ] **Step 2:** Tests ausführen → FAIL.
- [ ] **Step 3:** Umsetzen. `pushOutbox` behandelt `game` wie `state` (neueste je ID), Reihenfolge: States, Logs, Game. `sync()` nimmt `game` in `TABLES` und in die Pull-Transaktion. `schema.sql`: Tabelle `game_items` mit `create table if not exists`, Index `(user_id, synced_at, id)`, in die Trigger-Schleife (`set_synced_at`, `lww_guard`) und die Policy-Schleife aufnehmen, `alter table … enable row level security`, `grant select, insert, update, delete … to authenticated`. Am Kopf des neuen Abschnitts ein Kommentar „Stufe 1b, Teil 2“.
- [ ] **Step 4:** Tests → PASS; ganze Suite `npm test` grün.
- [ ] **Step 5: Commit** `feat(data): Spieldaten (game_items) lokal speichern und synchronisieren`

### Task 4: Ausgeruht

**Files:**
- Create: `app/src/game/rest.ts`
- Modify: `app/src/game/battle.ts`, `app/src/ui/BattleScreen.tsx`, `app/src/ui/theme.css`
- Test: `app/test/rest.test.ts`, `app/test/battle.test.ts`, `app/test/ui/battle.test.tsx`

**Interfaces:**
- Consumes: `loadLastBattleAt`, `saveLastBattleAt` (Task 3).
- Produces:
  ```ts
  // rest.ts
  export const REST_MINUTES = 5
  export function isRested(lastBattleAt: Date | null, now: Date): boolean
  export function minutesUntilRested(lastBattleAt: Date | null, now: Date): number   // 0, wenn ausgeruht; sonst aufgerundet
  // battle.ts
  export const LUCKY_CHANCE = 0.1, RESTED_LUCKY_CHANCE = 0.25
  export function applyAnswer(b: Battle, a: {…}, rng: Rng, luckyChance?: number): Battle   // Standard LUCKY_CHANCE
  // BattleScreen
  Props.rested?: boolean                      // Standard false
  Props.onFinished?: (answered: number) => void   // answered = gespeicherte Antworten dieses Kampfes
  ```

- [ ] **Step 1: Tests schreiben:**
  - `rest.test.ts`: `null` → ausgeruht; 4:59 min danach → nicht ausgeruht, `minutesUntilRested` = 1; genau 5 min → ausgeruht, 0.
  - `battle.test.ts`: rng 0,2 → mit Standard kein Glückstreffer, mit `RESTED_LUCKY_CHANCE` Glückstreffer.
  - `ui/battle.test.tsx`: `rested` → Hinweis „Ausgeruht“ sichtbar und Antwort mit rng 0,2 zeigt „Glückstreffer!“; ohne `rested` kein Hinweis und kein Glückstreffer; `onFinished` nach einer Antwort und „Beenden“ → aufgerufen mit `1`; „Beenden“ ohne Antwort → aufgerufen mit `0`.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Umsetzen. Hinweis als kleines Abzeichen `.rested-badge` neben „1 / 15“ mit Text „Ausgeruht · mehr Glückstreffer“. Den Zeitpunkt speichert erst `App` (Task 7), nicht `BattleScreen`.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5: Commit** `feat(game): Ausgeruht nach 5 Minuten Pause bringt mehr Glückstreffer`

### Task 5: Stil-Entwurf (HALTEPUNKT)

**Files:**
- Create (Entwurf, außerhalb des Repos im Scratchpad bzw. in der Vorschau des Brainstorm-Servers): Titelbild, Waldplatz, Lagerfeuer-Animation, Karte, ein Regions-Symbol (Wald), Nebel.

- [ ] **Step 1:** Mit PixelLab erzeugen, Stil wie `app/public/game/STIL.md` (gedeckte, natürliche Palette, Dämmerlicht, ein leuchtender Akzent):
  - **Titelbild** `create_image_pro` 192×256: Glashaus mit Kuppel am Waldrand in der Dämmerung, Lagerfeuerschein, freier Himmel oben für den Namen. Keine Schrift im Bild (der Name kommt als Text darüber).
  - **Waldplatz** `create_image_pro` 192×256: Lichtung mit weiter Aussicht (Horizont/Berge), leere Feuerstelle aus Steinen im unteren Drittel mittig, Baumstämme zum Sitzen, keine Figuren, keine Flammen.
  - **Lagerfeuer** `vfx_workbench`, Schleife 8–10 Bilder, 10–12 fps, Flammen mit Funken, passend zur Feuerstelle.
  - **Karte** `create_image_pro` 192×256: gemalte Fantasy-Karte auf Pergament mit 6 erkennbaren Landschaften (Wald, Sumpf, Kristallberge, Küste, Arena, Vulkan), keine Schrift.
  - **Regions-Symbol Wald** und **Nebelwolke** als kleine Objekte (z. B. 48–64 px, transparenter Hintergrund).
- [ ] **Step 2:** Dem Nutzer eine Vorschau-Seite zeigen (Hochformat-Komposition: Waldplatz mit Feuer; Karte mit Symbol und Nebel; Titelbild mit Namen „Lernabenteuer“ in der Pixel-Schrift der App).
- [ ] **Step 3: STOP.** Auf „Stil passt“ warten. Änderungswünsche → neu erzeugen, erneut zeigen. Nichts kommt vor der Freigabe ins Repo.

### Task 6: Grafiken einbauen

**Files:**
- Create: `app/public/game/title.png`, `app/public/game/camp/backdrop.png`, `app/public/game/camp/fire_<i>.png`, `app/public/game/map/map.png`, `app/public/game/map/<regionId>.png` (6), `app/public/game/map/fog.png`, `app/src/game/scenes.ts`
- Modify: `app/public/game/STIL.md`, `app/test/bosses.test.ts` (oder neu `app/test/scenes.test.ts`)

**Interfaces:**
- Produces:
  ```ts
  // scenes.ts
  export const TITLE_IMAGE: string                 // gameAsset('title.png')
  export const CAMP = { backdrop: string; fire: { frames: number; fps: number; x: number; y: number; width: number } }  // x/y/width in % der Kulisse (Mitte der Flammen)
  export function fireFrames(): string[]
  export const MAP_IMAGE: string
  export const REGION_SPOTS: Record<RegionId, { x: number; y: number }>   // % der Karte, Mitte des Symbols
  export function regionIcon(id: RegionId): string
  export const FOG_IMAGE: string
  ```

- [ ] **Step 1:** Restliche 5 Regions-Symbole im freigegebenen Stil erzeugen; Feuer mit `slice_assets.py fx` in Einzelbilder zerlegen (Ankerpunkt mittig).
- [ ] **Step 2: Test schreiben:** alle Dateien aus `scenes.ts` existieren, kein überzähliges Feuerbild (`fire_<frames>.png` fehlt), jede Region hat einen Platz mit 0 < x,y < 100, Gesamtgröße `public/game` bleibt ≤ 4 MB.
- [ ] **Step 3:** Test → FAIL; Dateien und `scenes.ts` anlegen (Positionen am Bild abmessen); Test → PASS.
- [ ] **Step 4:** `STIL.md` um die Abschnitte „Szenen“ und „Karte“ mit den benutzten Werkzeugen und Prompts ergänzen.
- [ ] **Step 5: Commit** `feat(game): Grafiken für Titelbild, Waldplatz, Lagerfeuer und Karte`

### Task 7: Waldplatz und Karte

**Files:**
- Create: `app/src/game/overview.ts`, `app/src/ui/CampScreen.tsx`, `app/src/ui/game/MapDialog.tsx`
- Modify: `app/src/ui/theme.css`
- Test: `app/test/overview.test.ts`, `app/test/ui/camp.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`topicStatus`, `moduleThreat`, `dailyQuest`), Task 2 (`assignBosses`, `REGIONS`, `regionOf`, `bossFrames`), Task 3 (`loadAreaChoices`, `loadLastBattleAt`), Task 4 (`isRested`, `minutesUntilRested`), Task 6 (`scenes.ts`), `Sprite`, `SyncStatus` (zieht von `HomeScreen.tsx` nach `CampScreen.tsx` um).
- Produces:
  ```ts
  // overview.ts
  export type ModuleView = { module: Module; boss: BossDef; bossName: string; threat: number | null; due: number; fresh: number; topics: TopicStatus[] }
  export type RegionView = { region: RegionDef; modules: ModuleView[] }        // modules leer = Nebel
  export type Overview = { quest: Quest; regions: RegionView[]; strays: number } // strays = Karten der Lernliste ohne bekanntes Modul
  export function buildOverview(input: { cards: Card[]; states: Map<string, SrsState>; topics: Topic[]; modules: Module[]; newDoneToday: number; now: Date; settings: Settings; chosen: AreaChoices }): Overview
  // CampScreen
  type Props = { now?: () => Date; sync: SyncStatus; refreshKey?: number; onBattle: (moduleId: string | undefined, rested: boolean) => void; onSettings: () => void; onSyncNow?: () => void }
  // MapDialog
  type Props = { overview: Overview; onBattle: (moduleId: string | undefined) => void; onClose: () => void }
  ```

- [ ] **Step 1: Tests `overview.test.ts`:** Module landen in der Region ihres Bosses, die anderen 5 Regionen sind leer; gewähltes Gebiet verschiebt das Modul; 7 Module → keines fehlt; Themen eines Moduls alphabetisch (`de`); `strays` zählt fällige Karten mit unbekannter `moduleId`; Quest gleich `dailyQuest`.
- [ ] **Step 2: Tests `ui/camp.test.tsx`:**
  - Waldplatz zeigt Kulisse und Knopf „Lagerfeuer – Karte öffnen“; Klick öffnet `role="dialog"` mit Namen „Karte“ und „Tages-Quest 2/5“.
  - Region mit Modul (Gebiet per `saveAreaChoice('m1', 'moosgolem', …)` fest gewählt, damit der Test nicht vom Hash abhängt): Knopf mit Namen „Wald: Botanik“; Klick zeigt Bossname „Moosgolem · Botanik“, „Bedrohung 50 %“ oder „Noch unerforscht“, je Thema Fähnchen „2 fällig“, „3 neu“, „sitzt sicher“, Knopf „Kämpfen“ → `onBattle('m1', true)` ohne Pause seit dem letzten Kampf bzw. `false` 2 Minuten nach einem Kampf.
  - Nichts zu tun im Modul → „Kämpfen“ gesperrt mit Text „Heute nichts zu tun“.
  - Leere Region: gesperrter Knopf „Unentdecktes Gebiet“.
  - `strays > 0` → „Verirrte Karten: 2“ mit „Kämpfen“ → `onBattle(undefined, …)`.
  - Ausgeruht-Anzeige: „Ausgeruht“ bzw. „Pause am Feuer: noch 3 min bis Ausgeruht“.
  - Menü-Knopf „Menü“ öffnet: Sync-Status (Texte wie bisher in `HomeScreen`), „Jetzt synchronisieren“, „Einstellungen“, Quarantäne-Warnung „n Einträge konnten nicht synchronisiert werden“.
  - Ladefehler → Meldung und „Erneut versuchen“ (aus `fixes.test.tsx` übernommen).
  - Escape und „Schließen“ schließen die Karte.
- [ ] **Step 3:** Tests → FAIL.
- [ ] **Step 4:** Umsetzen. Szene: `<div class="scene camp">` mit Kulisse als `<img>`, Feuer als `Sprite` absolut positioniert nach `CAMP.fire`, das Feuer selbst ist der Knopf. Karte als Fenster über der Szene: oben Quest-Leiste, darunter `MAP_IMAGE` mit Regions-Knöpfen an `REGION_SPOTS` (Symbol bzw. Nebel), darunter das Detail der gewählten Region (Boss-Idle als kleines `Sprite`, Bedrohungsbalken, Themenliste, „Kämpfen“). Fokus beim Öffnen auf „Schließen“, beim Schließen zurück aufs Feuer. Ausgeruht-Anzeige aktualisiert sich alle 30 s.
- [ ] **Step 5:** Tests → PASS.
- [ ] **Step 6: Commit** `feat(game): Waldplatz mit Lagerfeuer und Karte`

### Task 8: Titelbild, neuer Einstieg, Gebiet in den Einstellungen, live

**Files:**
- Create: `app/src/ui/TitleScreen.tsx`
- Modify: `app/src/App.tsx`, `app/src/ui/SettingsScreen.tsx`, `app/src/ui/theme.css`
- Delete: `app/src/ui/HomeScreen.tsx`, `app/test/ui/home.test.tsx` (Inhalte sind in Task 7 übernommen)
- Test: `app/test/ui/title.test.tsx`, `app/test/ui/app.test.tsx`, `app/test/ui/fixes.test.tsx`, `app/test/ui/settings.test.tsx` (neu)

**Interfaces:**
- Consumes: `CampScreen` (Task 7), `saveLastBattleAt` (Task 3), `saveAreaChoice`/`loadAreaChoices` (Task 3), `BOSSES`, `regionOf` (Task 2), `dailyQuest` (Task 1).
- Produces:
  ```ts
  type View = { name: 'title' } | { name: 'camp' } | { name: 'study'; moduleId?: string; rested: boolean } | { name: 'settings' }
  // TitleScreen
  type Props = { now?: () => Date; onStart: () => void }
  ```

- [ ] **Step 1: Tests schreiben:**
  - `title.test.tsx`: zeigt Überschrift „Lernabenteuer“, Stand „Tages-Quest 2/5“ bzw. „Heute ist nichts fällig“, Knopf „Los geht's“ → `onStart`.
  - `app.test.tsx`: Helfer `home()` sucht den Knopf „Los geht's“ (Titelbild ist der erste Bildschirm nach der Anmeldung); der Test zu den Einstellungen geht über „Los geht's“ → „Menü“ → „Einstellungen“; neuer Test: nach einem Kampf mit einer Antwort führt „Zur Übersicht“ zurück an den Waldplatz (nicht zum Titelbild) und `loadLastBattleAt()` ist gesetzt.
  - `settings.test.tsx`: je Modul eine Auswahl „Gebiet für Botanik“ mit „Automatisch“ und den 6 Regionen (Text „Wald – Moosgolem“ usw.); Wahl + „Speichern“ → `loadAreaChoices()` enthält sie; „Automatisch“ → entfernt sie.
  - `fixes.test.tsx`: den `HomeScreen`-Ladefehler-Test entfernen (lebt in `camp.test.tsx`).
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Umsetzen. Start-View `title` nach jeder Anmeldung bzw. jedem App-Start; `onExit` des Kampfes → `camp`; `onFinished(answered)` → bei `answered > 0` `saveLastBattleAt(new Date())`, danach Sync wie bisher. `HomeScreen.tsx` löschen, `SyncStatus` aus `CampScreen` importieren. Titelbild: `TITLE_IMAGE` bildschirmfüllend (Hochformat), Name in der Pixel-Schrift darüber, ganzer Bildschirm antippbar plus sichtbarer Knopf.
- [ ] **Step 4:** Ganze Suite grün, `npx tsc -p app --noEmit` ohne Fehler, `npm run build -w app` ohne Fehler.
- [ ] **Step 5:** Lokale Vorschau (Dev-Server) im Browser: Hochformat (375×812) und Querformat (1280×720) – Titelbild, Waldplatz mit brennendem Feuer, Karte offen, Region gewählt; keine Konsolenfehler. Screenshots dem Nutzer zeigen.
- [ ] **Step 6: Commit** `feat(game): Titelbild und Lagerfeuer als neuer Einstieg`
- [ ] **Step 7: HALTEPUNKT Datenbank.** Den Nutzer bitten, das aktuelle `supabase/schema.sql` im Supabase-SQL-Editor auszuführen (der Nutzer macht das selbst). Danach prüfen: Sync in der lokalen Vorschau gegen die echte Datenbank läuft ohne Fehler.
- [ ] **Step 8: HALTEPUNKT Live.** Nach Zustimmung des Nutzers in `main` zusammenführen und pushen, Deploy über die öffentliche Actions-API abwarten, Live-Seite prüfen (Service Worker aktualisieren, Hochformat und Querformat).
