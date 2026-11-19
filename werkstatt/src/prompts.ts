import type { Card } from '@lernapp/shared'

export interface PromptChunk {
  path: string
  firstPage: number
  lastPage: number
}

const EXAMPLE = `{
  "cards": [
    {
      "topic": "Name des Themas",
      "type": "choice",
      "payload": {
        "question": "…?",
        "options": [
          { "text": "…", "correct": true,  "why": "Warum richtig" },
          { "text": "…", "correct": false, "why": "Warum falsch" },
          { "text": "…", "correct": false, "why": "Warum falsch" },
          { "text": "…", "correct": false, "why": "Warum falsch" }
        ]
      },
      "explanation": "Kurze Erklärung (1–2 Sätze).",
      "source": { "file": "dateiname.pdf", "page": 17, "quote": "Kurzes wörtliches Zitat" },
      "examRelevant": false,
      "fromExam": false,
      "difficulty": 2
    }
  ]
}`

const PAYLOAD_RULES = `Frage-Typen und ihr "payload" (genau so, keine weiteren Felder nötig):
- "choice": { "question", "options": [genau 4 × { "text", "correct", "why" }] } – genau EINE Option mit correct=true; "why" bei JEDER Option (auch bei der richtigen) begründet kurz, warum sie stimmt bzw. falsch ist.
- "cloze": { "text": "Satz mit Platzhaltern {{1}}, {{2}} …", "gaps": [{ "answers": ["Lösung", "Alternativschreibweise"] }, …] } – Platzhalter {{1}}..{{n}} kommen im Text genau einmal je Lücke vor, gaps[0] gehört zu {{1}} usw.
- "matching": { "prompt", "pairs": [3 bis 6 × { "left", "right" }] }
- "order": { "prompt", "steps": [3 bis 8 Schritte in der KORREKTEN Reihenfolge] }
- "free": { "question", "modelAnswer", "keyPoints": [mindestens 1 Stichpunkt] }
Weitere Felder je Karte: "topic" (Thema), "explanation" (kurz!), "source" ({file, page, quote} oder null), "examRelevant" (bool), "fromExam" (bool), "difficulty" (1, 2 oder 3).`

function common(chunk: PromptChunk, ctx: { moduleName: string; existingTopics: string[]; fileName: string }): string {
  const offset = chunk.firstPage - 1
  const topics = ctx.existingTopics.length
    ? `Bereits vorhandene Themen im Modul (verwende exakt diese Namen, wenn sie inhaltlich passen; sonst vergib ein neues, kurzes Thema): ${ctx.existingTopics.map((t) => `"${t}"`).join(', ')}.`
    : 'Im Modul gibt es noch keine Themen; vergib kurze, klare Themennamen.'
  return `Du erstellst Lernkarten für das Modul "${ctx.moduleName}".

Lies den PDF-Abschnitt mit dem Read-Werkzeug unter diesem absoluten Pfad: ${chunk.path}
Der Abschnitt enthält die Seiten ${chunk.firstPage}–${chunk.lastPage} der Originaldatei "${ctx.fileName}".

Seitenzahlen: Gib in "source.page" immer die Seitenzahl im ORIGINAL-PDF an. Offset: Seite im Original = Seite im Abschnitt + ${offset} (Abschnittsseite 1 ist Originalseite ${chunk.firstPage}). "source.file" ist "${ctx.fileName}".

${topics}

${PAYLOAD_RULES}

Allgemeine Regeln:
- Mische die Fragetypen (choice, cloze, matching, order, free) sinnvoll; erzeuge je Abschnitt etwa 8–15 Karten.
- Erklärungen kurz halten (1–2 Sätze).
- Schwerpunkt auf prüfungsrelevantem Wissen: Definitionen, Zusammenhänge, typische Verwechslungen, Zahlen/Fakten, die man wissen muss.
- Keine Fragen zu Inhaltsverzeichnis, Literaturverzeichnis, Vorwort oder organisatorischen Hinweisen; überspringe diese Seiten.
- Erfinde nichts, was nicht im Abschnitt steht. Alles auf Deutsch.`
}

function outputRules(extra: string): string {
  return `
Antwortformat: Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt, ohne Text davor oder danach und ohne Codeblock. Es muss dieser Struktur entsprechen${extra}:

${EXAMPLE}`
}

export function scriptPrompt(
  chunk: PromptChunk,
  ctx: { moduleName: string; existingTopics: string[]; styleProfile: string | null; fileName: string },
): string {
  const style = ctx.styleProfile
    ? `\nStilprofil der echten Prüfung dieses Moduls (orientiere Fragestil, Schwierigkeit und Format daran):\n${ctx.styleProfile}\n`
    : ''
  return `${common(chunk, ctx)}
${style}
Setze bei allen Karten "fromExam": false und "examRelevant": false (die Prüfungsrelevanz wird später ergänzt).
${outputRules('')}`
}

export function examPrompt(
  chunk: PromptChunk,
  ctx: { moduleName: string; existingTopics: string[]; fileName: string },
): string {
  return `${common(chunk, ctx)}

Dieser Abschnitt stammt aus einer ALTKLAUSUR bzw. Prüfung. Erzeuge daraus Lernkarten im Stil der Prüfung und setze bei jeder Karte "fromExam": true und "examRelevant": true (fromExam true, examRelevant true).
Zusätzlich im JSON-Objekt:
- "styleProfile": knappe deutsche Beschreibung des Prüfungsstils (Fragearten, Schwierigkeit, Format, Detailtiefe) in 2–5 Sätzen.
- "examTopics": Liste der in der Prüfung vorkommenden Themen als kurze Namen; verwende dafür die vorhandenen Themennamen, wenn sie passen, sonst neue.
${outputRules(' und zusätzlich die Felder "styleProfile" (String) und "examTopics" (Array von Strings) auf oberster Ebene enthalten')}`
}

export function askPrompt(card: Card, userAnswer: string, history: { role: string; text: string }[]): string {
  const hist = history.length ? history.map((h) => `${h.role === 'user' ? 'Lernende/r' : 'Tutor'}: ${h.text}`).join('\n') : '(noch kein Verlauf)'
  return `Du bist ein geduldiger Tutor. Eine Lernkarte wurde beantwortet; die lernende Person stellt Rückfragen.

Karte (JSON):
${JSON.stringify({ type: card.type, payload: card.payload, explanation: card.explanation, source: card.source })}

Antwort der lernenden Person: ${userAnswer}

Bisheriger Verlauf:
${hist}

Antworte auf Deutsch, kurz und verständlich (max. 6 Sätze), ohne die Frage unnötig zu wiederholen. Wenn die Karte eine Quelle nennt, verweise auf die Seite. Antworte mit reinem Text, nicht als JSON.`
}
