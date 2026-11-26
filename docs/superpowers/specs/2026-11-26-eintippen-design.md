# Wachsende Schwierigkeit: Auswahlkarten werden zu „Antwort eintippen“ (Teil 5a)

## Wozu

Die App soll auf schnellem, optimalem Weg viel Wissen verankern. Auswahlfragen trainieren nur das **Wiedererkennen**;
selbst Hervorholen (freier Abruf) verankert deutlich stärker und entspricht eher der Prüfung. Deshalb soll eine
Auswahlkarte, sobald sie sitzt, schwerer werden: die Antwort wird **eingetippt** statt angetippt. Der Einstieg bleibt
leicht (Auswahl), die Tiefe kommt mit der Zeit.

Entschieden vom Nutzer:
- Eintippen statt im Kopf beantworten und selbst bewerten.
- Prüfung **tolerant und automatisch** (Groß/klein, kleine Tippfehler, erlaubte Synonyme); wertet die App eine
  inhaltlich richtige Antwort trotzdem als falsch, zeigt sie die Lösung mit dem Knopf **„Doch richtig“**.
- Die kurze **Kernantwort** (mit erlaubten Schreibweisen) erzeugt die **Werkstatt**: für neue Karten beim Erzeugen,
  für vorhandene Karten über einen eigenen Lauf.

## Ziele

- Auswahlkarten mit Kernantwort erscheinen ab „sitzt“ als Eingabefeld statt mit vier Optionen.
- Fair: richtige Antworten in anderer Schreibweise werden meist automatisch erkannt; Zweifelsfälle per „Doch richtig“.
- Vorhandene Karten bekommen ihre Kernantwort, ohne dass PDFs gebraucht werden.
- Alte Karten ohne Kernantwort funktionieren unverändert weiter.

## Nicht-Ziele

- Reihenfolge- und Zuordnungskarten werden nicht schwerer (Abläufe eintippen ist am Handy eine Qual).
- Lückentext- und Erklär-Karten bleiben, wie sie sind (sind schon Tippen).
- Keine KI-Bewertung in der App, keine bezahlte API.
- Kein Umbau von Kampf-Balance oder Beute (eine eingetippte Antwort zählt wie jede andere).

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Richtige Antworten werden oft als falsch gewertet → Frust, Nutzer verliert Vertrauen.
- Karten ohne sinnvolle Kurzantwort („Warum …?“) werden erzwungen eingetippt.
- Vorhandene, synchronisierte Karten gehen kaputt oder verlieren Fortschritt.
- Die Werkstatt verändert beim Ergänzen etwas anderes an den Karten als die Kernantwort.

## Ansätze (betrachtet)

1. **Werkstatt erzeugt eine Kernantwort je Auswahlkarte** (gewählt). Funktioniert für fast alle Karten, kennt
   Synonyme, Prüfung zuverlässig. Kostet Werkstatt-Arbeit und einen einmaligen Lauf am PC (über das eigene Claude,
   ohne Zusatzkosten).
2. App nimmt den Text der richtigen Option, nur wenn er kurz ist. Sofort, aber nur ein Teil der Karten, keine Synonyme.
3. Kombination aus 1 und 2. Mehr Sonderfälle für wenig Gewinn.

## Entscheidungen

### Kartenformat (shared)
- `ChoicePayload` bekommt ein **optionales, nullbares** Feld `typed`:
  - `{ answers: string[] }` (mind. 1 Eintrag; der erste ist die angezeigte Lösung, die weiteren sind erlaubte
    Schreibweisen/Synonyme) → Karte kann zur Eingabe werden.
  - `null` → von Claude geprüft, keine sinnvolle Kurzantwort; bleibt immer Auswahl und wird vom Ergänzungs-Lauf
    nicht erneut angefragt. *(Meine Entscheidung nach Builder-Check.)*
  - fehlt → noch nicht geprüft; bleibt Auswahl, bis der Lauf es ergänzt.
- Bestehende Karten (ohne Feld) bleiben gültig; Schema-Prüfung beim Laden/Sync darf nicht scheitern. Ein
  fehlerhaftes `typed` darf die Karte nicht unspielbar machen: sie spielt dann als normale Auswahlkarte.
  *(Meine Entscheidung.)*
- Kernantworten sind kurz (Begriff oder knappe Wortgruppe, Richtwert ≤ 4 Wörter).

### Wann eine Karte schwerer wird (App) — mein Vorschlag, im Gespräch vorgestellt, nicht widersprochen
- Eingabeform, wenn die Karte `typed` hat **und** ihr Lernzustand „Wiederholung“ ist **und** ihre Stabilität
  ≥ 7 Tage (`SECURE_STABILITY_DAYS`) beträgt. Gemessen am Zustand vor der Antwort.
- Vergisst man sie (Wiederlernen, Stabilität sinkt), fällt sie automatisch auf Auswahl zurück.
- Hinweis: `isSecure` taugt hier nicht, weil eine fällige Karte gerade unter dem Zielwert liegt; nur Zustand +
  Stabilität zählen.

### Eingabe und Prüfung (App)
- Neue Fragedarstellung „Eintippen“: Frage, ein einzeiliges Eingabefeld, Knopf „Prüfen“ (Enter schickt ab).
  Kennzeichnung wie bei anderen Typen (`ask-kind`), z. B. „Eintippen“.
- Vergleich baut auf der vorhandenen toleranten Lücken-Prüfung auf (`normalize`, tokenweise, Levenshtein-Toleranz)
  gegen alle `typed.answers`, ist für Eingaben aber **nachsichtiger**: Satzzeichen und deutsche Artikel
  (der/die/das/den/dem/des/ein/eine/einen/einem/einer/eines) am Anfang werden ignoriert. Zusätzlich listet Claude
  gängige Varianten (Singular/Plural, Fachwort/deutsches Wort, Abkürzung) als weitere Antworten.
  *(Meine Entscheidung nach Builder-Check: beides, weil falsche „falsch“-Wertungen ein Anti-Ziel sind.)*
- Treffer → richtig, wird sofort gespeichert wie jede Antwort.
- Kein Treffer → **noch nicht gespeichert**. Die App zeigt die Lösung (`answers[0]`), deine Eingabe, die Begründung
  der richtigen Option und die Erklärung, dazu zwei Knöpfe: **„Doch richtig“** (speichert als richtig) und
  **„Weiter“** (speichert als falsch). Erst danach reagiert der Boss (Treffer bzw. Angriff), und erst dann gibt es
  Combo/Beute. Wird der Kampf vorher beendet oder die App geschlossen, wird für diese Karte nichts gespeichert;
  sie kommt einfach wieder dran. *(Meine Entscheidung nach Builder-Check: keine nachträgliche Korrektur schon
  synchronisierter Daten.)*
- Knopf **„Weiß nicht“** neben „Prüfen“: zählt als falsch, zeigt die Lösung, speichert sofort (kein „Doch
  richtig“). „Prüfen“ ist bei leerem Feld deaktiviert. *(Meine Entscheidung.)*

### Werkstatt
- Der Erzeugungs-Auftrag an Claude verlangt bei jeder Auswahlkarte die Kernantwort; bei Fragen ohne sinnvolle
  Kurzantwort setzt er `typed: null`. Die Regel steht in den gemeinsamen Auftragsregeln und gilt damit auch für
  Karten aus dem claude.ai-Chat-Weg.
- Neuer Ablauf **„Kernantworten ergänzen“**: holt alle nicht gelöschten Auswahlkarten, bei denen `typed` **fehlt**, aus Supabase,
  lässt Claude sie in Stapeln ergänzen (nur aus Frage + richtiger Option + Begründung, keine PDFs) und schreibt
  **nur** das Feld `typed` zurück (Antworten oder `null`; neues `updatedAt`; übriger Inhalt unverändert), damit die App sie per Sync bekommt. Fortschritt sichtbar;
  abbrechbar; erneuter Lauf überspringt schon ergänzte Karten.

## Offen für den Builder

- Genaue Stapelgröße und Form des Claude-Auftrags für den Ergänzungs-Lauf.
- Ort des Knopfs in der Werkstatt-Oberfläche.
- Genaue Gestaltung der Eingabe-Frage (im Stil der vorhandenen Fragetypen).
