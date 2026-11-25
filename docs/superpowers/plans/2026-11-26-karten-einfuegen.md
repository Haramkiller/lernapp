# Karten einfügen – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freunde ohne Abo erstellen Karten im kostenlosen claude.ai und fügen die Antwort über „Karten erstellen“ in die App ein.

**Architecture:**
- Auswertung (`parseGeneration`) und Auftragsregeln wandern von der Werkstatt nach `shared`. Die Werkstatt nutzt sie unverändert weiter.
- In der App gibt es drei neue Teile:
  - Reine Logik in `app/src/cards/`: Chat-Auftrag, Seitentipp, Vorbereitung mit Doppel-Prüfung und IDs.
  - Datenzugriff in `app/src/data/cardImport.ts`: lokale Modulinhalte lesen, in Supabase schreiben.
  - Ein geführter Ablauf `CardImportFlow` mit 4 Schritten. `App` öffnet ihn aus dem Szenenmenü und aus dem leeren Gewächshaus.

**Tech Stack:** React 18, TypeScript, zod, supabase-js, Dexie, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-26-karten-einfuegen-design.md`

## Global Constraints

- **Texte (Deutsch, Du-Form):**
  - Einstieg: Menüknopf „Karten erstellen“. Leeres Gewächshaus: „Noch keine Beete.“ und Knopf „Karten erstellen“.
  - Fortschritt: „Schritt x von 4“.
  - Überschriften: „Modul wählen“, „Auftrag kopieren“, „Antwort einfügen“, „Ergebnis“.
  - Knöpfe: „Weiter“, „Auftrag kopieren“, „Prüfen“, „Speichern“, „Weitere Seiten“, „Fertig“, „Zurück“.
  - Zählung: „N Karten erkannt“, „N fehlerhaft übersprungen“, „N schon vorhanden, übersprungen“, nach dem Speichern „N Karten gespeichert“.
  - Keine Karte erkannt: „Keine Karten gefunden. Hast du die ganze Antwort kopiert?“
  - Seitentipp: „Weiter ab Seite N“ bzw. „Weiter mit den nächsten Seiten“.
- **Anleitung in Schritt 2:**
  - claude.ai öffnen und kostenlos anmelden (Link https://claude.ai).
  - Neuen Chat starten, Skript-PDF anhängen, Auftrag einfügen, senden.
  - Antwort mit dem Kopieren-Knopf unter der Antwort kopieren.
  - Hinweis: Im kostenlosen Zugang sind Nachrichten begrenzt, deshalb etwa 10–15 Karten auf einmal.
- **Auftrag:**
  - „Lies das angehängte PDF“, kein Dateipfad.
  - Enthält Modulname und vorhandene Themen.
  - Etwa 10–15 Karten pro Antwort, ab Seite 1. Versteht „Weiter ab Seite N“ und „Weiter“.
  - `source.file` = Name des angehängten PDFs, `source.page` = Seite im PDF.
  - `fromExam` und `examRelevant` immer `false`. Nur das JSON-Objekt als Antwort.
- **Doppel:** Typ + normalisierter Fragetext (`question` bei choice/free, `text` bei cloze, `prompt` bei matching/order). Verglichen wird mit dem Modul (ohne gelöschte Karten) und mit Karten weiter oben in derselben Antwort.
- **Werkstatt:** Verhalten unverändert. Ihre bestehenden Tests bleiben unverändert grün.
- **Nicht im Umfang:** Altklausuren, Karten bearbeiten, Offline-Warteschlange, Datei-Upload.
- **Konventionen:**
  - Repo-Dateien sind LF; Python schreibt mit `newline=''`. Prettier nicht laufen lassen.
  - UI-Tests warten mit `findBy…` oder `vi.waitFor`.
- **Befehle:**
  - Einzeln: `npx.cmd vitest run <Datei>`; alle: `npm.cmd test`.
  - Typen: `npx.cmd tsc -p app --noEmit`, `npx.cmd tsc -p werkstatt --noEmit`, `npx.cmd tsc -p shared --noEmit`, soweit es die tsconfig gibt.
- **Commits** enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nicht pushen ohne Zustimmung.

## Review Focus

1. **Alle Karten sind schon vorhanden** (dieselbe Antwort zweimal eingefügt): Es gibt keinen Knopf „Speichern“, sondern die Zählung und den Hinweis, dass nichts Neues dabei ist. Test in Task 4.
2. **Speichern scheitert** (offline, Serverfehler): Hinweis erscheint, Text und Ergebnis bleiben stehen. Ein zweiter Versuch schreibt dieselben IDs, also keine Doppel. Test in Task 4 (UI) und Task 3 (gleiche IDs).
3. **„Weitere Seiten“ ohne erfolgreiche Synchronisierung danach:** Karten aus dieser Sitzung zählen trotzdem als vorhanden. Test in Task 4.
4. **Neues Modul mit dem Namen eines bestehenden** (Groß-/Kleinschreibung egal): Es wird das bestehende Modul genommen, kein zweites angelegt. Test in Task 4.
5. **Themenname in anderer Schreibweise** („moose“ vs. „Moose“): Die Karte landet im bestehenden Thema, kein neues Thema. Test in Task 2.

---

### Task 1: Auswertung und Auftragsregeln nach `shared`

**Files:**
- Create: `shared/src/generation.ts`, `shared/test/generation.test.ts`
- Modify: `shared/src/index.ts`, `werkstatt/src/parse.ts`, `werkstatt/src/prompts.ts`

**Interfaces:**
- Produces (Export aus `@lernapp/shared`):

```ts
export class ParseError extends Error {}
export interface ParseOutcome { result: GenerationResult; rejected: { index: number; reason: string }[] }
export function parseGeneration(raw: string): ParseOutcome
export const CARD_EXAMPLE: string   // bisher EXAMPLE in prompts.ts
export const PAYLOAD_RULES: string  // bisher PAYLOAD_RULES in prompts.ts
```

- [ ] **Step 1: Failing test** `shared/test/generation.test.ts`:
  - **„rettet vollständige Karten aus abgeschnittener Antwort mit Codeblock“:** Eingabe ist Text davor, dann ```` ```json ````, dann zwei gültige choice-Karten und eine abgeschnittene dritte. Erwartet `result.cards.length === 2` und `rejected` leer.
  - **„zählt ungültige Karte als rejected“:** Eine Karte hat 3 Optionen. Erwartet ist `rejected[0].index === 1`.
  - **„kein JSON wirft ParseError“.**
  - **„PAYLOAD_RULES und CARD_EXAMPLE enthalten das Kartenformat“:** Die Texte enthalten `{{1}}` und `"cards"`.
- [ ] **Step 2: Rot prüfen.** `npx.cmd vitest run shared/test/generation.test.ts`. Erwartet: FAIL, Modul fehlt.
- [ ] **Step 3: Umsetzen.**
  - Inhalt von `werkstatt/src/parse.ts` unverändert nach `shared/src/generation.ts` verschieben, ebenso `EXAMPLE` (als `CARD_EXAMPLE`) und `PAYLOAD_RULES` aus `prompts.ts`.
  - Export in `shared/src/index.ts`.
  - `werkstatt/src/parse.ts` wird zu `export { parseGeneration, ParseError, type ParseOutcome } from '@lernapp/shared'`.
  - `prompts.ts` importiert beide Konstanten.
- [ ] **Step 4: Grün prüfen.** `npx.cmd vitest run shared werkstatt`. Erwartet: alles PASS, Werkstatt-Tests unverändert.
- [ ] **Step 5: Commit** `refactor(shared): Kartenauswertung und Auftragsregeln für App und Werkstatt`.

### Task 2: Chat-Auftrag, Seitentipp, Vorbereitung

**Files:**
- Create: `app/src/cards/chatPrompt.ts`, `app/src/cards/prepare.ts`
- Test: `app/test/cards/chatPrompt.test.ts`, `app/test/cards/prepare.test.ts`

**Interfaces:**
- Consumes: `parseGeneration`, `ParseError`, `CARD_EXAMPLE`, `PAYLOAD_RULES`, `normalize`, `CardDraft`, `Card`, `Module`, `Topic` aus `@lernapp/shared`.
- Produces:

```ts
// chatPrompt.ts
export function chatPrompt(ctx: { moduleName: string; existingTopics: string[] }): string
export function nextPageHint(cards: { source: { page: number } | null }[]): string

// prepare.ts
export type ImportTarget = { kind: 'existing'; module: Module } | { kind: 'new'; name: string }
export type ModuleContent = { topics: Topic[]; cards: Card[] }
export type Prepared = {
  module: Module          // bei 'new' frisch angelegt
  isNewModule: boolean
  topics: Topic[]         // nur neu anzulegende Themen
  cards: Card[]           // nur neue Karten, ohne Doppel
  found: number           // erkannte gültige Karten (vor Doppel-Prüfung)
  rejected: number
  duplicates: number
}
export function questionKey(d: Pick<CardDraft, 'type' | 'payload'>): string
/** Wirft ParseError, wenn die Antwort kein JSON mit Karten enthält. */
export function prepareImport(raw: string, target: ImportTarget, existing: ModuleContent, now: Date, newId?: () => string): Prepared
```

- [ ] **Step 1: Failing tests.**
  - **chatPrompt:**
    - „enthält Modul, Themen und Format“: Mit `{ moduleName: 'Botanik', existingTopics: ['Moose'] }` enthält der Text `Botanik`, `"Moose"`, `angehängte`, `10–15`, `Weiter ab Seite`, `{{1}}`, `"cards"` und `"fromExam": false` bzw. die Regel dazu.
    - Er enthält weder `Read-Werkzeug` noch `Pfad`.
    - Ohne Themen steht der Satz „noch keine Themen“ drin.
  - **nextPageHint:** Seiten `[3, 9, null]` ergeben `'Weiter ab Seite 10'`. Nur `null` oder eine leere Liste ergibt `'Weiter mit den nächsten Seiten'`.
  - **prepareImport** (feste `now`, `newId` zählt `id-1`, `id-2`, …):
    - „neues Modul: Modul, Themen und Karten mit IDs und Zeitstempeln“:
      - Erwartet `isNewModule`, `module.name === 'Botanik'`, `examDate: null`, `styleProfile: null`.
      - Jede Karte hat `moduleId === module.id`, `topicId` auf ein Thema aus `topics`, `createdAt === updatedAt === now.toISOString()`, `deleted: false` und kein Feld `topic`.
    - „bestehendes Thema in anderer Schreibweise wird wiederverwendet“: Vorhanden ist das Thema `Moose`, die Karte hat das Thema `moose`. Erwartet `topics` leer und `topicId` des vorhandenen Themas.
    - „Doppel gegen Modul und innerhalb der Antwort“:
      - Eine vorhandene Karte hat die gleiche Frage mit anderer Groß-/Kleinschreibung und Satzzeichen am Ende.
      - Zwei gleiche Karten stehen in der Antwort.
      - Erwartet `duplicates === 2` und `cards.length === found - 2`.
    - „gelöschte vorhandene Karte zählt nicht als Doppel“.
    - „gleiche Frage, anderer Typ ist kein Doppel“.
    - „ungültige Karte wird gezählt“: Erwartet `rejected === 1`.
    - „kein JSON wirft ParseError“.
- [ ] **Step 2: Rot prüfen.** `npx.cmd vitest run app/test/cards`. Erwartet: FAIL, Module fehlen.
- [ ] **Step 3: Umsetzen.**
  - **Auftrag:** Inhalt wie in Global Constraints; Regeln und Beispiel aus `shared`.
  - **Schlüssel:** `questionKey` = `type + '|' + normalize(fragetext)`.
  - **Themenzuordnung:** wie die Werkstatt (`server.ts` ~Z. 377–392), Namen per `normalize` verglichen.
- [ ] **Step 4: Grün prüfen.** `npx.cmd vitest run app/test/cards`. Erwartet: PASS.
- [ ] **Step 5: Commit** `feat(cards): Chat-Auftrag und Vorbereitung eingefügter Karten`.

### Task 3: Lesen und Speichern

**Files:**
- Create: `app/src/data/cardImport.ts`
- Test: `app/test/data/cardImport.test.ts` (fake-indexeddb wie die übrigen Datentests)

**Interfaces:**
- Consumes: `Prepared`, `ModuleContent` aus Task 2; `moduleToRow`, `topicToRow`, `cardToRow` aus `@lernapp/shared`; `db`.
- Produces:

```ts
export function loadModules(): Promise<Module[]>                        // lokal, nach Name sortiert
export function loadModuleContent(moduleId: string): Promise<ModuleContent> // lokal, ohne gelöschte Karten
/** Schreibt Modul (nur wenn neu) → Themen → Karten (in Paketen zu 200) per Upsert; wirft Error mit Supabase-Meldung. */
export function saveImport(client: SupabaseClient, p: Prepared): Promise<void>
```

- [ ] **Step 1: Failing tests.**
  - „loadModuleContent liefert Themen und nicht gelöschte Karten des Moduls“. Karten eines anderen Moduls sind nicht dabei.
  - „saveImport schreibt in der Reihenfolge modules → topics → cards als Zeilen“. Ein Fake-Client zeichnet `from(tabelle).upsert(rows)` auf. Die Zeilen entsprechen `moduleToRow` usw.
  - „bestehendes Modul wird nicht geschrieben“. „leere Themenliste: kein Aufruf für topics“.
  - „450 Karten: drei Pakete“.
  - „Fehler von Supabase bricht ab und wirft mit Meldung“: Scheitert `topics`, wird `cards` nicht aufgerufen. Die Fehlermeldung enthält den Text von Supabase.
  - „zweiter Aufruf mit demselben Prepared schreibt dieselben IDs“ (Grundlage für den Wiederholversuch).
- [ ] **Step 2: Rot prüfen.** `npx.cmd vitest run app/test/data/cardImport.test.ts`. Erwartet: FAIL.
- [ ] **Step 3: Umsetzen.**
- [ ] **Step 4: Grün prüfen.** Gleicher Befehl. Erwartet: PASS.
- [ ] **Step 5: Commit** `feat(data): eingefügte Karten lokal lesen und in Supabase speichern`.

### Task 4: Ablauf „Karten erstellen“

**Files:**
- Create: `app/src/ui/CardImportFlow.tsx`
- Modify: `app/src/ui/theme.css` (nur falls nötig; `card-panel`, `step-progress`, `row`, `primary`, `link` wiederverwenden)
- Test: `app/test/ui/cardImport.test.tsx`

**Interfaces:**
- Consumes: `chatPrompt`, `nextPageHint`, `prepareImport`, `Prepared`, `ModuleContent`, `ParseError`.
- Produces:

```ts
type Props = {
  loadModules: () => Promise<Module[]>
  loadContent: (moduleId: string) => Promise<ModuleContent>
  /** Vor dem Prüfen: synchronisieren; Fehler werden ignoriert. */
  refresh: () => Promise<void>
  /** Wirft bei Fehlern. */
  save: (p: Prepared) => Promise<void>
  onDone: () => void
  now?: () => Date
}
export function CardImportFlow(props: Props): JSX.Element
```

- **Schritte:** `'module' | 'prompt' | 'paste' | 'result'`, danach `saved` im Ergebnis-Schritt.
- **Schritt 1:**
  - Auswahl `<select aria-label="Modul">` mit den Modulen und „Neues Modul“, Feld „Name des neuen Moduls“.
  - Ohne Module ist nur das Namensfeld da.
  - „Weiter“ ist gesperrt, solange beim neuen Modul der Name leer ist.
  - Ein neuer Name, der normalisiert einem bestehenden Modul entspricht, wählt dieses Modul.
- **Schritt 2:**
  - Kopieren wie `ClipboardAsk` in `AskDialog.tsx`: `navigator.clipboard.writeText` direkt im Klick. Scheitert das, erscheint ein markiertes `<textarea readOnly aria-label="Auftrag zum Kopieren">`.
  - Darunter die Anleitung aus Global Constraints und „Weiter“.
- **Schritt 3:**
  - `<textarea aria-label="Antwort von Claude">` und „Prüfen“.
  - Prüfen ruft `await refresh()` (Fehler ignorieren), dann `loadContent`. Bei einem neuen Modul gilt der Inhalt als leer.
  - Dazu kommen Themen und Karten, die in dieser Sitzung schon gespeichert wurden, dann `prepareImport`.
  - Bei `ParseError` oder `found === 0` erscheint der Hinweis „Keine Karten gefunden…“ als Alert, und man bleibt in Schritt 3.
- **Schritt 4:**
  - Zählung. Bei `cards.length === 0`: der Satz „Keine neuen Karten dabei.“ und nur „Weitere Seiten“/„Fertig“.
  - Sonst „Speichern“ (gesperrt während des Speicherns).
  - Fehler: Alert „Speichern fehlgeschlagen: <Meldung>. Prüfe deine Verbindung und versuche es noch einmal.“ Ergebnis und Text bleiben.
  - Nach Erfolg: „N Karten gespeichert“, Seitentipp `nextPageHint` mit Knopf „Tipp kopieren“, „Weitere Seiten“ und „Fertig“.
- **Nach dem Speichern:**
  - Ein neues Modul gilt ab dann als bestehend (`Prepared.module`).
  - „Weitere Seiten“ leert das Textfeld und springt zu Schritt 3.

- [ ] **Step 1: Failing tests** (Props als `vi.fn`; `navigator.clipboard.writeText` gemockt):
  - „führt in vier Schritten von Modul bis Speichern“:
    - Neues Modul „Botanik“, Weiter. Erwartet „Schritt 2 von 4“. Auftrag kopieren ruft `writeText` mit einem Text, der „Botanik“ enthält. Weiter.
    - Antwort mit 3 gültigen Karten einfügen, Prüfen. Erwartet „3 Karten erkannt“.
    - Speichern ruft `save` mit `isNewModule: true`. Erwartet „3 Karten gespeichert“ und „Weiter ab Seite …“ passend zu den Seiten.
  - „Kopieren scheitert: Auftrag im Textfeld“: Ein Textfeld „Auftrag zum Kopieren“ mit dem Auftrag ist sichtbar.
  - „Name wie bestehendes Modul wählt das bestehende“: Modul `Botanik` ist vorhanden, Eingabe neu `botanik `. `save` bekommt `isNewModule: false` und die ID des vorhandenen Moduls.
  - „alles schon vorhanden: kein Speichern“: `loadContent` liefert die gleichen Karten. Erwartet „3 schon vorhanden, übersprungen“, „Keine neuen Karten dabei.“ und keinen Knopf „Speichern“.
  - „Speichern scheitert, zweiter Versuch mit denselben Karten“:
    - `save` wirft beim ersten Mal. Erwartet Alert mit „Speichern fehlgeschlagen“, das Ergebnis ist noch sichtbar.
    - Zweiter Klick: `save` wird zweimal mit Karten gleicher IDs aufgerufen.
  - „Weitere Seiten: Karten dieser Sitzung zählen als vorhanden“:
    - Speichern, „Weitere Seiten“, dieselbe Antwort erneut prüfen, wobei `loadContent` weiter leer liefert.
    - Erwartet „3 schon vorhanden, übersprungen“.
  - „keine Karten: Hinweis, bleibt in Schritt 3“: Bei Text `hallo` erscheint ein Alert mit „Keine Karten gefunden“.
  - „Zurück in jedem Schritt“. „Fertig ruft onDone“.
- [ ] **Step 2: Rot prüfen.** `npx.cmd vitest run app/test/ui/cardImport.test.tsx`. Erwartet: FAIL.
- [ ] **Step 3: Umsetzen.**
- [ ] **Step 4: Grün prüfen.** Gleicher Befehl. Erwartet: PASS.
- [ ] **Step 5: Commit** `feat(ui): geführter Ablauf „Karten erstellen“`.

### Task 5: In die App einbauen

**Files:**
- Modify: `app/src/App.tsx` (`View`, Rendering), `app/src/ui/game/SceneMenu.tsx`, `app/src/ui/GreenhouseScreen.tsx`, `app/src/ui/CampScreen.tsx`, `docs/setup.md` (Abschnitt 5)
- Test: `app/test/ui/app.test.tsx` und die bestehenden Tests zu Gewächshaus und Szenenmenü (mit Grep finden)

**Interfaces:**
- Consumes: `CardImportFlow` (Task 4), `loadModules`, `loadModuleContent`, `saveImport` (Task 3).
- Produces:
  - `View` bekommt `{ name: 'cards'; from: Scene }`.
  - `SceneMenu` bekommt `onCreateCards?: () => void`, das ist der Knopf „Karten erstellen“.
  - `GreenhouseScreen` und `CampScreen` bekommen `onCreateCards?: () => void` und reichen es weiter.
  - Leeres Gewächshaus: „Noch keine Beete.“ plus Knopf „Karten erstellen“, falls `onCreateCards` gesetzt ist.

- [ ] **Step 1: Failing tests.**
  - Szenenmenü-Test: Menü öffnen, „Karten erstellen“ ruft `onCreateCards`.
  - Gewächshaus-Test: Ohne Beete gibt es den Text „Noch keine Beete.“ und einen Knopf „Karten erstellen“. Der alte Werkstatt-Satz ist weg.
  - App-Test „Menü → Karten erstellen öffnet Schritt 1, Fertig führt zurück“: Angemeldet (Muster `openMenu()`), Klick auf „Karten erstellen“. Erwartet die Überschrift „Modul wählen“. „Zurück“ bzw. „Fertig“ führt zurück ins Gewächshaus.
- [ ] **Step 2: Rot prüfen.** `npx.cmd vitest run app/test/ui`. Erwartet: FAIL.
- [ ] **Step 3: Umsetzen.**
  - `App` rendert `CardImportFlow` mit:
    - `loadModules` und `loadContent=loadModuleContent`
    - `refresh=runSync`
    - `save={async (p) => { await saveImport(client!, p); void runSync() }}`
    - `onDone={() => { setRefreshKey(k => k + 1); setView({ name: view.from }) }}`
  - Schritt 1 mit „Zurück“ ruft ebenfalls `onDone`.
  - `docs/setup.md`, Abschnitt 5, nach Variante A: Satz „Ohne Claude-Abo erstellen Freunde Karten über **Karten erstellen** im Menü: Die App führt Schritt für Schritt durch den kostenlosen Chat auf claude.ai.“
- [ ] **Step 4: Alles prüfen.**
  - `npm.cmd test` und die tsc-Befehle aus Global Constraints. Erwartet: alles grün, keine Typfehler.
- [ ] **Step 5: Sichtprüfung.**
  - Dev-Server `app-dev`, Handy-Format 375×812.
  - Temporäre Prüfseite `vcheck` mit `CardImportFlow` und gemockten Props (eine Beispielantwort mit 3 Karten). Ansehen: Schritt 1, 2 und 4.
  - Screenshot für den Nutzer. `vcheck` danach löschen.
- [ ] **Step 6: Commit** `feat(ui): „Karten erstellen“ im Menü und im leeren Gewächshaus`.
