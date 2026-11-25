# Willkommensseite und geführte Anmeldung (kurzes Design)

Stand: 2026-11-26. Vorhaben A von zwei. Vorhaben B („Karten einfügen“ aus einem kostenlosen Chat, mit Anleitung) folgt
danach und hängt seinen Hinweis an das Ende dieses Ablaufs.

## Warum

Neuzugänge sollen nicht raten müssen, was sie tun sollen. Heute beginnt die App mit einem Formular „Anmelden“. Wer neu
ist, muss den kleinen Link „Noch kein Konto? Registrieren“ finden, die Bestätigungs-Mail verstehen und danach selbst
zurück zur Anmeldung finden. „Eigene Datenbank verwenden“ steht direkt daneben und verwirrt.

## Ziele, Nicht-Ziele, Anti-Ziele

- **Ziel:** Ein Neuzugang kommt ohne fremde Hilfe von „App geöffnet“ bis „angemeldet“.
- **Nicht-Ziele:**
  - „Passwort vergessen“.
  - Erklärungen nach der Anmeldung (Karten erstellen ist Vorhaben B).
  - Änderungen an Supabase-Einstellungen.
- **Anti-Ziel:** Wer schon ein Konto hat, braucht deutlich länger als heute oder findet „Eigene Datenbank“ nicht mehr.

## Ansätze

1. **Hinweiskasten auf der Anmeldeseite.** Kleinste Änderung, aber die Seite beginnt weiter mit „Anmelden“; die größte
   Stolperstelle bleibt.
2. **Willkommensseite mit Auswahl (gewählt).** Zwei große Knöpfe „Ich bin neu“ / „Ich habe schon ein Konto“. Neue werden
   Schritt für Schritt geführt, der Mail-Schritt wird genau dann erklärt, wenn er dran ist. Kostet Bestandsnutzer einen
   Tipp, und das nur, solange sie abgemeldet sind.
3. **Eigene Hilfeseite oder Text zum Weiterschicken.** Steht nicht dort, wo man stolpert.

## Ablauf (vom Nutzer gewählt: Ansatz 2)

Solange niemand angemeldet ist, zeigt die App statt des Formulars zuerst die **Willkommensseite**:

- Überschrift „Willkommen bei Lernabenteuer“, ein Satz, worum es geht.
- Knopf **„Ich bin neu“** (Hauptknopf) und Knopf **„Ich habe schon ein Konto“**.
- Klein ganz unten: „Eigene Datenbank verwenden“ (wie heute; der Hinweis „Eigene Datenbank: …“ bleibt sichtbar, wenn
  eine eingetragen ist).

**„Ich habe schon ein Konto“** führt zum heutigen Anmeldeformular, mit einem Knopf „Zurück“ zur Willkommensseite.

**„Ich bin neu“** führt durch nummerierte Schritte mit Anzeige „Schritt x von 3“:

1. **Konto anlegen:** E-Mail und Passwort (mindestens 6 Zeichen), Knopf „Konto anlegen“. Kurzer Satz: „Mit dieser
   E-Mail und diesem Passwort meldest du dich später an, auch am PC.“
2. **E-Mail bestätigen:** „Wir haben dir eine Mail an <Adresse> geschickt. Tippe auf den Link darin und komm dann
   hierher zurück. Keine Mail? Schau im Spam-Ordner nach.“ Knopf „Ich habe bestätigt – weiter“.
   - Hinweis: Öffnet der Link eine Fehlerseite („Verbindung abgelehnt“), ist die Mail trotzdem bestätigt.
   - Liefert die Registrierung sofort eine Sitzung (Bestätigung in Supabase ausgeschaltet), entfallen die Schritte 2
     und 3: Die App ist direkt angemeldet.
3. **Anmelden:** Anmeldeformular, E-Mail schon ausgefüllt. Meldet Supabase „E-Mail nicht bestätigt“, erscheint der
   Hinweis, zuerst den Link in der Mail anzutippen.

Jeder Schritt hat „Zurück“. Fehler aus Supabase erscheinen wie heute als Warnung.

## Meine Entscheidungen

- Die Willkommensseite erscheint bei jedem abgemeldeten Start (kein „schon gesehen“-Speicher). Einfach und
  vorhersehbar; Bestandsnutzer sind selten abgemeldet.
- Texte in der Du-Form, kurz, im Ton der App.
- Bestehende Bausteine (`LoginScreen`, Formularstil `card-panel`, Knöpfe) werden wiederverwendet; die Willkommensseite
  bekommt keine neuen Grafiken.
- `docs/setup.md`, Abschnitt 5 (Freunde) bekommt einen Satz, dass die App Neue jetzt selbst durch die Anmeldung führt.

## Dem Builder überlassen

- Aufteilung in Komponenten und Dateien; wie der Ablauf seinen Schritt hält.
- Genaue Formulierungen innerhalb der oben genannten Inhalte.
