import { describe, expect, it } from 'vitest'
import { CARD_EXAMPLE, PAYLOAD_RULES, ParseError, parseGeneration } from '../src/generation'

const choice = (q: string, options = 4) => ({
  topic: 'Mathe',
  type: 'choice',
  payload: {
    question: q,
    options: [
      { text: 'a', correct: true, why: 'weil' },
      { text: 'b', correct: false, why: 'nein' },
      { text: 'c', correct: false, why: 'nein' },
      { text: 'd', correct: false, why: 'nein' },
    ].slice(0, options),
  },
  explanation: 'kurz',
  source: { file: 'a.pdf', page: 3, quote: 'zitat' },
  examRelevant: false,
  fromExam: false,
  difficulty: 2,
})

describe('parseGeneration (shared)', () => {
  it('rettet vollständige Karten aus abgeschnittener Antwort mit Codeblock', () => {
    const full = JSON.stringify({ cards: [choice('1?'), choice('2?'), choice('3?')] })
    const cut = full.slice(0, full.lastIndexOf('"why"'))
    const { result, rejected } = parseGeneration('Hier sind die Karten:\n```json\n' + cut)
    expect(result.cards).toHaveLength(2)
    expect(rejected).toEqual([])
  })

  it('zählt ungültige Karte als rejected', () => {
    const { result, rejected } = parseGeneration(JSON.stringify({ cards: [choice('1?'), choice('2?', 3)] }))
    expect(result.cards).toHaveLength(1)
    expect(rejected[0]!.index).toBe(1)
  })

  it('kein JSON wirft ParseError', () => {
    expect(() => parseGeneration('hallo')).toThrow(ParseError)
  })

  it('PAYLOAD_RULES und CARD_EXAMPLE enthalten das Kartenformat', () => {
    expect(PAYLOAD_RULES).toContain('{{1}}')
    expect(CARD_EXAMPLE).toContain('"cards"')
  })
})
