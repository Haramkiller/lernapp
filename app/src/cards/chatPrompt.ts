import { CARD_EXAMPLE, PAYLOAD_RULES } from '@lernapp/shared'

/** Auftrag für den kostenlosen Chat auf claude.ai: Das Skript hängt die Person selbst als PDF an. */
export function chatPrompt(ctx: { moduleName: string; existingTopics: string[] }): string {
  const topics = ctx.existingTopics.length
    ? `Bereits vorhandene Themen im Modul (verwende exakt diese Namen, wenn sie inhaltlich passen; sonst vergib ein neues, kurzes Thema): ${ctx.existingTopics.map((t) => `"${t}"`).join(', ')}.`
    : 'Im Modul gibt es noch keine Themen; vergib kurze, klare Themennamen.'
  return `Du erstellst Lernkarten für das Modul "${ctx.moduleName}".

Lies das angehängte PDF (mein Skript). Die Seiten können gescannt sein: Lies sie dann vom Bild ab. Was du nicht sicher entziffern kannst, lässt du weg, statt zu raten.

Umfang: Erstelle pro Antwort etwa 10–15 Karten, beginnend bei Seite 1 des PDFs. Wenn ich danach "Weiter ab Seite N" schreibe, machst du ab Seite N weiter; bei "Weiter" mit den Seiten nach deiner letzten Antwort. Wiederhole keine Karten aus früheren Antworten.

Quelle: "source.file" ist der Dateiname des angehängten PDFs, "source.page" die Seitenzahl im PDF.

${topics}

${PAYLOAD_RULES}

Allgemeine Regeln:
- Mische die Fragetypen (choice, cloze, matching, order, free) sinnvoll.
- Erklärungen kurz halten (1–2 Sätze).
- Schwerpunkt auf prüfungsrelevantem Wissen: Definitionen, Zusammenhänge, typische Verwechslungen, Zahlen/Fakten, die man wissen muss.
- Keine Fragen zu Inhaltsverzeichnis, Literaturverzeichnis, Vorwort oder organisatorischen Hinweisen; überspringe diese Seiten.
- Erfinde nichts, was nicht im PDF steht. Alles auf Deutsch.
- Setze bei allen Karten "fromExam": false und "examRelevant": false.

Antwortformat: Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt, ohne Text davor oder danach. Es muss dieser Struktur entsprechen:

${CARD_EXAMPLE}`
}

/** Tipp für die nächste Nachricht im selben Chat: ab der Seite nach der höchsten genannten Seite. */
export function nextPageHint(cards: { source: { page: number } | null }[]): string {
  const pages = cards.flatMap((c) => (c.source ? [c.source.page] : []))
  return pages.length ? `Weiter ab Seite ${Math.max(...pages) + 1}` : 'Weiter mit den nächsten Seiten'
}
