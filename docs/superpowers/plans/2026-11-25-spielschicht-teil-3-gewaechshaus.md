# Spielschicht Teil 3 – Gewächshaus – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Gewächshaus wird das Zuhause der App: Ich-Perspektive mit 5 Blickpunkten, je Modul ein Beet, je Thema eine Pflanze, die mit dem Lernstand wächst, blüht und welkt; ein Baum für den endgültig besiegten Boss; Schilder beim Antippen; Insekten, je mehr es blüht.

**Architecture:** Wie Teil 2: gemalte PixelLab-Kulissen als Bilder, Pflanzen/Insekten als absolut positionierte Sprites darüber (DOM/CSS). Der Pflanzenzustand wird aus dem Lernstand **berechnet** (reine Funktionen in `app/src/game/garden.ts`); gespeichert werden nur die Meilensteine „Thema erstmals sicher“ und „Boss erstmals endgültig besiegt“ als `game_items` (Tabelle gibt es seit Teil 2, kein Schema-Schritt nötig).

**Tech Stack:** React 18, Dexie, Vitest + Testing Library, PixelLab (create_image_pro, create_1_direction_object, create_object_state bzw. edit_image, vfx/animate für Insekten).

**Spec:** `docs/superpowers/specs/2026-11-20-spielschicht-stufe-1b-design.md` (6.2 Gewächshaus, 6.5 „sitzt sicher“ / „endgültig besiegt“, 7 Grafik, 8 Daten). Stil der Blickpunkte freigegeben am 2026-11-25 (Rundgang `docs/entwurf-gewaechshaus.html`).

## Global Constraints

- Nur Gelerntes zählt: nie gesehene Karten lassen nichts welken (Spec 6.5).
- „Sitzt sicher“ = `isSecure` aus `app/src/game/mastery.ts` (gelernt, Abruf ≥ Zielwert, Stabilität ≥ 7 Tage); ein Thema sitzt sicher, wenn alle seine (nicht gelöschten) Karten sicher sitzen.
- Endgültig besiegt = alle Themen des Moduls sitzen **zum ersten Mal gleichzeitig** sicher; danach bleibt der Baum, er welkt nur. Pflanzen sterben nie (Spec 6.2/6.5).
- Berechnet, nicht gespeichert: Stufe, Welken, Insektenzahl. Gespeichert nur Meilensteine (Spec 8).
- Grafik: PixelLab, Dateien unter `app/public/game/garden/`, kleine Auflösung, `image-rendering: pixelated`; **Stil-Entwurf der Pflanzen ist ein Haltepunkt** – erst nach dem OK des Nutzers geht der Vorrat in die App (Spec 7). Budget Teil 3: höchstens 300 Generierungen.
- Szenen-Format wie Teil 2: 3:4, max. 480 px breit, Hoch- und Querformat.
- Ablauf (Spec 5): Titelbild → Gewächshaus; Tür → Waldplatz; Waldplatz → zurück ins Gewächshaus; nach dem Kampf → Waldplatz (wie heute).
- UI-Texte deutsch; Tasten groß genug fürs Handy (min. 44 px); Escape/Fokus wie beim Karten-Dialog.

## Review Focus

- Modul ohne Themen oder Thema ohne (nicht gelöschte) Karten → leeres Beet bzw. keine Pflanze, kein Absturz; das Beet zeigt trotzdem sein Schild.
- Mehr als 2 Module → Beete 3+ erreichbar (Blättern am Seitenbeet), keine Pflanze verschwindet unbemerkt; Reihenfolge stabil (nach Name).
- Thema mit neuen, nie gelernten Karten neben sicheren Karten → **nicht** sicher, aber auch **nicht** welk (welk nur, wenn eine gelernte Karte unsicher ist und das Thema schon einmal sicher war).
- Meilenstein-Speicherung läuft bei jedem Öffnen → darf nichts doppelt schreiben (keine Outbox-Flut) und muss offline funktionieren.
- Sehr viele Themen in einem Modul (z. B. 30) → Pflanzen werden kleiner/dichter, bleiben antippbar (min. 32 px Trefferfläche) und laufen nicht aus dem Bild.

---

### Task 1: Pflanzen-Modell (berechnet)

**Files:**
- Create: `app/src/game/garden.ts`
- Test: `app/test/garden.test.ts`

**Interfaces:**
- Consumes: `isLearned`, `isSecure` (`app/src/game/mastery.ts`); `assignBosses`, `regionOf`, `AreaChoices`, `RegionId` (`app/src/game/bosses.ts`); `Card`, `Topic`, `Module` (`@lernapp/shared`); `SrsState`.
- Produces:
  - `type PlantStage = 'seed' | 'sprout' | 'young' | 'bloom' | 'wilted'`
  - `type Milestones = { securedAt: Map<string, string>; defeatedAt: Map<string, string> }` (topicId bzw. moduleId → ISO)
  - `plantStage(cards: Card[], states: Map<string, SrsState>, now: Date, retention: number, everSecure: boolean): PlantStage`
  - `type PlantView = { topic: Topic; stage: PlantStage; species: number; total: number; due: number; securePct: number }`
  - `type BedView = { module: Module; region: RegionId; plants: PlantView[]; tree: 'none' | 'bloom' | 'wilted' }`
  - `buildGarden(input: { modules: Module[]; topics: Topic[]; cards: Card[]; states: Map<string, SrsState>; now: Date; retention: number; chosen: AreaChoices; milestones: Milestones }): BedView[]` (Beete nach Modulname, Pflanzen nach Themenname)
  - `newMilestones(garden-Eingaben ohne milestones + milestones): { topics: string[]; modules: string[] }` – Themen/Module, die **jetzt** sicher bzw. endgültig besiegt sind und noch keinen Eintrag haben.
  - `SPECIES_COUNT = 12`, `REGION_SPECIES: Record<RegionId, number[]>` (je Region 4 Arten-Indizes), `speciesFor(topicId: string, region: RegionId): number` (stabil per Hash).
  - `bloomCount(beds: BedView[]): number` (blühende Pflanzen + blühende Bäume).

Stufen-Regel (Builder-Entscheidung, Spec 10 lässt Schwellen offen): keine Karte gelernt → `seed`; sicher → `bloom`; sonst, wenn `everSecure` und mindestens eine gelernte Karte unsicher → `wilted`; sonst nach Anteil sicherer unter allen Karten: < 50 % → `sprout`, ≥ 50 % → `young`. `due` = gelernte Karten, die nicht sicher sitzen (für das Schild „welkt · 3 Karten fällig“).

- [ ] **Step 1: Failing tests** in `app/test/garden.test.ts`:
  - `plantStage`: ohne gelernte Karte → `'seed'`; alle sicher → `'bloom'`; 1 von 4 sicher, nie sicher gewesen → `'sprout'`; 3 von 4 sicher → `'young'`; einmal sicher gewesen, jetzt eine gelernte Karte unsicher → `'wilted'`; einmal sicher gewesen, nur eine **neue** Karte dazugekommen → nicht `'wilted'` (Spec: Nur Gelerntes zählt) sondern `'young'`.
  - `buildGarden`: Beete nach Modulname sortiert, Pflanzen nach Themenname; gelöschte Karten zählen nicht; Modul ohne Themen → Beet mit `plants: []`; Baum `'none'` ohne Meilenstein, `'bloom'` mit Meilenstein und alle Themen sicher, `'wilted'` mit Meilenstein und ein Thema unsicher.
  - `newMilestones`: liefert ein frisch sicheres Thema genau einmal (mit vorhandenem Eintrag → leer); Modul nur, wenn alle Themen (≥ 1) gleichzeitig sicher.
  - `speciesFor`: gleiche Eingabe → gleiche Art; Ergebnis ∈ `REGION_SPECIES[region]`.
- [ ] **Step 2:** `npm.cmd test -w app -- garden` → FAIL (Modul fehlt).
- [ ] **Step 3:** `garden.ts` umsetzen (Region des Moduls über `assignBosses(modules, chosen)` + `regionOf`).
- [ ] **Step 4:** `npm.cmd test -w app -- garden` → PASS.
- [ ] **Step 5:** Commit `feat(game): Pflanzen-Modell fürs Gewächshaus`.

### Task 2: Meilensteine speichern

**Files:**
- Modify: `app/src/data/game.ts`
- Test: `app/test/game.test.ts`

**Interfaces:**
- Consumes: `putGameItem`; `Milestones`, `newMilestones` (Task 1).
- Produces:
  - `loadMilestones(): Promise<Milestones>` – liest `topic:<id>` (`data.securedAt`) und `boss:<moduleId>` (`data.defeatedAt`).
  - `recordMilestones(found: { topics: string[]; modules: string[] }, now: Date): Promise<number>` – schreibt nur die übergebenen, gibt die Anzahl zurück.

- [ ] **Step 1: Failing tests:** `recordMilestones` schreibt je Eintrag eine Zeile und eine Outbox-Zeile; `loadMilestones` liest sie zurück; zweiter Aufruf mit den von `newMilestones` gelieferten (dann leeren) Listen schreibt **nichts** (Outbox-Zahl unverändert).
- [ ] **Step 2:** Test laufen lassen → FAIL.
- [ ] **Step 3:** Umsetzen (Präfixe `topic:` / `boss:` wie `area:`).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(data): Meilensteine für Gewächshaus speichern`.

### Task 3: Pflanzen-Stil-Entwurf (Haltepunkt)

**Files:**
- Create (Entwurf, nicht eingecheckt): `docs/entwurf-pflanzen.html`

- [ ] **Step 1:** Mit `create_1_direction_object` (64 px, `item_descriptions`) 4 Beispiel-Arten in voller Blüte erzeugen, passend zur Gewächshaus-Kulisse (gedeckte Palette, leuchtender Akzent, Topf-/Beet-frei, transparenter Hintergrund); dazu für eine Art die Stufen Sämling, jung, welk (über `create_object_state` oder `edit_image` mit der Blüte als Vorlage, damit es dieselbe Pflanze bleibt). Budget: ≤ 60 Generierungen.
- [ ] **Step 2:** Entwurf als klickbare Seite: Blickpunkt „Beet links“ mit Pflanzen in allen Stufen auf den Beet-Plätzen, Schild-Beispiel; an den Nutzer schicken (SendUserFile).
- [ ] **Step 3: HALT** – auf das OK des Nutzers warten; Änderungswünsche hier umsetzen. Erst danach Task 4.

### Task 4: Grafik-Vorrat

**Files:**
- Create: `app/public/game/garden/views/{gang,tuer,zurueck,beet}.png` (die freigegebenen Blickpunkte aus dem Test, Jobs 009a993d, d25dde10, e8370a17, a8b2850a)
- Create: `app/public/game/garden/plants/p<arten-index>_<stufe>.png` für `young|bloom|wilted` je Art (12 Arten), `sprout.png`, `seed.png`; `tree_bloom.png`, `tree_wilted.png`
- Create: `app/public/game/garden/insects/{butterfly,bee}_<i>.png` (je 4 Bilder Flügelschlag)
- Modify: `app/public/game/STIL.md` (Abschnitt „Gewächshaus“ mit Werkzeugen und Prompts)

- [ ] **Step 1:** Restliche Arten (bis 12) im freigegebenen Stil, Stufen je Art wie im Entwurf; Baum in 2 Zuständen; 2 Insekten mit 4 Bildern. Budget gesamt Teil 3 ≤ 300.
- [ ] **Step 2:** Mit `app/scripts/slice_assets.py` (oder kleinem Zusatz) auf gemeinsame Leinwand bringen: Pflanzen 64×64 mit Fuß unten mittig; Insekten 32×32.
- [ ] **Step 3:** Größe prüfen: `du -sh app/public/game/garden` → Expected: < 1,5 MB.
- [ ] **Step 4:** Commit `feat(game): Grafiken fürs Gewächshaus`.

### Task 5: Blickpunkte und Beet-Plätze

**Files:**
- Modify: `app/src/game/scenes.ts`
- Test: `app/test/scenes.test.ts`

**Interfaces:**
- Consumes: `gameAsset`; `PlantStage` (Task 1).
- Produces:
  - `type ViewId = 'gang' | 'tuer' | 'zurueck' | 'beetL' | 'beetR'`
  - `type Move = 'forward' | 'left' | 'right' | 'back'`
  - `type BedArea = { side: 'left' | 'right'; x: number; y: number; w: number; h: number; scale: number; max: number }` (Fläche in % der Kulisse, `scale` = Pflanzengröße relativ zur Nahansicht, `max` = höchstens so viele Pflanzen sichtbar)
  - `GARDEN_VIEWS: Record<ViewId, { image: string; mirror?: boolean; name: string; moves: Partial<Record<Move, ViewId>>; door?: boolean; beds: BedArea[] }>` – Navigation wie im Rundgang: `gang` →forward `tuer`, left `beetL`, right `beetR`; `tuer` →back `zurueck`, door; `zurueck` →forward `gang`, left `beetR`, right `beetL`; `beetL`/`beetR` →back `gang`. `beetR` = `beet.png` gespiegelt.
  - `plantImage(species: number, stage: PlantStage): string`, `treeImage(state: 'bloom' | 'wilted'): string`, `insectFrames(kind: 'butterfly' | 'bee'): string[]`
  - `slotPositions(area: BedArea, count: number): { x: number; y: number; size: number }[]` – verteilt `min(count, area.max)` Pflanzen in bis zu 2 Reihen über die Fläche; `size` in % der Kulissenbreite, schrumpft bei vielen Pflanzen, aber nie unter dem Wert, der 32 px Trefferfläche bei 375 px Breite ergibt.

Beet-Zuordnung (Builder-Entscheidung, Spec 10): linkes Beet = 1., 3., 5. … Modul, rechtes Beet = 2., 4., … Modul. Die Fernansichten (`gang`, `zurueck`) zeigen je Seite das vorderste Beet; die Nahansichten `beetL`/`beetR` zeigen ein Beet und blättern bei mehreren Modulen auf derselben Seite (Task 6).

- [ ] **Step 1: Failing tests:** jede `moves`-Kante zeigt auf eine vorhandene Ansicht; jede Ansicht ist von `gang` erreichbar; `slotPositions` liefert `min(count, max)` Positionen innerhalb der Fläche, alle `size` ≥ Mindestgröße, bei 30 Pflanzen kleiner als bei 3; `plantImage(0, 'sprout')` ist für alle Arten dasselbe Bild.
- [ ] **Step 2:** → FAIL. **Step 3:** umsetzen; Flächen an den vier Bildern ausmessen (Beet-Oberkante/-unterkante). **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(game): Blickpunkte und Beet-Plätze im Gewächshaus`.

### Task 6: Gewächshaus-Bildschirm

**Files:**
- Create: `app/src/ui/GreenhouseScreen.tsx`, `app/src/ui/game/SceneMenu.tsx`
- Modify: `app/src/ui/CampScreen.tsx` (Menü in `SceneMenu` auslagern, Knopf „Gewächshaus“), `app/src/ui/theme.css`
- Test: `app/test/ui/greenhouse.test.tsx`, `app/test/ui/camp.test.tsx`

**Interfaces:**
- Consumes: `buildGarden`, `newMilestones`, `bloomCount` (Task 1); `loadMilestones`, `recordMilestones`, `loadAreaChoices` (Task 2 / Teil 2); `GARDEN_VIEWS`, `slotPositions`, Bild-Funktionen (Task 5); `Sprite`; `SyncStatus`, `syncText` (CampScreen).
- Produces:
  - `GreenhouseScreen` Props `{ now?: () => Date; sync: SyncStatus; refreshKey?: number; onCamp: () => void; onSettings: () => void; onSyncNow?: () => void }`
  - `SceneMenu` Props `{ sync: SyncStatus; dead: number; onSettings: () => void; onSyncNow?: () => void }` (Knopf „Menü“ + Panel wie heute im Waldplatz)
  - `CampScreen` bekommt `onGreenhouse?: () => void` (Knopf „Gewächshaus“ in der Szene oben links unter dem Hinweis).

Verhalten: Laden (Karten, States, Themen, Module, Einstellungen, Gebiete, Meilensteine) → `newMilestones` → `recordMilestones` (Fehler still schlucken, Anzeige nicht blockieren) → Garten bauen. Navigationsknöpfe unter der Szene: „↶ Links“, „↑ Vorwärts“, „Rechts ↷“, „↓ Umdrehen“ (fehlende Richtung = gesperrt); an der Tür heißt Vorwärts „↑ Zum Lagerfeuer“ und ruft `onCamp`. Pflanzen als Knöpfe mit `aria-label` `${Thema}` → Schild (`role="status"`) „Chloroplasten · Botanik · sitzt sicher · 12 Karten“ / „wächst · 4 von 6 sicher“ / „welkt · 3 Karten fällig“ / „Saat · noch nichts gelernt“. Holzschild je Beet mit Modulname; bei mehreren Beeten auf einer Seite in der Nahansicht „‹ Beet“ / „Beet ›“. Baum mitten im Beet der Nahansicht. Insekten: `min(8, floor(bloomCount / 2))`, abwechselnd Schmetterling/Biene, fliegen per CSS-Animation (bei `prefers-reduced-motion` still). Ohne Module: Hinweis „Noch keine Beete – erstelle Karten in der Werkstatt“.

- [ ] **Step 1: Failing tests** (`greenhouse.test.tsx`, Daten über Dexie wie `camp.test.tsx`):
  - zeigt „Eingang“ und die Knöpfe; „↑ Vorwärts“ → „An der Tür“; „↑ Zum Lagerfeuer“ ruft `onCamp`; „↓ Umdrehen“ → „Blick zurück“.
  - Pflanze antippen zeigt das Schild mit Thema, Modul, Zustand und Kartenzahl (Fälle: sitzt sicher, welkt mit Meilenstein, Saat).
  - Öffnen schreibt den Meilenstein eines frisch sicheren Themas; zweites Öffnen schreibt nichts mehr (Outbox-Zahl gleich).
  - 3 Module: linke Nahansicht zeigt Beet 1, „Beet ›“ blättert zu Beet 3.
  - Insekten: 0 ohne Blüte, > 0 mit vier blühenden Themen.
  - ohne Module: Hinweistext.
  - `camp.test.tsx`: Knopf „Gewächshaus“ ruft `onGreenhouse`; Menü-Tests bleiben grün.
- [ ] **Step 2:** → FAIL. **Step 3:** umsetzen. **Step 4:** `npm.cmd test` → alles grün.
- [ ] **Step 5:** Commit `feat(game): Gewächshaus mit Beeten, Pflanzen und Insekten`.

### Task 7: Neuer Ablauf und Sichtprüfung

**Files:**
- Modify: `app/src/App.tsx`
- Test: `app/test/ui/app.test.tsx`

**Interfaces:**
- Consumes: `GreenhouseScreen` (Task 6), `CampScreen.onGreenhouse`.
- Produces: `View` um `{ name: 'greenhouse' }` erweitert; Titelbild → `greenhouse`; Tür → `camp`; Waldplatz „Gewächshaus“ → `greenhouse`; Einstellungen „Zurück“ → vorherige Szene (greenhouse oder camp); nach dem Kampf → `camp` (unverändert).

- [ ] **Step 1: Failing tests:** nach „Los geht's“ erscheint das Gewächshaus („Eingang“); Vorwärts + „Zum Lagerfeuer“ → Waldplatz; „Gewächshaus“ → zurück; der bestehende Kampf-Ablauftest (Feuer → Karte → Kämpfen → Waldplatz) läuft über den neuen Weg.
- [ ] **Step 2:** → FAIL. **Step 3:** umsetzen. **Step 4:** `npm.cmd test` grün, `npx.cmd tsc -p app --noEmit` sauber, `npm.cmd run build -w app` ok.
- [ ] **Step 5:** Sichtprüfung (temporäre Seite mit Beispieldaten wie in Teil 2, danach löschen): Hoch- (375×812) und Querformat (1280×720) – alle 5 Blickpunkte, Pflanzen in allen Stufen, Schild, Insekten, Baum; keine Konsolenfehler. Screenshots an den Nutzer.
- [ ] **Step 6:** Commit `feat(game): Gewächshaus als Zuhause`.
- [ ] **Step 7:** Mit Zustimmung des Nutzers: in `main` zusammenführen, pushen, Deploy abwarten, Live-Seite prüfen.
