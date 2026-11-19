# Lernabenteuer

Eine persönliche Lern-App zum Prüfungslernen mit Karteikarten und Wiederholungsplan (Spaced Repetition). Sie funktioniert am Handy auch offline und gleicht den Lernstand über das Internet ab.

## Bestandteile

- **`app/`** – die Lern-App (React, als installierbare PWA). Wird über GitHub Pages veröffentlicht und läuft am Handy und am PC.
- **`werkstatt/`** – ein lokales Werkzeug auf dem PC, das mit Claude aus Skripten und Altklausuren Lerninhalte erzeugt und in die Datenbank schreibt. Start per `werkstatt/start.cmd`.
- **`supabase/`** – das Datenbankschema (`schema.sql`) für Abgleich und Anmeldung. Dazu kommt **`shared/`** mit gemeinsam genutztem Code.

## Loslegen

- Einrichtung Schritt für Schritt: [docs/setup.md](docs/setup.md)
- Entwurf und Hintergründe: [docs/superpowers/specs/2026-11-19-lern-app-design.md](docs/superpowers/specs/2026-11-19-lern-app-design.md)

Tests ausführen: `npm install`, dann `npm test`.
