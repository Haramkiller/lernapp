# Fundstücke, Forschung und Gestalten (Spielschicht Teil 4b) – Design

Stand: 2026-11-26. Grundlage: `2026-11-20-spielschicht-stufe-1b-design.md` (Abschnitt 6.6 war dort nur Vorschlag);
dieses Dokument ersetzt 6.6 und den Punkt „Beete hinzufügen, Erde verbessern, umstellen/gestalten“ aus 6.2.

## Warum

Der Nutzer legt die App weg, wenn es **langweilig** wird, vor allem **visuell**. Er wünscht sich einen Sog wie beim
Scrollen durch soziale Medien. Der Entwurf nutzt dafür die Ungewissheit („was ist diesmal drin?“), Seltenheiten, ein
Sammelbuch mit Lücken und ein Gewächshaus, das sich sichtbar verändert. Er nutzt nicht das endlose Weitermachen: Fortschritt
gibt es nur für echtes Lernen und Behalten (feste Regel aus dem Gesamtdesign).

## Ziele, Nicht-Ziele, Anti-Ziele

- **Ziele:**
  - Jeder echte Kampf endet mit einer **Truhe**, deren Inhalt man sieht und die Spannung erzeugt.
  - Funde sind **sichtbare Dinge** aus der Region des Bosses und landen nach dem Erforschen als **Deko im Gewächshaus**.
  - Ein **Sammelbuch** zeigt, was man hat und was noch fehlt.
  - Das Gewächshaus verändert sich auch ohne neue Funde: **Tageszeit** und **bessere Erde**.
  - „**Erforscht morgen**“ gibt einen echten Grund wiederzukommen.
- **Nicht-Ziele:**
  - Handel, Teilen, Ranglisten.
  - Ein weiterer Raum hinter der Tür (später möglich).
  - Freies Verschieben von Deko mit dem Finger.
  - Sound.
  - Erfahrungspunkte oder Level.
- **Anti-Ziele:**
  - Mehr Karten durchklicken bringt mehr Funde, ohne dass etwas behalten wird.
  - Beute-Animationen halten das Antworten auf oder verlangsamen den Kampf.
  - Doppelte Funde sind wertlos und frustrieren.
  - Deko steht schief, schwebt oder verdeckt Pflanzen und Bedienelemente.
  - Ein Fund verschwindet wieder (Funde und Erforscht-Status gehen nie verloren).

## Ansätze

- **Wann Beute fällt (vom Nutzer gewählt: 3):**
  1. Nach jeder richtigen Antwort mit Glück: häufige Überraschungen, aber Unterbrechungen beim Antworten.
  2. Nur eine Truhe am Ende: ruhig, aber im Kampf passiert nichts Neues.
  3. **Beides:** Im Kampf blitzt „✨ Fund!“ kurz auf (Inhalt geheim), am Ende löst die Truhe alles auf.
- **Gestalten (vom Nutzer gewählt: 2):**
  1. Feste Plätze: Deko erscheint von selbst.
  2. **Plätze wählen:** markierte Stellen je Blickpunkt, antippen und Stück wählen.
  3. Frei verschieben: freiester Weg, aber viel Aufwand und in der Ich-Perspektive schnell schief.

## Fundstücke

- **Vorrat:** Je Region (Wald, Sumpf, Kristallberge, Küste, Arena, Vulkan) 6 Stücke: 4 gewöhnlich, 1 selten,
  1 legendär. Das sind 36 Stücke, jedes mit eigener Pixel-Grafik und Namen.
  - Beispiele: leuchtende Pilze, Moosstein (Wald); Kristallgruppe (Kristallberge); Muschel, Koralle (Küste); Glutstein
    (Vulkan).
  - Legendäre Stücke sind groß, zum Beispiel ein kleiner Teich, ein Kristallbrunnen oder ein Glutbaum.
- **Herkunft:** Die Region ist die Region des Bosses des Moduls der Karte, bei der der Fund fiel. Das gilt auch im
  Kampf über alle Module. Jeder Fund merkt sich diese **Karte** und deren Thema.
- **„Richtig“** heißt in diesem Dokument: nicht falsch, also auch teilweise richtig (FSRS „Hard“). Für Funde zählt eine
  Antwort nur, wenn die Karte an diesem Lerntag (Tagesgrenze 04:00 wie bisher) zum ersten Mal beantwortet wird. Karten,
  die nach einer falschen Antwort am selben Tag wiederkommen, bringen keinen Fund.
- **Wie viele:**
  - 1 Fund bei der **dritten** zählenden richtigen Antwort im Kampf.
  - +1 bei einer Combo von 5.
  - +1, wenn der Kampf „Ausgeruht“ begann; dieser Fund fällt bei der vierten zählenden richtigen Antwort.
  - Höchstens 3 Funde pro Kampf.
  - So lohnt „eine Karte richtig, Beenden, neu starten“ nicht: Jeder Fund braucht mehrere Karten, die heute zum ersten
    Mal richtig beantwortet werden.
- **Seltenheit:** gewürfelt im Moment des Funds; der Fund wird sofort gespeichert und geht auch beim Schließen der App
  mitten im Kampf nicht verloren (nicht geöffnete Funde zeigt die nächste Truhe bzw. das Sammelbuch).
  - Normal: 80 % gewöhnlich, 17 % selten, 3 % legendär.
  - Mit „Ausgeruht“ und für den Combo-Fund: 65 % gewöhnlich, 28 % selten, 7 % legendär.
  - Das Stück wird zufällig aus den Stücken dieser Seltenheit in der Region gewählt.
- **Doppelte:** Hat man das Stück schon, wird der Fund zu **1 Dünger** (in der Truhe angezeigt als „doppelt → +1
  Dünger“).
- **Ehrlichkeit:** Funde gibt es nur im normalen Kampf, also für fällige und neue Karten aus der Lernliste. Mehr als 3
  pro Kampf gibt es nie.

## Forschung (geänderte Regel)

- Ein neuer Fund ist **unerforscht**. Er wird **erforscht**, sobald seine Karte an einem **späteren Lerntag** als dem
  Fundtag richtig (auch teilweise) beantwortet wird.
- Erkannt wird das im Kampf direkt bei der Antwort und außerdem aus dem Kartenzustand (z. B. nach Antworten auf einem
  anderen Gerät): letzte Wiederholung an einem späteren Lerntag und die Karte ist nicht im Wiederlernen.
- Das prüft echtes Behalten, denn die Karte kommt erst wieder, wenn sie fällig ist.
- Wird sie falsch beantwortet, wartet der Fund auf die nächste richtige Antwort.
- Ist die Karte gelöscht, gilt der Fund als erforscht, sobald ein beliebiges Thema des Moduls an einem späteren Tag
  sitzt. Er bleibt nie für immer hängen.
- **Anzeige:** Das Sammelbuch zeigt je unerforschtem Fund das Fälligkeitsdatum seiner Karte, z. B. „erforscht, wenn du
  ‚Was sind Moose?‘ morgen wieder weißt“ bzw. „in 3 Tagen“.
- *Meine Entscheidung, geändert gegenüber dem Gespräch:* Vorgeschlagen war „Thema sitzt an zwei verschiedenen Tagen
  sicher“. Ein Thema sitzt aber erst sicher, wenn **jede** Karte eine Stabilität von mindestens 7 Tagen hat. Das dauert
  oft Wochen, und das Versprechen „erforscht morgen“ wäre gebrochen. Die Karte des Funds prüft dasselbe (Abruf an einem
  späteren Tag), nur in Tagen statt Wochen.
- Nach dem Kampf, beim App-Start und beim Öffnen des Sammelbuchs wird geprüft, ob neue Funde erforscht sind. Das
  Gewächshaus meldet „2 Funde erforscht!“ einmalig.

## Truhe und Leuchten

- Am Kampfende erscheint vor dem Ergebnis die **Truhe**, wenn es Funde gab.
  - Sie leuchtet in der Farbe des seltensten Funds darin.
  - Antippen öffnet sie und zeigt die Funde nacheinander, jeweils mit Name, Seltenheit und Leuchten.
  - Danach kommt das bisherige Ergebnis.
- **Leuchten** (CSS-Effekte, keine Generierungen):
  - Gewöhnlich: sanftes Grün.
  - Selten: kräftiges Blau, pulsierend.
  - Legendär: Gold mit drehenden Strahlen und Funken.
  - Im Sammelbuch und im Gewächshaus bleibt ein dezenter Schein. Legendäre Stücke glitzern ab und zu.
  - Bei `prefers-reduced-motion` gibt es nur ruhiges Leuchten, ohne Drehen und Pulsieren.
- **Im Kampf:** Bei der Antwort, die einen Fund bringt, blitzt kurz „✨ Fund!“ auf. Es blockiert nichts.
- Antippen ist nötig, um die Truhe zu öffnen. „Überspringen“ zeigt alles auf einmal.

## Sammelbuch

- Erreichbar über einen Knopf im Gewächshaus und über das Szenenmenü.
- Je Region eine Reihe mit 6 Feldern:
  - Gefundene Stücke mit Grafik und Leuchten.
  - Fehlende Stücke als Silhouette „?“.
  - Kopfzeile: „Wald 3/6“.
- Unerforschte Funde stehen oben mit ihrem Hinweis (siehe Forschung).
- Oben steht der Dünger-Vorrat.

## Gestalten

- Jeder Blickpunkt des Gewächshauses hat **markierte Plätze**:
  - Kleine Plätze für gewöhnliche und seltene Stücke.
  - Große Plätze für legendäre (und auch kleinere) Stücke.
  - Insgesamt etwa 10–14 Plätze im ganzen Haus, auf dem Boden des Mittelgangs, an den Beet-Ecken und bei der Tür.
  - Die Plätze verdecken keine Pflanzen und keine Knöpfe.
- **Gestalten-Modus:** Ein Knopf „Gestalten“ zeigt die Plätze als Markierungen. Platz antippen öffnet die Auswahl der
  erforschten Stücke, die hineinpassen, plus „Leer“. Jedes Stück steht höchstens an einem Platz.
- Gespiegelte Blickpunkte („Beet rechts“) haben eigene Plätze. Was dort steht, sieht man nicht doppelt.
- Ein Stück, das man auf einen anderen Platz stellt, verschwindet vom alten.

## Erde verbessern

- **Dünger** kommt nur aus doppelten Funden.
- Jedes Beet (Modul) hat eine **Erdstufe 0–3**. Stufe 1 kostet 2 Dünger, Stufe 2 kostet 4, Stufe 3 kostet 6.
- **Sichtbar:** Pflanzen im Beet sind je Stufe etwas größer (+8 %) und kräftiger gefärbt. Ab Stufe 3 glitzern sie leicht.
- Verbessern geht im Gestalten-Modus über das Beet-Schild.
- Erde wirkt nur auf das Aussehen, nie auf Lernwerte.

## Tageszeit

- Das Gewächshaus folgt der Uhrzeit des Geräts:
  - Morgen 6–10 Uhr: kühles, helles Licht.
  - Tag 10–17 Uhr: neutral.
  - Abend 17–21 Uhr: warmes Gold.
  - Nacht 21–6 Uhr: dunkelblau; Funde leuchten stärker, Glühwürmchen erscheinen.
- Das Licht ist eine Farbschicht über dem Bild, es braucht keine neuen Grafiken.

## Daten

- Alles liegt in der bestehenden Spieltabelle (`game`, Dexie und Supabase, „neueste Änderung gewinnt“, RLS wie bisher).
  `schema.sql` muss nicht geändert werden.
- **Gespeichert wird:**
  - Funde: Stück, Seltenheit, Region, Karte, Thema, Modul, Fundzeitpunkt und Fundtag, erforscht am.
  - Platzierungen.
  - Erdstufe je Modul.
  - Gemeldete Forschung (damit „erforscht!“ nur einmal erscheint).
- **Berechnet** wird der Dünger-Vorrat: doppelte Funde minus ausgegebener Dünger laut Erdstufen.
- Die Erforschung wird beim Prüfen gespeichert und ist danach fest. Sie geht also nicht verloren, wenn die Karte später
  wieder verblasst.

## Grafik

- PixelLab, nur zur Bauzeit. Bis 12.12.2026 sind 849 Generierungen frei.
- Benötigt: 36 Fundstücke und eine Truhe (geschlossen und offen), etwa 40–60 Generierungen mit Nachbesserungen.
- **Stil-Entwurf:** Zuerst 3 Stücke (gewöhnlich, selten, legendär aus dem Wald) und die Truhe im Gewächshaus zeigen.
  Erst nach dem OK des Nutzers folgen die übrigen. Das ist ein fester Haltepunkt im Plan.
- Die Grafiken passen zum freigegebenen Stil (`app/public/game/STIL.md`) und sehen in der Perspektive des Gewächshauses
  natürlich aus (auf dem Boden stehend, leicht von oben).

## Meine Entscheidungen

- Die geänderte Forschungsregel (siehe oben).
- Funde fallen nur für richtige Antworten auf Karten, die heute zum ersten Mal drankommen, frühestens bei der dritten.
  „Ausgeruht“ bringt einen Fund und bessere Seltenheit, aber nie mehr als 3.
- „Teilweise richtig“ zählt als richtig, für Funde wie für Forschung.
- Seltenheit wird beim Fund gewürfelt und der Fund sofort gespeichert; die Truhe zeigt alle noch nicht gezeigten Funde.
- Im Kampf über alle Module bestimmt das Modul der jeweiligen Karte die Region.
- Doppelte werden zu Dünger. Erde verbessert nur das Aussehen.
- Ein Sammelbuch statt eines Inventars, weil sichtbare Lücken zum Sammeln einladen.
- Tageszeit als Farbschicht, weil sie ohne Kosten für Abwechslung sorgt.
- Der Weg zur Truhe: Ergebnis-Bildschirm des Kampfs, vor der bisherigen Zusammenfassung.

## Dem Builder überlassen

- Namen und genaue Motive der 36 Stücke (passend zur Region).
- Genaue Positionen und Anzahl der Plätze je Blickpunkt (innerhalb 10–14 insgesamt).
- Aufteilung in Komponenten und Dateien; Form der Datensätze in `game`.
- Animationsdetails der Truhe und des Leuchtens.
- Wann genau die Erforschung im Ablauf geprüft wird, solange es die drei genannten Zeitpunkte abdeckt.
