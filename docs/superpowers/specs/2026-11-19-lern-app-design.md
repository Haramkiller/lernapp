# Lern-App „Lernabenteuer“ – Design

Stand: 2026-11-19 · Status: Entwurf zur Freigabe

## 1. Worum es geht und warum

Eine persönliche Lern-App für ein Studium der Biologie und Sportwissenschaften (aktuell: Botanik, Sportpsychologie, wissenschaftliches Arbeiten; weitere Module folgen). Ziel ist immer eine Prüfung. Besonders in Biologie muss sehr viel auswendig gelernt werden.

Die Nutzerin bzw. der Nutzer (im Folgenden „du“) will:
- Prüfungsstoff **schnell und dauerhaft** behalten,
- dabei **Spaß** haben und Lernerfolg **spüren**, statt monoton „Text → Frage → Antwort → weiter“ abzuarbeiten,
- **eigene Skripte und Altklausuren hochladen**, aus denen automatisch Fragen entstehen (Altklausuren bestimmen den Stil der Fragen),
- am **PC und am Handy** lernen, auch unterwegs.

Grundlage ist die Lernforschung. Die App setzt gut belegte Prinzipien um und lenkt aktiv weg von bequemen, aber wenig wirksamen Methoden (Wiederlesen, Markieren):

| Prinzip | Umsetzung in der App |
|---|---|
| Aktives Abrufen (Testing Effect) | Lernen besteht fast nur aus Abfragen |
| Verteilte Wiederholung (Spacing) | FSRS plant jede Frage individuell |
| Interleaving | Kämpfe mischen Fragen eines Gebiets, Tages-Quest mischt Gebiete |
| Elaboriertes Feedback | Erklärung, warum richtig/falsch, mit Skriptstelle |
| Elaboration | Fragetyp „in eigenen Worten“, Nachfragen-Funktion |
| Begrenzte Aufmerksamkeit | Kämpfe ~10–15 min, belohnte Pausen |
| Begrenzte Aufnahme neuen Stoffs | Tageslimit für neue Fragen |

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**
- Skript/Altklausur (PDF) rein → fertige, gute Fragen mit Erklärungen raus, mit einem Klick am PC.
- Tägliches Lernen als Abenteuer-Spiel mit Pixelgrafik, Bosskämpfen, Quests, Belohnungen.
- Lernstand auf PC und Handy synchron, Lernen offline möglich.
- Beliebig viele Module erweiterbar.
- **0 € laufende Kosten.**

- **Mehrbenutzerfähig** von Anfang an: Freunde können die App mit eigenem Konto nutzen, ohne die Ressourcen des Besitzers nennenswert zu belasten (siehe Abschnitt 5a).

**Nicht-Ziele**
- Soziale Funktionen (Ranglisten, Chats, Freundeslisten).
- App-Store-App.
- Eigene KI-Kosten (keine bezahlte API).

**Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)**
- Das Spiel fühlt sich nach mehr Fortschritt an, als wirklich gelernt wurde (z. B. Punkte farmen mit leichten Fragen).
- Belohnung für Tempo, die zum Raten verleitet.
- Harte Sperren, nach denen man nicht mehr zurückkommt.
- Wieder nur „Text → Frage → Antwort → weiter“.

## 3. Rahmenbedingungen

- Nutzer hat Claude **Pro** und Claude Code auf dem Windows-PC. Keine Anthropic-API.
- KI wird **nur am PC** genutzt (über Claude Code, zählt gegen das Pro-Limit).
- Komplett kostenlos: kostenlose Tarife für Hosting und Datenbank.
- PixelLab ist per MCP verbunden (nutzerweit) und wird für Grafiken/Animationen genutzt.
- **Qualität vor Tempo.** Gestartet wird am Wochenende, aber es gibt keine harte Frist. Reihenfolge: erst der Lern-Kern, dann die Spielschicht (siehe Abschnitt 10).
- **Geräte:** Android ist das Hauptgerät (eigenes Handy, die meisten Freunde). iPhone muss ebenfalls funktionieren. Auf iOS funktionieren dauerhafter Offline-Speicher und Benachrichtigungen nur, wenn die PWA auf dem Homescreen installiert ist (iOS 16.4+). Die App erkennt iOS ohne Installation und zeigt eine kurze Anleitung „Zum Home-Bildschirm“.

## 4. Bauvarianten (Approaches)

| Variante | Beschreibung | Abwägung |
|---|---|---|
| **A: Web-App gehostet + Cloud-Datenbank + PC-Hilfsprogramm** ✅ gewählt | Installierbare Web-App (PWA), Lernstand in Supabase (kostenlos), lokales Hilfsprogramm erzeugt Fragen via Claude Code | Funktioniert am Handy unabhängig vom PC, offline-fähig, 0 €. Einmalig zwei kostenlose Konten nötig. |
| B: Alles lokal auf dem PC | PC liefert die App, Handy greift übers WLAN zu | Am einfachsten, aber Handy nur nutzbar, wenn PC läuft; unterwegs nur mit Tunnel. Widerspricht „auch unterwegs“. |
| C: Native App (App Store) | Flutter/React Native | Verworfen: am Wochenende nicht machbar, kein Vorteil gegenüber A. |

KI-Weg (separat entschieden): Fragen werden **über das lokale Claude Code** (Pro-Abo) erzeugt, nicht über die bezahlte API. Variante „ich erzeuge die Fragen im Chat“ bleibt als Notlösung möglich, da das Hilfsprogramm dieselben Dateien verarbeitet.

Gewählt: **A**, weil nur so das Lernen am Handy unabhängig vom PC funktioniert.

## 5. Aufbau

```
 ┌──────────────── PC (Windows) ────────────────┐
 │  Werkstatt (lokales Hilfsprogramm, Node)      │
 │   - PDF hochladen, Modul/Thema wählen         │
 │   - ruft `claude -p` (Claude Code, Pro-Abo)   │
 │   - erzeugt Fragen + Erklärungen als JSON     │
 │   - lädt sie in Supabase hoch                 │
 │   - "Nachfragen"-Chat für die App am PC       │
 └───────────────────────┬──────────────────────┘
                         │
                 ┌───────▼────────┐
                 │   Supabase     │  Login, Fragen, Lernstand,
                 │  (kostenlos)   │  Spielstand, Bilder
                 └───────▲────────┘
                         │ Sync
 ┌───────────────────────┴──────────────────────┐
 │  Lern-App (PWA, gehostet z. B. GitHub Pages)  │
 │   - läuft auf PC und Handy, installierbar     │
 │   - offline: lokaler Speicher, später Sync    │
 │   - Spiel, Kämpfe, FSRS, Quests               │
 └───────────────────────────────────────────────┘
```

**Technik (Entscheidung des Builders, hier vorgeschlagen):** React + TypeScript + Vite als PWA; `ts-fsrs` für die Wiederholungsplanung; Supabase (Auth, Postgres, Storage); Hosting auf GitHub Pages oder Cloudflare Pages; Werkstatt als kleiner Node-Server mit eigener lokaler Weboberfläche.

**Datenhoheit:** Export/Import des gesamten Bestands als JSON-Datei, damit nichts an einem Anbieter hängt.

### 5a. Mehrere Nutzer (Freunde)

- **Standard:** Freunde melden sich in der gehosteten App mit eigenem Konto an. Jede Person sieht nur ihre eigenen Daten (Supabase Row Level Security auf allen Tabellen). Fragen sind fast nur Text; der Gratis-Tarif reicht für eine Handvoll Nutzer.
- **Alternative „eigene Datenbank“:** In den Einstellungen kann man eigene Supabase-Zugangsdaten (URL + öffentlicher Schlüssel) eintragen. Dann nutzt die Person null Ressourcen des Besitzers. Das Datenbankschema liegt als SQL-Datei im Projekt, dazu eine Schritt-für-Schritt-Anleitung.
- **KI:** Die Werkstatt läuft immer auf dem PC der jeweiligen Person mit deren eigenem Claude Code. Das Pro-Limit des Besitzers wird nie berührt. Wer kein Claude hat, kann keine Fragen erzeugen, aber geteilte Fragenpakete nutzen (Ausbaustufe 2).
- Die Werkstatt muss sich daher ohne Programmierkenntnisse installieren lassen (Anleitung: Node + Claude Code installieren, Werkstatt starten).
- Bilder in Supabase Storage sparsam halten (komprimiert, klein), da der Speicher geteilt ist.

## 6. Fragen erzeugen (Werkstatt)

1. Du wählst Modul und Thema (oder legst neue an) und lädst ein PDF hoch. Typ: **Skript** oder **Altklausur**.
2. **Altklausuren** dienen drei Zwecken (entschieden):
   - Ihre Fragen werden **selbst zu Lernfragen** (mit Erklärung und, soweit vorhanden, Skript-Bezug).
   - Pro Modul wird ein **Stilprofil** abgeleitet und gespeichert (Fragearten, Schwierigkeitsgrad, Formulierung). Es fließt in jede spätere Erzeugung aus Skripten dieses Moduls ein.
   - Themen, die in Altklausuren vorkommen, gelten als **klausurrelevant**. Fragen dazu werden markiert und bei der Auswahl neuer Fragen sowie im Klausurmodus leicht bevorzugt.
   - Wird eine Altklausur nach Skripten hochgeladen, werden bestehende Fragen nachträglich als klausurrelevant markiert.
3. Die Werkstatt ruft Claude Code im Hintergrund auf (`claude -p`, PDF als Datei), mit Anweisung und festem JSON-Format.
4. Jede Frage enthält:
   - Fragetext, Fragetyp, richtige Antwort,
   - bei Auswahlfragen: falsche Optionen **mit Begründung, warum falsch**,
   - eine kurze **Erklärung**, warum die richtige Antwort stimmt,
   - **Quelle**: Datei + Seitenzahl (+ kurzes Zitat). Nur Zitat, keine PDF-Ansicht in der App: die PDFs verlassen den PC nicht (Speicher, Urheberrecht). *(Entscheidung von Claude)*
   - Thema/Gebiet, Schwierigkeit, Markierung „klausurrelevant“, wenn sie Altklausuren ähnelt.
5. Vorschau: Du siehst die Fragen, kannst einzelne löschen oder bearbeiten, dann „Übernehmen“ → Upload in Supabase.

## 7. Fragetypen

Ausbaustufe 1 (MVP):
- **Auswahl** (eine richtige aus 4)
- **Lückentext** (Eingabe, tolerant bei Groß/Klein und kleinen Tippfehlern)
- **Zuordnen** (Begriffe ↔ Definitionen)
- **Reihenfolge** (Schritte eines Ablaufs ordnen, z. B. Generationswechsel)
- **Eigene Worte** (freie Antwort; danach Musterantwort zeigen, Selbsteinschätzung „gewusst / teilweise / nicht gewusst“, da am Handy keine KI zur Bewertung)

Ausbaustufe 2:
- **Bild beschriften** (z. B. Pflanzenquerschnitt; Bild aus dem PDF ausgeschnitten, Beschriftungen verdeckt)
- **Wahr/Falsch mit Begründung**

## 8. Wiederholung (FSRS)

- Jede Frage hat einen eigenen FSRS-Zustand. Ergebnis der Antwort → FSRS-Bewertung (falsch = „Again“, teilweise = „Hard“, richtig = „Good“, richtig nach langer Zeit sicher = „Good/Easy“ je nach Fragetyp; genaue Abbildung legt der Builder fest).
- **Ziel-Behaltensrate** einstellbar (Standard 90 %).
- **Tageslimit neue Fragen** einstellbar (Standard 20).
- **Prüfungsdatum pro Modul** optional: Vor der Klausur werden Gebiete mit niedriger Abrufwahrscheinlichkeit bevorzugt.

## 9. Das Spiel

**Welt:** Jedes Modul ist eine **Region** (z. B. „Botanischer Wald“, „Arena der Sportpsychologie“). Jedes Thema ist ein **Gebiet** mit einem **Boss**. Der Endboss einer Region ist die Klausur (gemischter Kampf über alle Gebiete).

**Kampf und Wiederholungsplanung** *(Entscheidung von Claude)*:
- Ein Kampf zieht die **heute fälligen** Fragen eines Gebiets plus **neue** Fragen (innerhalb des Tageslimits). Ist in einem Gebiet nichts fällig, schlägt die App ein anderes Gebiet vor.
- Das **Boss-Leben bleibt über Tage bestehen**: Es entspricht dem Anteil der Fragen des Gebiets, die laut FSRS noch nicht sicher sitzen (z. B. Abrufwahrscheinlichkeit unter Zielwert oder Stabilität unter einer Schwelle). Es **wächst wieder**, wenn Wissen verblasst. Ein Boss fällt also über mehrere Tage, nicht in einem Kampf.
- **Training** mit nicht fälligen Fragen ist jederzeit erlaubt, bringt aber kaum Belohnung und macht keinen Boss-Schaden. So lässt sich nichts „farmen“. Wie FSRS solche frühen Wiederholungen verbucht, legt der Builder fest (ts-fsrs unterstützt das).
- Die **Tages-Quest besteht aus diesen Kämpfen**: Wer die fälligen und neuen Fragen in Kämpfen erledigt, erfüllt die Quest.

**Kampf** (~10–15 min, ca. 20–30 Fragen):
- Angezeigtes Boss-Leben wie oben.
- Richtige Antwort = Schaden. **Kein Tempobonus.**
- **Krit-Treffer**: richtig bei einer Frage, die lange nicht dran war (echtes Behalten).
- **Combo**: Serie richtiger Antworten erhöht den Schaden.
- **Zufällige Bonus-Treffer** (unvorhersehbare Belohnung).
- Falsche Antwort: Boss greift an (kleiner Treffer am Spieler, kein Spielende), Erklärung erscheint sofort.

**Nach falscher Antwort:**
- Erklärung + warum die gewählte Option falsch war + Skriptstelle.
- Knopf **„Nachfragen“**: am PC öffnet sich ein Chat zu genau dieser Frage über die Werkstatt (Claude Code); am Handy wird ein fertiger Text (Frage, deine Antwort, richtige Antwort, Erklärung) in die Zwischenablage kopiert und die Claude-App geöffnet.

**Pausen – Lagerfeuer statt Sperre:**
- Nach einem Kampf: Lagerfeuer. Wer 5–10 min Pause macht, bekommt den Bonus **„Ausgeruht“** (nächster Kampf doppelte Erfahrung).
- Weiterkämpfen ohne Pause ist erlaubt, aber die Figur wird **„Erschöpft“**: Belohnungen sinken schrittweise.
- Ist die Pause vorbei: Benachrichtigung („Dein Feuer ist bereit …“), auch am Handy (Web-Push, soweit das Gerät es unterstützt).

**Tages-Quest:**
- „Besiege die fälligen Gegner“ = alle heute fälligen Wiederholungen.
- „Erkunde neue Gegner“ = neue Fragen bis zum Tageslimit.
- Quest geschafft = für heute alles Wichtige erledigt (klar kommuniziert).

**Belohnungen und Fortschritt:**
- Erfahrung, Level, Beute nach Kämpfen, Tagesserie.
- Gebiete **blühen auf**, wenn sie beherrscht werden, und **verwildern**, wenn lange nicht wiederholt wird (ehrliche Darstellung des Vergessens, gekoppelt an FSRS-Abrufwahrscheinlichkeit).
- Anzeige echten Lernerfolgs, z. B. „Diese 40 Fragen sitzt du bis zur Klausur“.
- Regel: Belohnungen hängen an **echtem Lernfortschritt** (FSRS), nie an bloßer Menge.

**Optik:** Retro-Pixelgrafik. Bosse, Figur, Effekte, Kartenansicht über PixelLab erzeugt. Grafiken werden so eingebunden, dass sie austauschbar sind.

Konkrete Beute-/Sammelsystem-Details: Builder schlägt im ersten Entwurf vor, Nutzer streicht und ergänzt.

## 10. Ausbaustufen

Keine harte Frist; Qualität geht vor. Reihenfolge innerhalb von Stufe 1 ist verbindlich: erst der Lern-Kern, dann die Spielschicht.

1. **Stufe 1a – Lern-Kern:** Werkstatt mit PDF → Fragen (Auswahl, Lückentext, Zuordnen, Reihenfolge, eigene Worte), Altklausur-Verarbeitung, Supabase mit Konten und Sync, PWA mit FSRS, Erklärungen, Nachfragen (PC + Handy), Offline-Lernen. Danach ist die App bereits zum echten Lernen nutzbar.
2. **Stufe 1b – Spielschicht:** Weltkarte, Kampf, Lagerfeuer, Tages-Quest, Belohnungen, aufblühende/verwildernde Gebiete, PixelLab-Grafiken für Botanik.
3. **Stufe 2:** Bildfragen aus PDFs, Endboss/Klausurmodus, Prüfungsdatum, Benachrichtigungen, **Fragenpakete teilen** (Export eines Moduls als Paket, Import bei Freunden), eigene Datenbank pro Nutzer mit Anleitung, mehr Grafiken und Belohnungen, Export/Import.

## 11. Bekannte Risiken

- **Supabase-Gratisprojekte pausieren nach ca. 1 Woche ohne Nutzung.** Bei täglichem Lernen kein Problem; nach langer Pause im Dashboard reaktivieren. Mitigation: Export/Import + lokaler Speicher in der App.
- **Gehostete App ↔ lokale Werkstatt** (https-Seite spricht mit `localhost`): Browser können das einschränken. Fallback: Nachfragen am PC wie am Handy über Zwischenablage + Claude.
- **Fragenqualität** hängt am Prompt; deshalb Vorschau/Bearbeiten vor dem Übernehmen.
- **Pro-Nutzungslimit:** sehr große Skripte ggf. in Abschnitten verarbeiten.

## 12. Dem Builder überlassen

Projektstruktur, genaue Bibliotheken, Datenbankschema, Prompt-Formulierung, Fehlertoleranz beim Lückentext, Animationsdetails, Hosting-Anbieter (GitHub Pages oder Cloudflare Pages), genaue Zahlenwerte für Schaden/Erfahrung/Erschöpfung.
