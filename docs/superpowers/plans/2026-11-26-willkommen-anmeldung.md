# Willkommensseite und geführte Anmeldung – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abgemeldete sehen zuerst eine Willkommensseite. „Ich bin neu“ führt in drei Schritten durch Registrieren, E-Mail-Bestätigung und Anmelden.

**Architecture:**
- Eine neue Komponente `WelcomeFlow` ersetzt in `App.tsx` den direkten `LoginScreen`. Sie hält den aktuellen Schritt selbst.
- `LoginScreen` wird zum reinen Formular. Ob registriert oder angemeldet wird, Überschrift, Knopftext und vorausgefüllte E-Mail kommen jetzt als Props von `WelcomeFlow`.

**Tech Stack:** React 18, TypeScript, supabase-js, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-26-willkommen-anmeldung-design.md`

## Global Constraints

- **Texte (Deutsch, Du-Form):**
  - Willkommensseite: „Willkommen bei Lernabenteuer“, „Ich bin neu“ (Hauptknopf), „Ich habe schon ein Konto“, „Eigene Datenbank verwenden“, „Eigene Datenbank: …“
  - Fortschritt: „Schritt x von 3“
  - Schritt 1: „Konto anlegen“ (Überschrift und Knopf), dazu der Satz „Mit dieser E-Mail und diesem Passwort meldest du dich später an, auch am PC.“
  - Schritt 2: „Wir haben dir eine Mail an <Adresse> geschickt. Tippe auf den Link darin und komm dann hierher zurück.“ und „Keine Mail? Schau im Spam-Ordner nach.“
  - Schritt 2, Knopf: „Ich habe bestätigt – weiter“
  - Schritt 2, Zusatz: Wenn der Link eine Fehlerseite („Verbindung abgelehnt“) öffnet, ist die Mail trotzdem bestätigt.
  - Jeder Schritt hat „Zurück“.
- **Passwort:** mindestens 6 Zeichen (`minLength={6}` wie heute).
- **Kein „schon gesehen“-Speicher.** Die Willkommensseite erscheint bei jedem Start im abgemeldeten Zustand.
- **Konventionen:**
  - Repo-Dateien sind LF; Python schreibt mit `newline=''`. Prettier nicht laufen lassen.
  - UI-Tests warten mit `findBy…` oder `vi.waitFor`.
- **Befehle:**
  - Tests: `npx.cmd vitest run <Datei>`, alle mit `npm.cmd test`
  - Typen: `npx.cmd tsc -p app --noEmit`
- **Commits** enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nicht pushen ohne Zustimmung.

## Review Focus

1. **Registrierung mit einer schon vergebenen E-Mail.** Supabase liefert bei aktivierter Bestätigung oft keinen Fehler, aber auch keine Sitzung. Der Ablauf zeigt dann Schritt 2, und das ist in Ordnung. Er darf aber nicht abstürzen oder hängen bleiben. Getestet in Task 1 über `onSubmit` → `'confirm'`.
2. **Anmelden vor dem Bestätigen** („Email not confirmed“): Es erscheint der Hinweis, zuerst den Link anzutippen, statt nur der englische Fehlertext. Getestet in Task 1.
3. **Registrierung liefert sofort eine Sitzung** (Bestätigung aus): Es gibt keinen Schritt 2. `App` wechselt von selbst ins Spiel. Getestet in Task 1 (kein Schritt 2) und Task 2.
4. **Eine eigene Datenbank ist eingetragen:** Der Hinweis „Eigene Datenbank: …“ und der Link sind auf der Willkommensseite erreichbar. Getestet in Task 1.
5. **Doppelklick auf „Konto anlegen“:** Der Knopf ist gesperrt, solange die Anfrage läuft (wie heute über `busy`). Bestehendes Verhalten, im Review prüfen.

---

### Task 1: WelcomeFlow und Formular

**Files:**
- Create: `app/src/ui/WelcomeFlow.tsx`
- Modify: `app/src/ui/LoginScreen.tsx`
- Test: `app/test/ui/auth.test.tsx` (`describe('LoginScreen')` wird zu `describe('WelcomeFlow')`)

**Interfaces:**
- Produces:

```ts
// LoginScreen.tsx
export type AuthMode = 'signIn' | 'signUp'
/** 'confirm' = Konto angelegt, E-Mail muss noch bestätigt werden. */
export type AuthResult = 'confirm' | void
type LoginProps = {
  mode: AuthMode
  title: string
  submitLabel: string
  initialEmail?: string
  /** Wirft bei Fehlern. */
  onSubmit: (email: string, password: string) => Promise<AuthResult>
  onBack?: () => void
  children?: ReactNode // Text unter der Überschrift (z. B. Fortschritt, Erklärung)
}
export function LoginScreen(props: LoginProps): JSX.Element

// WelcomeFlow.tsx
type Props = {
  onSubmit: (mode: AuthMode, email: string, password: string) => Promise<AuthResult>
  database?: string
  onUseOwnDatabase?: () => void
}
export function WelcomeFlow(props: Props): JSX.Element
```

- **Schritte in `WelcomeFlow`:** `'welcome' | 'signIn' | 'signUp' | 'confirm' | 'signInAfter'`. E-Mail-Adresse und Schrittwechsel liegen im State.
- **Fehlertext:** Wirft `onSubmit` einen Fehler mit `/not confirmed/i` in der Nachricht, zeigt das Formular „Deine E-Mail ist noch nicht bestätigt. Tippe zuerst auf den Link in der Mail.“ Andere Fehler erscheinen wie heute: „Anmeldung fehlgeschlagen: …“ bzw. „Registrierung fehlgeschlagen: …“.

- [ ] **Step 1: Failing tests.** Den `describe('LoginScreen')`-Block durch `describe('WelcomeFlow')` ersetzen:
  - **„zeigt zuerst die Willkommensseite“:** Überschrift „Willkommen bei Lernabenteuer“ und beide Knöpfe sind sichtbar. Es gibt kein Feld „E-Mail“.
  - **„Bestandsnutzer: Ich habe schon ein Konto → Anmelden, Zurück führt zurück“:**
    - Ausfüllen und Knopf „Anmelden“ führt zu `onSubmit('signIn', 'a@b.de', 'geheim1')`.
    - „Zurück“ zeigt wieder die Willkommensseite.
  - **„Neu: drei Schritte bis zur Anmeldung“:**
    - `onSubmit` gibt bei `'signUp'` `'confirm'` zurück.
    - Nach „Ich bin neu“ stehen „Schritt 1 von 3“, die Überschrift „Konto anlegen“ und der Satz zu PC/Passwort.
    - Nach dem Absenden kommen per `findByText` „Schritt 2 von 3“, die Mail-Adresse im Text, „Spam-Ordner“ und der Hinweis auf die Fehlerseite.
    - „Ich habe bestätigt – weiter“ führt zu „Schritt 3 von 3“ und Überschrift „Anmelden“. Das E-Mail-Feld hat den Wert `a@b.de`.
    - Knopf „Anmelden“ führt zu `onSubmit('signIn', 'a@b.de', <Passwort>)`.
  - **„Registrierung mit sofortiger Sitzung: kein Bestätigungsschritt“:** `onSubmit` gibt `undefined` zurück. Danach erscheint kein „Schritt 2 von 3“ (nach `vi.waitFor` auf den Aufruf).
  - **„Anmelden vor Bestätigung: verständlicher Hinweis“:** `onSubmit` wirft `new Error('Email not confirmed')`. Erwartet wird ein Alert mit „noch nicht bestätigt“.
  - **„zeigt Fehler deutsch an“:** Den bestehenden Test über „Ich habe schon ein Konto“ führen.
  - **„eigene Datenbank: Hinweis und Link auf der Willkommensseite“:**
    - Mit `database="https://x.supabase.co"` ist der Text „Eigene Datenbank: https://x.supabase.co“ sichtbar.
    - Der Link „Eigene Datenbank verwenden“ ruft `onUseOwnDatabase` auf.

- [ ] **Step 2: Rot prüfen.** `npx.cmd vitest run app/test/ui/auth.test.tsx`. Erwartet: FAIL, weil `WelcomeFlow` fehlt.

- [ ] **Step 3: Umsetzen.**
  - `LoginScreen` auf die neuen Props umbauen. Den Modus-Umschalter „Noch kein Konto? Registrieren“ und den Datenbank-Link entfernen; beides übernimmt jetzt `WelcomeFlow`.
  - `WelcomeFlow` nutzt `card-panel` und bestehende Knopfklassen (`primary`, `link`).

- [ ] **Step 4: Grün prüfen.** `npx.cmd vitest run app/test/ui/auth.test.tsx`. Erwartet: PASS. `tsc` meldet noch einen Fehler in `App.tsx`; den behebt Task 2.

- [ ] **Step 5: Commit** `feat(ui): Willkommensseite mit geführter Anmeldung`.

### Task 2: In die App einbauen

**Files:**
- Modify: `app/src/App.tsx` (`authenticate`, Abschnitt `if (!signedIn)`)
- Modify: `docs/setup.md` (Abschnitt 5, Variante A)
- Test: `app/test/ui/app.test.tsx`, `app/test/ui/auth.test.tsx` (App-Fälle ab Zeile ~60, die die Überschrift „Anmelden“ erwarten)

**Interfaces:**
- Consumes: `WelcomeFlow`, `AuthResult` aus Task 1.

- [ ] **Step 1: Failing tests anpassen.**
  - App-Tests, die abgemeldet direkt die Überschrift „Anmelden“ erwarten, warten jetzt auf „Willkommen bei Lernabenteuer“. Wo sie danach das Formular brauchen, klicken sie vorher „Ich habe schon ein Konto“. Dafür einen Helfer `toSignIn()` im jeweiligen Testfile anlegen.
  - Neuer App-Test **„Registrierung ohne Bestätigung meldet direkt an“:**
    - Den Supabase-Client-Mock so aufsetzen, dass `signUp` eine Sitzung liefert. Dem Muster der bestehenden Anmelde-Tests in diesem File folgen.
    - Erwartet: Das Spiel startet, es gibt keinen „Schritt 2 von 3“.
  - Neuer App-Test **„Registrierung mit Bestätigung zeigt Schritt 2“:** `signUp` liefert `session: null`.

- [ ] **Step 2: Rot prüfen.** `npx.cmd vitest run app/test/ui/app.test.tsx app/test/ui/auth.test.tsx`. Erwartet: FAIL.

- [ ] **Step 3: Umsetzen.**
  - `authenticate` gibt `Promise<AuthResult>` zurück: bei `signUp` ohne `data.session` den Wert `'confirm'`, statt des bisherigen Hinweistexts.
  - Abgemeldet wird `<WelcomeFlow onSubmit={authenticate} database={override?.url} onUseOwnDatabase={() => setSetupOpen(true)} />` gerendert.
  - `docs/setup.md`, Abschnitt 5, Variante A: Satz ergänzen: „Die App führt Neue selbst durch die Anmeldung: Auf der Startseite ‚Ich bin neu‘ wählen.“

- [ ] **Step 4: Alles prüfen.** `npm.cmd test` und `npx.cmd tsc -p app --noEmit`. Erwartet: alle Tests grün, keine Typfehler.

- [ ] **Step 5: Sichtprüfung.**
  - Dev-Server `app-dev` starten und abgemeldet im Handy-Format (375×812) ansehen: Willkommensseite, Schritt 1 und Schritt 2.
  - Schritt 2 lässt sich ohne echte Registrierung über einen temporären `vcheck` mit gemocktem `onSubmit` zeigen. `vcheck` danach löschen.
  - Screenshot für den Nutzer machen.

- [ ] **Step 6: Commit** `feat(ui): App startet abgemeldet mit der Willkommensseite`.
