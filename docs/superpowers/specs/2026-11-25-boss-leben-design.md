# Boss-Leben = Wissen im Modul (Spielschicht Teil 4a)

Stand: 2026-11-25. Ändert Abschnitt 6.5 („zwei Arten von Boss-Leben“, „Nur Gelerntes zählt“) aus
`2026-11-20-spielschicht-stufe-1b-design.md`. Fundstücke, Forschung und Gestalten (6.6) sind ein eigenes Teilprojekt (4b)
und kommen danach.

## 1. Warum

Heute bekommt der Boss in jedem Kampf frisches Kampf-Leben (10 je Frage) und ist am Ende fast immer „Besiegt!“. Auf der
Karte steht danach trotzdem eine hohe Bedrohung, und im Gewächshaus welkt es. Der Nutzer wundert sich, warum der Boss „doch
noch nicht tot“ ist.

Der Nutzer wünscht sich: **Der Boss hat im Kampf dasselbe Leben wie auf der Karte.** Eine Runde macht nur wenig Schaden,
dafür sieht man jedes Mal genau, wie weit man gekommen ist.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**
- Ein einziges Boss-Leben je Modul, das Kampf, Karte und Gewächshaus gleich sehen.
- Jede richtige Antwort macht ehrlichen, sichtbaren Schaden, auch wenn er klein ist.
- Neue Karten machen den Boss stärker (vom Nutzer entschieden).
- Vergessen lässt den Boss langsam wieder wachsen.

**Nicht-Ziele**
- Fundstücke, Forschung, Gestalten des Gewächshauses (Teil 4b).
- Änderungen am Lernalgorithmus (FSRS), an der Lernliste oder an der Kampfgröße (bis 25 Karten).
- Neue Grafiken.

**Anti-Ziele** (wäre ein Fehlschlag, auch wenn es technisch läuft)
- Der Kampf meldet einen Sieg, den Karte oder Gewächshaus nicht bestätigen, oder umgekehrt.
- Richtige Antworten machen sichtbar 0 Schaden, obwohl die Karte besser geworden ist.
- Die Leiste steigt mitten im Kampf (frustrierend; vom Nutzer abgelehnt).

## 3. Entscheidungen

### 3.1 Leben einer Karte (Ansatz 2, vom Nutzer gewählt)

Jede Karte des Moduls gibt dem Boss bis zu 10 Leben:

```
cardLife = 10 × (1 − min(1, Stabilität / 7) × min(1, Abruf / Zielwert))
```

- Neue Karte (kein State oder State „neu“): 10.
- Stabilität und Abruf wie in `mastery.ts` (`SECURE_STABILITY_DAYS = 7`, `recall(s, now)`, Zielwert = Einstellung
  `retention`).
- `cardLife = 0` genau dann, wenn `isSecure` gilt. Kampf, Karte und Gewächshaus widersprechen sich damit nie.

**Boss-Leben** = Summe über alle nicht gelöschten, gültigen Karten im Umfang des Kampfes; **Höchstwert** = 10 × deren
Anzahl. Angezeigt werden ganze Zahlen (die Summe gerundet).

### 3.2 Schaden im Kampf

- Nach jeder gespeicherten Antwort: Schaden = `cardLife` der Karte vorher − nachher (mit dem neuen FSRS-State, gleicher
  Zeitpunkt). Ist der Wert negativ (z. B. bei falscher Antwort), zählt er als 0.
- **Die Leiste steigt im Kampf nie** (vom Nutzer gewählt, Variante A). Die angezeigte Zahl sinkt nur um die Schäden.
  Steigt das echte Leben durch falsche Antworten, sieht man das erst beim nächsten Kampfstart (3.4).
- Combo, Volltreffer (lange nicht gesehen) und Glückstreffer bleiben als **Effekte und Animationen**, ändern den Schaden
  aber nicht mehr. In Teil 4b erhöhen sie die Chance auf Fundstücke. „Ausgeruht“ bleibt mit seinem Hinweis bestehen.
- Kampf-Leben, Phasen und K.-o. entfallen.

### 3.3 Anzeige

- **Im Kampf** (Arena): Lebensleiste mit „280 / 400“ und dem Schaden der letzten Antwort („−6“, bei 0 Schaden „−0“ oder
  nichts; Builder entscheidet). Die Leiste zeigt den Anteil am Höchstwert.
- **Kampfende:** statt „Besiegt!“/„Geflohen“ zum Beispiel:
  - Überschrift „Moosgolem · Botanik geschwächt“ (bei Leben 0: „endgültig besiegt!“, ohne Schaden: „hält stand“),
  - „312 → 280“, „−32 Leben in dieser Runde“, „Noch 70 %“,
  - „3 Karten sitzen jetzt sicher“ (Karten, deren Leben in diesem Kampf auf 0 fiel; nur wenn > 0),
  - wie heute: richtig/teilweise/falsch, höchste Combo, Pausenhinweis.
- **Karte:** „Bedrohung x %“ wird zu „Boss-Leben x %“ (gleiche Formel, Anteil am Höchstwert, gerundet). Ein Modul ohne
  Karten zeigt wie heute „Noch unerforscht“. Ein Modul nur mit neuen Karten zeigt 100 %.

### 3.4 Erholung beim Kampfstart

- Am Kampfende wird das angezeigte Endleben je Modul gespeichert (Spieltabelle `game_items`, eigenes Präfix, synchronisiert
  wie die anderen Spielzeilen; keine Schemaänderung).
- Beim nächsten Kampfstart des Moduls: Ist das echte Leben höher als das gespeicherte, zeigt die Arena kurz
  „Der Moosgolem hat sich erholt: 280 → 291“. Danach gilt das echte Leben. Ohne gespeicherten Wert keine Meldung.
- Gründe für „erholt“: Vergessen, falsche Antworten, neue Karten. Die Meldung unterscheidet sie nicht.
- *Meine Entscheidung:* Die Meldung erscheint nur, wenn das gerundete Leben um mindestens 1 gestiegen ist. Kurzes Vergessen
  löst sie meist nicht aus, weil der Abrufanteil bei 1 gedeckelt ist: Eine Karte gewinnt erst Leben zurück, wenn ihr Abruf
  unter den Zielwert fällt. Falsche Antworten aus dem letzten Kampf zeigen sich hier dagegen fast immer; das ist so gewollt
  (Variante A).

### 3.5 Endgültig besiegt

- Leben 0 heißt: alle Karten des Moduls sitzen sicher. Das ist dieselbe Bedingung, unter der das Gewächshaus den Boss als
  besiegt einträgt und den Baum wachsen lässt. Der Eintrag `boss:<modul>` bleibt, wo er heute geschrieben wird.
- Bekannte, gewollte Abweichung: Kommen nach dem Sieg neue Karten dazu, hat der Boss wieder Leben, der Baum bleibt aber
  stehen (der Sieg war echt). Sonst ändern sich die Gewächshaus-Regeln in diesem Teil nicht (Ausnahme: ungültige Karten, siehe 5).

## 4. Ansätze (Leben einer Karte)

1. **Nur Stabilität**, `10 × (1 − Stabilität/7)`. Einfach, aber eine lange nicht wiederholte Karte zählt 0, obwohl das
   Gewächshaus sie „welkt“ nennt. Widerspruch zwischen den Ansichten.
2. **Stabilität × Abruf** (gewählt). Einzige Variante, bei der 0 genau „sitzt sicher“ ist; Vergessen erzeugt die Erholung
   von selbst. Schaden pro richtiger Antwort etwa 1–6.
3. **Feste Stufen** (10 / 6 / 3 / 0). Leicht verständlich, aber viele richtige Antworten machen 0 Schaden, genau das
   „kein Fortschritt sichtbar“, das weg soll.

## 5. Randbedingungen

- Alles Abgeleitete wird berechnet, nicht gespeichert (Spec 8). Einzige neue gespeicherte Angabe: Endleben je Modul für die
  Erholungsmeldung.
- Kampf ohne Modul (Umfang „alle“): Boss-Leben über alle gültigen Karten, Name wie heute „Unbekanntes Gebiet“.
- Ungültige Karten (die der Kampf überspringt) zählen nicht zum Leben, sonst könnte es nie 0 werden.
  *Meine Entscheidung:* Die Gültigkeitsprüfung wandert in die gemeinsame Spiellogik und gilt **überall** gleich: Kampf,
  Karte und Gewächshaus (auch dessen Besiegt-Prüfung) übergehen ungültige Karten. Sonst könnte der Kampf „endgültig
  besiegt“ melden, während Karte und Gewächshaus es nie bestätigen. Das ist die einzige Änderung am Gewächshaus in diesem
  Teil; ungültige Karten kann man ohnehin nicht lernen.
- UI-Tests warten auf asynchronen Zustand (CI ist langsamer).

## 6. Dem Builder überlassen

- Namen von Funktionen, Typen und des Spielzeilen-Präfixes.
- Ob `moduleThreat` ersetzt oder umbenannt wird; Aufräumen von Phasen-/K.-o.-Code und -CSS.
- Wie die Erholungsmeldung aussieht (Text in der Arena, kurze Einblendung) und wie lange sie steht.
- Rundung im Detail, solange angezeigte Zahlen aufgehen (Start − Summe der angezeigten Schäden = Ende).
