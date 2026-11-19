import type { Card } from '@lernapp/shared'
import type { Answer } from '../ui/types'

/** Gibt die Antwort der Nutzerin / des Nutzers als gut lesbaren deutschen Text wieder. */
export function describeAnswer(card: Card, answer: Answer): string {
  if (card.type === 'choice' && answer.kind === 'choice') {
    return card.payload.options[answer.index]?.text ?? '(keine Auswahl)'
  }
  if (card.type === 'cloze' && answer.kind === 'cloze') {
    return card.payload.gaps.map((_, i) => `Lücke ${i + 1}: ${answer.inputs[i]?.trim() || '(leer)'}`).join('; ')
  }
  if (card.type === 'matching' && answer.kind === 'matching') {
    return card.payload.pairs
      .map((p, i) => `${p.left} → ${card.payload.pairs[answer.mapping[i] ?? -1]?.right ?? '(keine Wahl)'}`)
      .join('; ')
  }
  if (card.type === 'order' && answer.kind === 'order') {
    return answer.order.map((orig, pos) => `${pos + 1}. ${card.payload.steps[orig] ?? '?'}`).join('; ')
  }
  if (card.type === 'free' && answer.kind === 'free') return answer.text.trim() || '(keine Antwort getippt)'
  return '(unbekannt)'
}

function questionOf(card: Card): string {
  switch (card.type) {
    case 'choice':
    case 'free':
      return card.payload.question
    case 'cloze':
      return card.payload.text
    case 'matching':
    case 'order':
      return card.payload.prompt
  }
}

function correctOf(card: Card): string {
  switch (card.type) {
    case 'choice':
      return card.payload.options.find((o) => o.correct)?.text ?? ''
    case 'cloze':
      return card.payload.gaps.map((g, i) => `Lücke ${i + 1}: ${g.answers.join(' / ')}`).join('; ')
    case 'matching':
      return card.payload.pairs.map((p) => `${p.left} → ${p.right}`).join('; ')
    case 'order':
      return card.payload.steps.map((s, i) => `${i + 1}. ${s}`).join('; ')
    case 'free':
      return `${card.payload.modelAnswer} (Kernpunkte: ${card.payload.keyPoints.join('; ')})`
  }
}

/** Fertiger Text zum Einfügen in Claude. */
export function buildAskText(card: Card, userAnswer: string): string {
  const lines = [
    'Ich lerne mit Karteikarten und habe eine Frage zu dieser Karte.',
    '',
    `Frage: ${questionOf(card)}`,
    `Meine Antwort: ${userAnswer}`,
    `Richtige Antwort: ${correctOf(card)}`,
  ]
  if (card.explanation) lines.push(`Erklärung: ${card.explanation}`)
  if (card.source) lines.push(`Quelle: ${card.source.file}, S. ${card.source.page}: „${card.source.quote}“`)
  lines.push('', 'Erkläre mir genauer, warum meine Antwort falsch ist und wo mein Denkfehler liegt.')
  return lines.join('\n')
}
