# Spielschicht (Stufe 1b) – Design

Stand: 2026-11-20. Baut auf dem Gesamtdesign auf (`2026-11-19-lern-app-design.md`, Abschnitt 9) und ersetzt dort, wo es abweicht. Stufe 1a (Lern-Kern) ist fertig und live.

## 1. Absicht und Warum

Die App soll sich nicht mehr wie ein Karteikasten anfühlen („Karte → Antwort → weiter“), sondern wie ein gemütliches Abenteuer, das man jeden Tag weiterspielen will. Vorbilder des Nutzers:

- **Stardew Valley:** gemütlich, kein Stress, „nur noch ein Tag“, man kümmert sich täglich um etwas, das wächst.
- **Grounded 1 und 2:** Neues erkunden, Dinge erlegen und sammeln, sie erforschen und dadurch Neues freischalten.

Die Lust aufs Weitermachen soll vor allem aus dem **Spielerlebnis** kommen (Kampf, Wachsen, Freischalten), nicht aus einem einzelnen Titelbild. Gleichzeitig zählt der **erste Eindruck**: schöne, natürlich wirkende Pixel-Art und eine gute Oberfläche.

Feste Regel aus dem Gesamtdesign: **Fortschritt im Spiel bildet echten Lernfortschritt ab** (FSRS), nie Menge oder Tempo.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**
- Ein Zuhause (**Gewächshaus**), in dem man sieht, was man beherrscht (Pflanzen blühen) und was verblasst (Pflanzen welken).
- Ein **Lagerfeuer** draußen als Ausgangspunkt und Pausenplatz, mit einer **Karte**, auf der man wählt, was man lernt.
- **Kämpfe** gegen animierte Fantasy-Bosse, in denen die bestehenden Fragen gestellt werden.
- **Fundstücke → Erforschen → Freischalten** nach dem Vorbild Grounded, gekoppelt an echtes Behalten.
- Hochwertige Pixel-Art von PixelLab, flüssig auf dem Handy.

**Nicht-Ziele (für 1b)**
- Benachrichtigungen (Web-Push) – brauchen einen Push-Server, kommen in Stufe 2.
- Endboss/Klausurmodus, Prüfungsdatum, Bildfragen, Teilen – Stufe 2.
- Freies Herumlaufen in 3D, Musik und Soundeffekte (können später kommen; nichts darf darauf angewiesen sein).
- Ranglisten, soziale Funktionen.

**Anti-Ziele (Fehlschlag, auch wenn es technisch läuft)**
- Das Spiel zeigt mehr Fortschritt als gelernt wurde (Farmen mit leichten oder nicht fälligen Fragen).
- Strafen, die vom Lernen abhalten: **keine Herzen/Lebenspunkte des Spielers**, kein Rauswurf aus dem Kampf, keine harten Sperren.
- Tempo wird belohnt.
- Grafik, die wie ein „Kasten“ oder billiges 3D wirkt; Bosse, die bloß biologische Strukturen ohne Fantasy-Charakter sind.
- Das Lernen wird langsamer oder umständlicher als heute (Animationen dürfen nie das Antworten blockieren).

## 3. Rahmenbedingungen

- 0 € laufende Kosten; keine bezahlte API. PixelLab läuft über das bestehende Abo des Nutzers (Stand 2026-11-20: 1342 Generierungen bis 12.12. frei) und wird **nur zur Bauzeit** genutzt, nie zur Laufzeit.
- Hauptgerät Android-Handy **hochkant**; PC (quer) und iPhone müssen ebenfalls gut aussehen.
- Offline-fähig wie bisher: Grafiken werden mit der App ausgeliefert und vorab gespeichert (Service Worker).
- Mehrbenutzer: Freunde nutzen dieselbe App ohne PixelLab. Daher müssen alle Grafiken für **beliebige, erst später angelegte Module und Themen** funktionieren (siehe 6.4).
- Technik bleibt: React + TypeScript + Vite (PWA), Dexie, Supabase, ts-fsrs. Bestehende Lernlogik (`buildQueue`, `recordReview`, `Feedback`, `AskDialog`) wird wiederverwendet, nicht neu geschrieben.
- `prefers-reduced-motion`: Animationen werden reduziert, das Spiel bleibt voll benutzbar.

## 4. Bauvarianten (Approaches)

| Variante | Beschreibung | Abwägung |
|---|---|---|
| **A: Gemalte 2D-Pixel-Szenen** ✅ gewählt | Feste Blickpunkte (wie Street View) als von PixelLab gemalte Bilder; Pflanzen, Bosse, Feuer, Effekte als animierte Pixel-Grafiken darüber | Beste Pixel-Art-Optik, leicht fürs Handy, passt zur Klick-Navigation. Neue Räume brauchen neue gemalte Bilder; Blickpunkte müssen zueinander passen. |
| B: Echtes 3D mit Pixel-Look | 3D-Gewächshaus, grob gerastert, Sprites als Billboards | Freies Laufen, Beete beliebig erweiterbar. Glas/Kuppel und natürliche Pixel-Optik schwer, wirkt schnell wie altes 3D; schwerer fürs Handy, viel mehr Arbeit. |

Gewählt vom Nutzer: **A**, weil schöne, natürliche Pixel-Art und das Handy Vorrang haben und Street-View-Navigation ohnehin von Punkt zu Punkt springt.

## 5. Ablauf aus Sicht des Nutzers

```
App öffnen → Titelbild (kurz, antippen) → Gewächshaus (Zuhause)
                                             │ Tür
                                             ▼
                                  Waldplatz mit Lagerfeuer
                                             │ Feuer antippen
                                             ▼
                                  Karte: Regionen (Module) mit Orten (Themen)
                                             │ Ort/Boss antippen
                                             ▼
                                  Kampf (Fragen) → Ergebnis/Beute → zurück ans Feuer
```

Einstellungen und Synchronisieren bleiben erreichbar (z. B. kleines Menü-Symbol oben), sind aber nicht mehr der Startbildschirm.

## 6. Die Teile (vom Nutzer entschieden, sofern nicht als „Vorschlag“ markiert)

### 6.1 Titelbild
- Kurzes, stimmungsvolles Titelbild, das Lernen und Abenteuer verbindet (Gewächshaus/Wald, Name der App), antippen → Gewächshaus.
- *Vorschlag:* zeigt dezent den heutigen Stand (z. B. „3 Pflanzen welken · Quest 0/2“), damit der Einstieg sofort Sinn ergibt.

### 6.2 Gewächshaus (Zuhause)
- **Ich-Perspektive:** Man steht im Mittelgang, links und rechts Beete, oben sieht man das Dach.
- **Optik:** schönes Glashaus mit **Glaskuppel oder Spitzdach**, durchsichtig, natürlich wirkende Pixel-Art, ausdrücklich **kein Kasten**.
- **Bewegung wie Street View:** per Klick/Tipp einen Schritt nach vorn, zur Seite schauen, umdrehen. Feste Blickpunkte.
- Pflanzen zeigen Gelerntes. Viele Pflanzen, Bäume, Früchte; je voller, desto mehr **Insekten** (Schmetterlinge, Bienen …), es wird „schön, fröhlich und toll“.
- *Meine Entscheidung (weil Bosse je Modul sind, siehe 6.5):* **Je Modul ein Beet, je Thema eine Pflanze darin.** Eine Themen-Pflanze wächst, sobald das Thema sicher sitzt (Regel in 6.5). Ist der Modul-Boss endgültig besiegt, kommt eine besondere Pflanze dazu (z. B. ein kleiner Baum mitten im Beet). So füllt sich das Haus Thema für Thema und nicht nur einmal pro Modul.
- **Interaktion:** Pflanze antippen → Schild mit Thema und Modul (z. B. „Chloroplasten · Botanik · sitzt sicher · 12 Karten“).
- Man kann sich hier in der Pause aufhalten und kleine Spielereien machen; **Beete hinzufügen**, **Erde verbessern**, **umstellen/gestalten** als Belohnungen (siehe 6.6).
- Eine Tür führt nach draußen zum Waldplatz.
- *Vorschlag:* **Welken = Vergessen.** Sitzt ein Thema nicht mehr sicher, weil schon gelernte Karten verblassen, welkt seine Pflanze; das Schild zeigt „welkt · 3 Karten fällig“. Wiederholen im Kampf lässt sie wieder aufblühen. Pflanzen sterben nie ganz.

### 6.3 Waldplatz mit Lagerfeuer
- Kleiner Waldplatz mit schöner Aussicht (Skyline/Horizont), **animiertes, sichtbar brennendes Lagerfeuer**.
- Feuer antippen → die **Karte** klappt als Fenster auf.
- *Vorschlag:* Nach jedem Kampf kehrt man ans Feuer zurück. Wer dort eine Weile Pause macht (5–10 min, wie im Gesamtdesign), wird **„Ausgeruht“** (Bonus im nächsten Kampf, siehe 6.6). Weiterkämpfen ohne Pause ist erlaubt.

### 6.4 Karte
- Fenster über dem Waldplatz. Hier wählt man, was man lernen will.
- **Je Modul eine Region mit einem Boss** (vom Nutzer entschieden: man wählt am Anfang das Modul; ein Boss je Thema wäre zu unübersichtlich). Die Themen des Moduls erscheinen nur als Detail in der Region (z. B. kleine Fähnchen: fällig / neu / sitzt sicher), nicht als eigene Kampforte.
- *Vorschlag:* Je Region sichtbar, ob heute etwas fällig ist und ob neue Karten warten; oben der Stand der **Tages-Quest** (fällige Wiederholungen + neue Karten bis zum Tageslimit, wie im Gesamtdesign).
- *Vorschlag:* Region-Optik kommt aus einem festen **Vorrat an Regionsthemen** (z. B. Wald, Arena, Küste, Gebirge, Sumpf, Wüste); ein Modul bekommt automatisch eines (aus dem Modulnamen abgeleitet, stabil), in den Einstellungen änderbar. So funktioniert es für jedes Fach, auch Sportwissenschaft.
- Unentdeckte Gebiete (noch kein Modul) liegen im Nebel.
- Keine gesperrten Orte.

### 6.5 Kampf
- Handy hochkant: **oben der Boss** in einer **Idle-Animation**, darunter die **Frage** (bestehende Fragetypen).
- **Richtig:** Angriffsanimation, Boss wird getroffen. **Combo** (Serie richtiger Antworten): **heftigere Animationen**, die stärker treffen.
- **Falsch:** Der Boss greift an (sichtbar: Bild wackelt, Rand blinkt). **Keine Herzen, kein Verlust, kein Rauswurf.** Danach Rückmeldung mit Vergleich der eigenen Antwort und „Nachfragen“ wie heute.
- **Ein Boss je Modul**, die Fragen mischen alle Themen des Moduls (das hält auch das Mischen/Interleaving aus dem Gesamtdesign aufrecht; die heutige Lernliste filtert schon nach Modul).
- **Bosse mit Fantasy-Charakter**, nicht bloß eine Zelle: z. B. „Hüter des Grünen Kodex“ für Botanik, mit Rüstung, Gesicht, Persönlichkeit.
- *Vorschlag:* Man sieht **keine eigene Figur** (Ich-Perspektive wie im Gewächshaus); eigene Angriffe fliegen von unten ins Bild.
- *Vorschlag:* Weitere Regeln aus dem Gesamtdesign bleiben: kein Tempobonus; **Krit** bei richtiger Antwort auf eine lange nicht gesehene Karte; **zufällige Bonus-Treffer**; Kampfgröße wie heute (bis 25 Karten).
- *Vorschlag – zwei Arten von Boss-Leben:* *Ersetzt durch `2026-11-25-boss-leben-design.md`.*
  - **Kampf-Leben** (im Kampf sichtbar): Der Boss hat für diesen Kampf so viel Leben, wie Fragen anstehen. Jede richtige Antwort trifft sichtbar; am Ende des Kampfes ist er für heute **besiegt oder geflohen**. Das sorgt für spürbare Treffer.
  - **Gebiets-Bedrohung** (auf der Karte sichtbar): Anteil der **schon gelernten** Karten des Moduls, die laut FSRS gerade nicht sicher sitzen (Abrufwahrscheinlichkeit unter Zielwert oder Stabilität unter einer Schwelle). Sie sinkt über Tage und **steigt wieder, wenn Wissen verblasst**.
- **Nur Gelerntes zählt** (vom Nutzer entschieden): *Ersetzt durch `2026-11-25-boss-leben-design.md`.* Noch nie gesehene Karten erhöhen die Bedrohung nicht. Kommen in der Werkstatt neue Karten dazu, welkt nichts; sie erscheinen als „neue Karten“ an der Region bzw. am Thema.
- **Sitzt sicher:** Ein Thema sitzt sicher, wenn jede seiner Karten mindestens einmal gelernt wurde und alle gerade sicher sitzen → seine Pflanze wächst (6.2). Fällt eine gelernte Karte darunter, welkt die Pflanze.
- Der Modul-Boss gilt als **endgültig besiegt**, sobald alle Themen des Moduls zum ersten Mal gleichzeitig sicher sitzen → besondere Pflanze im Beet (6.2). Er kann danach als „erholter“ Boss zurückkommen, wenn Wissen verblasst; die Pflanzen welken dann, sterben aber nie.
- Kämpfe ziehen die fälligen und neuen Karten **eines Moduls**, gemischt über die Themen (bestehende Lernliste mit Modulfilter). **Training** mit nicht fälligen Karten bleibt möglich, ohne Boss-Schaden und ohne Fundstücke.

### 6.6 Belohnungen, Fundstücke, Forschung
*Gesamter Abschnitt ist Vorschlag (das Gesamtdesign lässt Beute-Details ausdrücklich offen: „Builder schlägt vor, Nutzer streicht und ergänzt“).*
- Bosse lassen **Fundstücke** fallen (z. B. Samen, Sporen, Kristalle aus dem Gebiet). Chance pro Kampf; „Ausgeruht“ und Combos erhöhen sie, Training gibt keine.
- Ein Fundstück ist zunächst **unerforscht**. Es stammt aus einem Thema des Moduls (aus dem Thema der Frage, mit der es fiel). **Erforscht** wird es, wenn dieses Thema laut FSRS sicher sitzt (gleiche Regel wie oben) und das an mindestens zwei verschiedenen Tagen. Erforschen braucht also echtes Behalten und ist ein Grund, morgen wiederzukommen.
- Erforschte Fundstücke schalten **Dinge fürs Gewächshaus** frei: zusätzliche Beete, bessere Erde (Pflanzen sehen prächtiger aus), Deko (Laternen, Gießkanne, Bank, Teich), später einen weiteren Raum hinter der Tür.
- Sicher sitzende Themen → Pflanze, besiegter Modul-Boss → besondere Pflanze (6.5). Die **Pflanzenart** kommt aus einem festen Vorrat und wird dem Thema stabil zugeordnet (das Regionsthema bestimmt die Auswahl).
- Keine Erfahrungspunkte/Level in 1b (würden Menge belohnen); Tages-Quest und Tagesserie bleiben als Rahmen.

## 7. Grafik

- Alle Grafiken **mit PixelLab erzeugt**, als Dateien im Projekt abgelegt und mit der App ausgeliefert (offline verfügbar). Austauschbar eingebunden (eine Datei pro Grafik, Zuordnung per Konfiguration).
- **Vorrat statt Einzelstücke**, weil Themen und Module erst später entstehen und Freunde kein PixelLab haben:
  - Bosse: je Regionsthema mehrere Boss-Typen mit Idle-, Angriffs-, Treffer- und Combo-Animation; Zuordnung Modul → Boss stabil (z. B. aus der Modul-ID abgeleitet, in den Einstellungen änderbar wie das Regionsthema). Der **Bossname** wird aus dem Modulnamen gebildet (z. B. „Hüter des Grünen Kodex“ für Botanik).
- **Budget und Freigabe** (vom Nutzer entschieden): Stufe 1b darf das ganze PixelLab-Kontingent nutzen (1342 Generierungen bis 12.12.2026, danach neues Kontingent) und dafür größere Vorräte anlegen. Je Teil zeigt der Builder dem Nutzer zuerst einen **Stil-Entwurf** (erster Boss, Lagerfeuer, Blick ins Gewächshaus …); erst nach dessen OK geht die Grafik in die App. Diese Freigaben sind feste Haltepunkte im Plan.
- **Gewächshaus zuerst testen** (vom Nutzer entschieden): Bevor Gewächshaus-Code entsteht, prüft ein kurzer Versuch mit wenigen Generierungen, ob die Blickpunkte stimmig zum selben Glashaus gehören. Klappt es nicht, bekommt der Nutzer zwei Ersatzlösungen zur Wahl: weniger Blickpunkte (z. B. nur Gang vor/zurück) oder ein breiter Rundblick zum Wischen. Der Versuch darf vor Teil 3 liegen, damit die Antwort früh feststeht.
  - Pflanzen: Vorrat an Arten mit Wachstumsstufen, Blüte und welkem Zustand.
  - Regionsthemen für die Karte, Insekten, Deko-Objekte, Effekte.
- **Gewächshaus:** gemalte Hintergründe je Blickpunkt (Position × Blickrichtung); Beet-Plätze je Blickpunkt mit Bildposition und Größe, auf die Pflanzen gesetzt werden. Die Blickpunkte müssen sichtbar zum selben Haus gehören.
- Lagerfeuer und Insekten animiert.
- *Vorschlag:* Grafiken in kleiner Pixel-Auflösung, scharf hochskaliert (`image-rendering: pixelated`). Gesamtgröße so halten, dass die App auch über mobiles Netz schnell installiert ist.

## 8. Daten

- *Vorschlag:* Alles, was sich aus dem Lernstand ableiten lässt, wird **berechnet, nicht gespeichert**: Gebiets-Bedrohung, besiegt/welk, Tages-Quest, Markierungen auf der Karte. So kann das Spiel nie vom echten Lernstand abweichen.
- Gespeichert und synchronisiert werden nur echte Spielentscheidungen und Funde: Fundstücke und ihr Erforscht-Status, freigeschaltete und platzierte Gewächshaus-Dinge, gewähltes Regionsthema je Modul, Zeitpunkt der letzten Pause (für „Ausgeruht“), Zeitpunkt, zu dem ein Thema erstmals sicher saß und ein Modul-Boss erstmals endgültig besiegt wurde, gewählter Boss je Modul.
- Speicherung lokal (Dexie, offline) und in Supabase, mit RLS „nur eigene Zeilen“ wie alle Tabellen; Konfliktregel wie bisher (neueste Änderung gewinnt).
- `schema.sql` wird erweitert; die Erweiterung muss auf bestehenden Datenbanken gefahrlos erneut ausführbar sein (wie heute).

## 9. Reihenfolge (Teilprojekte)

Jedes Teil ist für sich nutzbar und wird einzeln fertiggestellt:

1. **Kampf:** Kampfbildschirm mit erstem Boss-Vorrat, Animationen, Combo/Krit, Kampf-Leben, Modul-Boss. Lernen läuft danach schon „als Spiel“.
2. **Lagerfeuer + Karte + Titelbild:** neuer Einstieg ersetzt die heutige Startseite; Regionen, Tages-Quest, Gebiets-Bedrohung, Ausgeruht.
3. **Gewächshaus:** Ich-Perspektive mit Blickpunkten, Pflanzen je besiegtem Boss, Welken, Schilder, Insekten.
4. **Fundstücke + Forschung + Gestalten:** Beute, Erforschen, Freischalten von Beeten/Erde/Deko.

Der Nutzer kann die Reihenfolge ändern.

*Meine Entscheidung:* Dieses Dokument beschreibt alle vier Teile, damit gemeinsame Grundlagen (Bedrohung/„sitzt sicher“, Spieltabelle, Grafik-Ablage) von Anfang an passen. Geplant und gebaut wird **Teil für Teil**, beginnend mit Teil 1; jeder Teil bekommt seinen eigenen Plan.

## 10. Dem Builder überlassen

- Rendering-Technik der Szenen und Animationen (DOM/CSS-Sprites, Canvas oder eine kleine 2D-Bibliothek), solange es auf Mittelklasse-Android flüssig läuft und offline funktioniert.
- Genaue Schwellen (Abrufwahrscheinlichkeit/Stabilität für „sitzt sicher“), Combo- und Krit-Formeln, Fundchancen.
- Anzahl der Blickpunkte im Gewächshaus und der Beet-Plätze je Blickpunkt; Umgang mit Hochkant vs. Quer.
- Wie FSRS Training mit nicht fälligen Karten verbucht.
- Konkrete PixelLab-Werkzeuge und Prompts; Anzahl der Boss-/Pflanzentypen im ersten Vorrat (genug, dass sich Bosse in einem Modul selten wiederholen).
- Tabellen- und Feldnamen.
