# Sicherheit einschätzen (Teil 5b)

## Wozu

Vor dem Aufdecken kurz „sicher“ oder „unsicher“ angeben. Zwei Lerneffekte:
- **Überraschung verankert:** Fehler, bei denen man sich sicher war, merkt man sich besonders gut (Hyperkorrektur).
- **Selbsteinschätzung:** Man lernt, was man wirklich kann; für die Prüfungsvorbereitung wertvoll.

Entschieden vom Nutzer:
- Die Einschätzung zählt **nur fürs Lernen**, nicht als Kampfregel (kein Schaden-Bonus, keine Wette), damit niemand aus Taktik „sicher“ tippt.
- **Folge akzeptiert (A1):** Weil der Schaden im Spiel aus dem Kartenleben nach der Wiederholung entsteht, macht „richtig + unsicher“ (Bewertung „Schwer“) etwas weniger Schaden, die Karte gilt später als „sitzt sicher“, und Gewächshaus/Erforschen folgen dem echten Kartenstand. Das ist gewollt: unsicheres Wissen sitzt wirklich weniger fest („Fortschritt nur durch echtes Lernen“). Kein zweiter, geschönter Rechenweg für den Kampf.
- Die Einschätzung wird **in Supabase in der Wiederholungsliste** (`review_logs`) gespeichert, damit die Treffsicherheit geräteübergreifend und je Modul auswertbar ist.
- Claude übernimmt alles, auch die Schema-Änderung in Supabase (über den eingebauten Browser; Anmeldung macht der Nutzer, falls nötig).

## Ziele

- Kein zusätzliches Tippen: Der eine „Prüfen“-Knopf wird zu zwei Knöpfen **„Sicher“** und **„Unsicher“**.
- „Richtig, aber unsicher“ kommt früher wieder (FSRS-Bewertung „Schwer“ statt „Gut“).
- „Sicher, aber falsch“ wird in der Rückmeldung deutlich hervorgehoben.
- Treffsicherheit sichtbar: nach dem Kampf für diesen Kampf, auf der Karte (Modulübersicht) je Modul.

## Nicht-Ziele

- Keine eigene Kampfregel für die Einschätzung: `Outcome` (richtig/teilweise/falsch) bleibt wie heute; Combo und Beute hängen daran unverändert. Schaden, „sitzt sicher“, Gewächshaus und Erforschen folgen wie immer dem gespeicherten Kartenstand (siehe A1).
- Freie Antworten („Erkläre“) bekommen keine Einschätzung; dort bewertet man sich schon selbst.
- Keine Statistik-Seite mit Verlaufskurven.

## Anti-Ziele

- Man fühlt sich gebremst (Extra-Schritt pro Karte).
- Ehrliches „unsicher“ wird zusätzlich zur echten FSRS-Wirkung bestraft (eigene Abzüge, Spott-Texte) → man lügt.
- Alte App-Versionen oder alte Einträge brechen die Synchronisierung.
- Eine falsche Schema-Änderung macht Daten in Supabase kaputt.

## Ansätze (Speicherort, betrachtet)

1. **Neue Spalten in `review_logs`** (gewählt): genau, geräteübergreifend, je Modul/Thema auswertbar. Kostet eine einmalige Schema-Änderung, die vor dem Live-Schalten laufen muss.
2. Zähler bei den Spieldaten (`game_items`): kein SQL, aber nur Gesamtzahlen; bei zwei Geräten offline können Zähler verloren gehen.
3. Nur lokal: verworfen (pro Gerät verschieden, nach Neuinstallation weg).

## Entscheidungen

### Eingabe
- Fragetypen Auswahl, Eintippen, Lückentext, Zuordnen, Reihenfolge: statt „Prüfen“ zwei gleich große Knöpfe „Unsicher“ und „Sicher“ (gleiche Sperre wie heute, z. B. erst nach Auswahl aktiv). *(Meine Entscheidung: Reihenfolge links „Unsicher“, rechts „Sicher“.)*
- Eintippen: „Weiß nicht“ bleibt als kleinerer dritter Knopf (über oder neben den beiden) und und speichert als falsch mit Einschätzung „unsicher“. *(Meine Entscheidung.)* Bei nicht erkannter Eingabe gilt die vorher gewählte Einschätzung auch für „Doch richtig“/„Weiter“.
- Enter in Textfeldern schickt nicht mehr ab (man muss sich entscheiden); die Handy-Taste schließt nur die Tastatur. *(Meine Entscheidung.)*
- Freie Antwort: unverändert, Einschätzung „keine Angabe“.

### Bewertung (FSRS)
- falsch → „Nochmal“ (wie heute), egal welche Einschätzung.
- teilweise → „Schwer“ (wie heute).
- richtig + sicher → „Gut“ (wie heute).
- richtig + unsicher → **„Schwer“** (neu).
- Der Spiel-`Outcome` bleibt unverändert (richtig bleibt richtig für Schaden/Combo/Beute).

### Rückmeldung
- Sicher + falsch (auch sicher + teilweise, schwächer formuliert): auffälliger Hinweis, z. B. „Du warst dir sicher – genau diese Stelle merken.“ *(Wortlaut: Builder.)*
- Richtig + unsicher: kurzer Hinweis „Richtig, aber unsicher – kommt etwas früher wieder.“

### Speicherung
- `review_logs` bekommt zwei nullbare Spalten: `confidence` (`'sure'` | `'unsure'`) und `outcome` (`'right'` | `'partial'` | `'wrong'`). Nötig, weil die Bewertung allein „richtig + unsicher“ nicht von „teilweise“ unterscheidet.
- Bestehende Einträge und Einträge alter App-Versionen bleiben gültig (Spalten `null`).
- Reihenfolge beim Live-Schalten: **erst** Schema-Änderung in Supabase (idempotent, `add column if not exists`, mit Prüfregel für erlaubte Werte), **dann** App ausliefern. Die Schema-Datei `supabase/schema.sql` wird entsprechend ergänzt.

### Treffsicherheit anzeigen
- Ergebnis nach dem Kampf: „Sicher: X von Y richtig“ und „Unsicher: X von Y richtig“ (nur Zeilen mit Y > 0).
- Modulübersicht (Karte am Lagerfeuer): je Modul „Wenn du sicher bist: N % richtig“ über die letzten 30 Tage, erst ab einer Mindestzahl an sicheren Antworten (Richtwert 10), sonst nichts. *(Meine Entscheidung.)*
- „Teilweise“ zählt bei der Treffsicherheit nicht als richtig. *(Meine Entscheidung.)*
- Die App muss dafür die eigenen Wiederholungen mit Einschätzung kennen, auch die von anderen Geräten (heute werden Logs nur hochgeladen, nie geholt).

## Offen für den Builder

- Wie die App die Logs mit Einschätzung bekommt (lokale Dexie-Tabelle beim Speichern plus Holen aus Supabase beim Sync, Zeitraum).
- Genauer Wortlaut der Hinweise; Gestaltung der Knöpfe im vorhandenen Stil.
- Ob „Sicher“/„Unsicher“ Farben oder Symbole bekommen.
