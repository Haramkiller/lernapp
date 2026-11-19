# Einrichtung – Schritt für Schritt

Diese Anleitung ist für Menschen ohne Programmierkenntnisse gedacht. Du brauchst nur einen Browser, einen Windows-PC und ein Handy. Alles, was in `<spitzen Klammern>` steht, ersetzt du durch deine eigenen Angaben.

Überblick: Die **Datenbank** (Supabase) speichert deinen Lernstand. Die **App** (GitHub Pages) ist die Lernoberfläche am Handy und am PC. Die **Werkstatt** läuft auf deinem PC und macht aus Skripten und Altklausuren Lernkarten.

---

## 1. Supabase-Projekt anlegen (Datenbank)

1. Gehe auf <https://supabase.com> und melde dich an (**Start your project**, z. B. mit deinem GitHub-Konto).
2. Klicke auf **New project**. Wähle eine Organisation, vergib einen Namen (z. B. `lernapp`) und ein Datenbank-Passwort (gut aufbewahren, du brauchst es später kaum).
3. Region: **Frankfurt (eu-central-1)**. Preisplan: **Free**. Dann **Create new project** und ein paar Minuten warten.
4. Tabellen anlegen: Links im Menü **SQL Editor** öffnen, dann **New query**. Öffne in diesem Projekt die Datei `supabase/schema.sql`, kopiere den **gesamten** Inhalt, füge ihn in das Editor-Fenster ein und klicke **Run**. Es sollte „Success“ erscheinen.
5. Anmeldung per E-Mail: **Authentication** → **Sign In / Providers** (je nach Version nur **Providers**) → **Email** muss aktiviert sein (ist standardmäßig an).
6. Optional, aber bequem: Im selben Bereich bei **Email** die Option **Confirm email** ausschalten. Dann kannst du dich ohne Bestätigungs-Mail sofort anmelden. Bei eingeschalteter Option bekommt jeder neue Nutzer erst eine E-Mail mit Bestätigungslink.
7. Zugangsdaten holen: **Project Settings** (Zahnrad) → **API** (in neueren Versionen: **API Keys**). Notiere dir:
   - **Project URL**, sieht aus wie `https://abcdefgh.supabase.co`
   - den **anon**- bzw. **publishable**-Schlüssel (der öffentliche Schlüssel). **Niemals** den `service_role`-/`secret`-Schlüssel verwenden oder weitergeben.

> **Wichtig:** Das kostenlose Supabase-Projekt wird nach etwa **1 Woche ohne Nutzung pausiert**. Dann geht die App nicht mehr online. Wiederherstellen: Auf <https://supabase.com/dashboard> das Projekt öffnen und auf **Restore project** (bzw. **Resume**) klicken, dann einige Minuten warten. Deine Daten bleiben dabei erhalten. Wer die App regelmäßig benutzt, bekommt davon nichts mit.

---

## 2. GitHub-Repository und Veröffentlichung (Pages)

1. Lege auf <https://github.com> ein Konto an (falls noch nicht vorhanden) und erstelle ein neues Repository, z. B. `lernapp`. Wähle **public** (siehe Kasten unten).

   > **Wichtig: öffentliches Repository.** GitHub Pages mit einem kostenlosen Konto funktioniert nur mit einem **öffentlichen** Repository. Folge: Code, Dokumentation (auch der Entwurf unter `docs/superpowers`) und die gesamte Commit-Historie sind für jeden im Internet lesbar. Committe daher **niemals** Passwörter, Schlüssel oder persönliche Dateien. Skripte und Klausur-PDFs bleiben lokal auf deinem PC; die Datei `.env` ist aus genau diesem Grund von Git ausgeschlossen. Der anon/publishable-Schlüssel ist von Haus aus öffentlich (er steckt in der fertigen App). Deine Daten schützt die Zugriffsregel „Row Level Security“ aus `schema.sql` – deshalb muss `schema.sql` **vollständig** ausgeführt worden sein (Abschnitt 1, Schritt 4).
2. **Wichtig vor dem ersten Push:** Damit deine private E-Mail-Adresse nicht in der Git-Historie landet, stelle im Projektordner die GitHub-„noreply“-Adresse ein. Du findest sie unter GitHub → **Settings** → **Emails** (Haken bei „Keep my email addresses private“ setzen, die Adresse wird dort angezeigt):

   ```
   git config user.email <id>+<github-name>@users.noreply.github.com
   git config user.name "<dein Name>"
   ```
3. Code hochladen (Push) auf den Branch `main`; die genauen Befehle zeigt GitHub nach dem Anlegen des Repositorys an.
4. Pages aktivieren: Im Repository **Settings** → **Pages** → bei **Source** **GitHub Actions** auswählen.
5. Schlüssel hinterlegen: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Lege zwei Secrets an:
   - Name `VITE_SUPABASE_URL`, Wert: die Project URL aus Abschnitt 1
   - Name `VITE_SUPABASE_ANON_KEY`, Wert: der anon/publishable-Schlüssel aus Abschnitt 1
6. Reiter **Actions** öffnen: Der Workflow „Deploy to GitHub Pages“ läuft bei jedem Push auf `main` (oder manuell über **Run workflow**). Wenn er grün ist, steht die App unter
   `https://<github-name>.github.io/<repo-name>/`
   (z. B. `https://max.github.io/lernapp/`). Diesen Link brauchst du für Handy, Werkstatt und Freunde.

Wenn der Workflow rot ist: Auf den Lauf klicken und die fehlgeschlagene Zeile ansehen. Häufigste Ursachen: ein Secret fehlt oder ist falsch geschrieben, oder Pages steht nicht auf „GitHub Actions“.

---

## 3. Werkstatt auf dem PC

Die Werkstatt verarbeitet Skripte und Altklausuren mit Claude und läuft nur auf deinem PC.

1. **Node.js** installieren: <https://nodejs.org> → **LTS**-Version herunterladen und mit den Standardeinstellungen installieren.
2. **Claude Code** installieren: Anleitung unter <https://claude.com/claude-code> (Windows). Danach in der Eingabeaufforderung `claude` eingeben und **einmal anmelden** (der Browser öffnet sich, mit deinem Claude-Konto einloggen). Danach mit `/exit` beenden.
3. Projektordner in der Eingabeaufforderung öffnen und `npm install` ausführen (dauert eine Weile).
4. Im Ordner `werkstatt` die Datei `.env.example` **kopieren** und die Kopie `.env` nennen. Mit dem Editor öffnen und ausfüllen:
   ```
   SUPABASE_URL=<Project URL aus Abschnitt 1>
   SUPABASE_ANON_KEY=<anon/publishable-Schlüssel>
   APP_ORIGIN=https://<github-name>.github.io
   ```
   `APP_ORIGIN` ist nur die Adresse der Seite, **ohne** `/<repo-name>` und ohne Schrägstrich am Ende.
5. Doppelklick auf `werkstatt\start.cmd`. Ein Fenster öffnet sich und nach wenigen Sekunden die Werkstatt im Browser (`http://127.0.0.1:5174`). Das Fenster muss offen bleiben, solange du die Werkstatt benutzt.

---

## 4. Auf dem Handy installieren

Öffne den Link `https://<github-name>.github.io/<repo-name>/` im Browser des Handys und melde dich an oder registriere dich.

- **Android (Chrome):** Menü (drei Punkte oben rechts) → **App installieren** (oder **Zum Startbildschirm hinzufügen**) → bestätigen.
- **iPhone (Safari):** Teilen-Symbol (Quadrat mit Pfeil) → **Zum Home-Bildschirm** → **Hinzufügen**. Das geht nur in Safari.

Danach startet die App wie eine normale App und funktioniert auch ohne Internet. Beim nächsten Online-Gehen wird der Lernstand abgeglichen.

---

## 5. Für Freunde

**Variante A: gemeinsame Datenbank (einfach).** Du gibst den App-Link weiter. Dein Freund öffnet ihn, registriert sich mit seiner eigenen E-Mail-Adresse und hat seinen eigenen, von deinem getrennten Lernstand. Nachteil: alle teilen sich dein Gratis-Kontingent bei Supabase. Die Registrierung ist offen: Jeder, der den Link kennt, kann sich auf deiner Datenbank registrieren (er sieht nur seine eigenen Daten). Wenn du das nicht möchtest, schalte in Supabase unter **Authentication** → **Sign In / Providers** die Neuanmeldungen aus (**Allow new users to sign up**).

**Variante B: eigene Datenbank (unabhängig).**
1. Dein Freund legt ein eigenes Supabase-Projekt an und führt `supabase/schema.sql` im SQL Editor aus (Abschnitt 1, Schritte 1 bis 7).
2. Er öffnet den App-Link. Auf der Seite **Einrichtung** trägt er bei **Supabase-URL** die Project URL und bei **Öffentlicher Schlüssel** den anon/publishable-Schlüssel seines Projekts ein und klickt **Speichern**. Später ist das auch in den **Einstellungen** im Abschnitt **Eigene Datenbank** möglich (leer lassen = eingebaute Datenbank).
3. Dann registriert er sich in der App. Seine Daten liegen komplett in seinem Projekt.

Wer die Werkstatt nutzen will, braucht zusätzlich Abschnitt 3 auf dem eigenen PC mit den eigenen Zugangsdaten.

---

## 6. Hilfe bei Problemen

**Werkstatt meldet „Claude Code nicht gefunden (nicht installiert oder nicht im PATH)…“:** Claude Code ist nicht installiert oder die Eingabeaufforderung kennt es noch nicht. Fenster schließen, neu öffnen und `claude --version` eingeben. Erscheint keine Versionsnummer, Claude Code neu installieren (Abschnitt 3, Schritt 2) und `start.cmd` erneut starten (ggf. PC neu starten).

**Werkstatt meldet „Claude ist nicht angemeldet…“:** In der Eingabeaufforderung `claude` starten und mit `/login` anmelden (Abschnitt 3, Schritt 2). Danach die Werkstatt neu starten.

**Die App erreicht die Werkstatt nicht (CORS-Fehler):** Prüfe `APP_ORIGIN` in `werkstatt\.env` (nur `https://<github-name>.github.io`, ohne Pfad) und starte `start.cmd` neu.

**App bleibt „offline“:** Prüfe die Internetverbindung. Wenn sie in Ordnung ist, liegt es meist am pausierten Supabase-Projekt (Hinweis in Abschnitt 1): im Supabase-Dashboard **Restore project** wählen. Wirkt die App veraltet, sie komplett schließen und neu öffnen (ggf. zweimal), damit die neue Version geladen wird.

**Sync-Warnungen:** Meist vorübergehend. Deine Antworten bleiben auf dem Gerät gespeichert und werden beim nächsten erfolgreichen Abgleich übertragen. Bleibt die Warnung, abmelden und wieder anmelden und prüfen, ob `schema.sql` vollständig ausgeführt wurde (Abschnitt 1, Schritt 4).

**Anmeldung geht nicht („E-Mail nicht bestätigt“):** Entweder den Link in der Bestätigungs-Mail anklicken (auch im Spam-Ordner schauen) oder in Supabase **Confirm email** ausschalten (Abschnitt 1, Schritt 6).
