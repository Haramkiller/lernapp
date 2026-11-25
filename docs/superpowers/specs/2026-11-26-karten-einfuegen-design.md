# Karten einfügen aus dem kostenlosen claude.ai (Design)

Stand: 2026-11-26. Vorhaben B von zwei (A: Willkommensseite und geführte Anmeldung, live seit c1e03e5).

## Warum

Freunde sollen eigene Karten aus ihren eigenen Skripten erstellen. Die Werkstatt kann das nicht für sie: Sie braucht einen PC
und ein Claude-Abo (Pro/Max), weil sie Claude Code aufruft. Das kostenlose claude.ai kann dagegen PDFs lesen und Karten im
richtigen JSON-Format schreiben. Es fehlt nur der Weg, diese Antwort in die App zu bringen, und eine Anleitung, damit Neue
nicht raten müssen.

## Ziele, Nicht-Ziele, Anti-Ziele

- **Ziel:** Ein Neuzugang ohne Abo kommt nur mit dem Handy von „Skript-PDF vorhanden“ bis „Karten im Spiel“, ohne fremde
  Hilfe.
- **Nicht-Ziele:**
  - Altklausuren (Prüfungsstil `styleProfile`, `examTopics`, `fromExam`). Das bleibt bei der Werkstatt.
  - Karten in der App bearbeiten oder einzeln löschen.
  - Offline speichern (keine Warteschlange für neue Karten).
  - Dateien hochladen oder herunterladen; nur Kopieren und Einfügen.
  - Eine bezahlte API oder ein Server zwischen App und Claude.
- **Anti-Ziele:**
  - Kaputte Karten landen im Spiel (z. B. 3 statt 4 Optionen).
  - Eine abgeschnittene Antwort verliert alle Karten, obwohl die meisten vollständig waren.
  - Zweimal dieselbe Antwort einfügen verdoppelt die Karten.
  - Die Werkstatt verhält sich danach anders als heute.

## Ansätze

1. **Kopieren und Einfügen in der App (gewählt).** Die App erzeugt den Auftrag zum Kopieren, nimmt Claudes Antwort als
   Text entgegen, prüft sie und speichert direkt in Supabase. Geht komplett am Handy.
2. **Antwort als Datei herunterladen und in der App öffnen.** Kein Abschneiden beim Kopieren, aber am Handy mehr Schritte,
   und Dateien sind schwer wiederzufinden.
3. **Über die Werkstatt.** Braucht PC und Abo; fällt für die Zielgruppe weg.

## Ablauf (vom Nutzer bestätigt)

**Einstieg:**
- Neuer Menüpunkt **„Karten erstellen“** im Szenenmenü (neben „Einstellungen“).
- Im leeren Gewächshaus wird der Text „Noch keine Beete – erstelle Karten in der Werkstatt“ zu einem Knopf
  **„Karten erstellen“**, mit kurzem Satz davor (z. B. „Noch keine Beete.“).

**Vier Schritte mit Anzeige „Schritt x von 4“, jeder mit „Zurück“:**

1. **Modul wählen:** Liste der vorhandenen Module oder „Neues Modul“ mit Namensfeld.
2. **Auftrag kopieren:** Knopf „Auftrag kopieren“ (Zwischenablage). Darunter die Anleitung:
   - claude.ai öffnen und kostenlos anmelden (Link auf https://claude.ai).
   - Neuen Chat starten, das Skript-PDF anhängen, den Auftrag einfügen und senden.
   - Claudes Antwort mit dem Kopieren-Knopf unter der Antwort kopieren.
   - Hinweis: Im kostenlosen Zugang sind Nachrichten begrenzt. Deshalb macht Claude etwa 10–15 Karten auf einmal.
   - Klappt das Kopieren in die Zwischenablage nicht, zeigt die App den Auftrag in einem Textfeld zum Markieren.
3. **Antwort einfügen:** großes Textfeld, Knopf „Prüfen“.
4. **Ergebnis:** „12 Karten erkannt“, dazu wenn nötig „1 fehlerhaft übersprungen“ und „2 schon vorhanden, übersprungen“.
   Knöpfe **„Speichern“** und danach **„Weitere Seiten“** bzw. **„Fertig“**.
   - „Weitere Seiten“ führt zurück zu Schritt 3 (gleiches Modul) mit dem Tipp, im selben Chat „Weiter ab Seite N“ zu
     schreiben, als Text zum Kopieren.
   - **N** ist die höchste `source.page` der gerade erkannten Karten plus 1. Hat keine Karte eine Seitenzahl, lautet der
     Tipp „Weiter mit den nächsten Seiten“. Der Auftrag kennt deshalb beide Formen („Weiter ab Seite N“ und „Weiter“).
   - Die App merkt sich den Fortschritt nicht über den Tag hinaus. Wer später in einem neuen Chat neu beginnt, bekommt
     schon vorhandene Karten über die Doppel-Prüfung aussortiert.
   - Erkennt die Prüfung keine einzige Karte, erscheint ein verständlicher Hinweis (z. B. „Keine Karten gefunden. Hast du
     die ganze Antwort kopiert?“) und man bleibt in Schritt 3.

**Der Auftrag** baut auf dem Werkstatt-Auftrag auf (gleiche Regeln für Fragetypen, Payload und JSON-Format), angepasst:
- Statt eines Dateipfads: „Lies das angehängte PDF.“
- Modulname und die schon vorhandenen Themen des Moduls stehen drin, damit Claude neue Karten in bestehende Themen
  einsortiert.
- Etwa 10–15 Karten pro Antwort, beginnend am Anfang des Skripts; bei „Weiter mit Seite …“ die nächsten Seiten.
- `source.file` ist der Name des angehängten PDFs, `source.page` die Seite im PDF.
- `fromExam` und `examRelevant` immer `false`.
- Nur das JSON-Objekt als Antwort.

**Prüfen:** dieselbe Auswertung wie in der Werkstatt:
- Codeblock entfernen, ganzes JSON lesen, und wenn es abgeschnitten ist, die vollständigen Karten retten.
- Jede Karte gegen `CardDraftSchema` prüfen. Fehlerhafte werden gezählt und übersprungen.
- **Doppelte:** Eine Karte, deren Typ und Fragetext (normalisiert) schon im Modul oder weiter oben in derselben Antwort
  vorkommt, wird übersprungen und gezählt. Vor dem Prüfen synchronisiert die App (wenn online), dann vergleicht sie mit
  der lokalen Kopie des Moduls (gelöschte Karten zählen nicht). Fragetext: `question` bei choice/free, `text` bei cloze, `prompt` bei
  matching/order.

**Speichern:**
- Neues Modul, neue Themen (Name normalisiert verglichen wie in der Werkstatt) und Karten bekommen neue UUIDs und
  Zeitstempel und werden direkt in Supabase geschrieben (eigene Zeilen sind per RLS erlaubt), in der Reihenfolge Modul →
  Themen → Karten.
- Danach synchronisiert die App, damit die Karten sofort im Spiel sind.
- Scheitert das Speichern (offline, Fehler), erscheint ein klarer Hinweis. Der eingefügte Text und das Ergebnis bleiben
  stehen, „Speichern“ kann erneut versucht werden, ohne doppelte Karten zu erzeugen.

## Meine Entscheidungen

- Altklausuren bleiben außen vor (siehe Nicht-Ziele).
- Doppelte werden über Typ und Fragetext erkannt, nicht über die ganze Karte. So zählt auch eine leicht umformulierte
  Erklärung als Doppel; zwei verschiedene Karten mit identischer Frage sind selten.
- „Weiter ab Seite N“ aus den Seitenzahlen der letzten Antwort, ohne gespeicherten Fortschritt (siehe Ablauf, Schritt 4).
- Doppel-Prüfung gegen die lokale Kopie nach einer Synchronisierung, nicht über eine eigene Abfrage an Supabase. Die
  Doppel-Prüfung ist nur in der App neu; die Werkstatt bekommt keine.
- Wiederverwendung: Auftragsregeln und Auswertung wandern nach `shared`, damit App und Werkstatt dieselben benutzen; die
  Werkstatt bleibt im Verhalten unverändert.
- Texte in der Du-Form, kurz, im Ton der App; Bausteine (`card-panel`, `step-progress`, Knöpfe) wie bei der
  Willkommensseite.
- `docs/setup.md`, Abschnitt 5 (Freunde): Satz ergänzen, dass Freunde ohne Abo Karten über „Karten erstellen“ anlegen.

## Dem Builder überlassen

- Aufteilung in Komponenten und Dateien, wie der Ablauf seinen Schritt hält.
- Genaue Formulierung von Auftrag und Anleitung innerhalb der oben genannten Inhalte.
- Wie die Speicher-Wiederholung Doppel vermeidet (z. B. IDs beim Prüfen vergeben und Upsert).
