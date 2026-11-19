import { describe, it, expect } from 'vitest'
import { parseGeneration, ParseError } from '../src/parse'

const choice = (q = 'Was ist 1+1?') => ({
  topic: 'Mathe',
  type: 'choice',
  payload: {
    question: q,
    options: [
      { text: 'a', correct: true, why: 'weil' },
      { text: 'b', correct: false, why: 'nein' },
      { text: 'c', correct: false, why: 'nein' },
      { text: 'd', correct: false, why: 'nein' },
    ],
  },
  explanation: 'kurz',
  source: { file: 'a.pdf', page: 3, quote: 'zitat' },
  examRelevant: false,
  fromExam: false,
  difficulty: 2,
})

describe('parseGeneration', () => {
  it('JSON in ```json-Block', () => {
    const raw = 'Hier:\n```json\n' + JSON.stringify({ cards: [choice()] }) + '\n```\nFertig.'
    const { result, rejected } = parseGeneration(raw)
    expect(result.cards).toHaveLength(1)
    expect(rejected).toEqual([])
  })

  it('1 von 3 Karten ungültig → 2 übernommen, 1 rejected mit Grund', () => {
    const bad = { ...choice('x'), difficulty: 7 }
    const { result, rejected } = parseGeneration(JSON.stringify({ cards: [choice('1'), bad, choice('3')] }))
    expect(result.cards).toHaveLength(2)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]!.index).toBe(1)
    expect(rejected[0]!.reason).toMatch(/difficulty/)
  })

  it('abgeschnittenes Array → vollständige Karten gerettet', () => {
    const full = JSON.stringify({ cards: [choice('1'), choice('2'), choice('3')] })
    const cut = full.slice(0, full.length - 60)
    const { result } = parseGeneration(cut)
    expect(result.cards).toHaveLength(2)
  })

  it('Fließtext vor dem JSON; styleProfile/examTopics bleiben erhalten', () => {
    const raw = 'Gerne! ' + JSON.stringify({ cards: [choice()], styleProfile: 'knapp', examTopics: ['Mathe'] })
    const { result } = parseGeneration(raw)
    expect(result.styleProfile).toBe('knapp')
    expect(result.examTopics).toEqual(['Mathe'])
  })

  it('Klammern und Anführungszeichen in Strings stören das Retten nicht', () => {
    const tricky = choice('Was bedeutet "}" in {{x}}?')
    const full = JSON.stringify({ cards: [tricky, choice('2')] })
    const { result } = parseGeneration(full.slice(0, full.length - 40))
    expect(result.cards).toHaveLength(1)
  })

  it('reiner Text → ParseError', () => {
    expect(() => parseGeneration('Das kann ich leider nicht.')).toThrow(ParseError)
  })
})
