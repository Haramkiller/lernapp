import { describe, expect, it } from 'vitest'
import type { ChoicePayload, ClozePayload, MatchingPayload, OrderPayload } from '@lernapp/shared'
import { checkChoice, checkCloze, checkMatching, checkOrder, checkTyped } from '../src/answers/check'

const gap = (...answers: string[]): ClozePayload => ({ text: '{{1}}', gaps: [{ answers }] })
const gaps = (...answers: string[]): ClozePayload => ({
  text: answers.map((_, i) => `{{${i + 1}}}`).join(' '),
  gaps: answers.map((a) => ({ answers: [a] })),
})

describe('checkCloze', () => {
  it.each([
    ['gametophyt ', true],
    ['Gametophyt', true],
    ['Gametofyt', true],
    ['Sporophyt', false],
  ])('Lücke "%s" → %s', (input, ok) => expect(checkCloze([input], gap('Gametophyt')).perGap[0]).toBe(ok))
  it('Umlaut-Ersatz: "Kraeuter" = "Kräuter"', () => expect(checkCloze(['Kraeuter'], gap('Kräuter')).perGap[0]).toBe(true))
  it('Umlaut-Ersatz: "Kräuter" = "Kraeuter"', () => expect(checkCloze(['Kräuter'], gap('Kraeuter')).perGap[0]).toBe(true))
  it('Toleranz ab 5 Zeichen: "Phloen" für "Phloem" richtig', () => expect(checkCloze(['Phloen'], gap('Phloem')).perGap[0]).toBe(true))
  it('keine Toleranz unter 5 Zeichen: "ADP" für "ATP" falsch', () => expect(checkCloze(['ADP'], gap('ATP')).perGap[0]).toBe(false))
  it('Abstand 2 erst ab 10 Zeichen', () => {
    expect(checkCloze(['Gametophyyy'], gap('Gametophyt')).perGap[0]).toBe(true)
    expect(checkCloze(['Phloxx'], gap('Phloem')).perGap[0]).toBe(false)
  })
  it('weitere akzeptierte Antworten zählen', () => expect(checkCloze(['Siebröhre'], gap('Phloem', 'Siebröhre')).perGap[0]).toBe(true))
  it('"Na" ist falsch für "Na+"', () => expect(checkCloze(['Na'], gap('Na+')).perGap[0]).toBe(false))
  it('"Cl" ist falsch für "Cl-"', () => expect(checkCloze(['Cl'], gap('Cl-')).perGap[0]).toBe(false))
  it.each([
    ['ADP-Synthase', 'ATP-Synthase'],
    ['Meiose I', 'Meiose II'],
    ['Hypotonie', 'Hypertonie'],
    ['Typ 1', 'Typ 2'],
    ['Ca3+', 'Ca2+'],
  ])('verwechselbare Begriffe: "%s" für "%s" falsch', (input, answer) =>
    expect(checkCloze([input], gap(answer)).perGap[0]).toBe(false))
  it('tokenweise Toleranz: "ATP-Synthas" für "ATP-Synthase" richtig', () =>
    expect(checkCloze(['ATP-Synthas'], gap('ATP-Synthase')).perGap[0]).toBe(true))
  it('Ergebnis pro Lücke und Outcome', () => {
    expect(checkCloze(['a', 'b', 'c'], gaps('a', 'b', 'c')).outcome).toBe('right')
    expect(checkCloze(['a', 'b', 'x'], gaps('a', 'b', 'c'))).toEqual({ perGap: [true, true, false], outcome: 'partial' })
    expect(checkCloze(['a', 'x', 'x'], gaps('a', 'b', 'c')).outcome).toBe('wrong')
  })
  it('2 von 3 Lücken → partial', () => expect(checkCloze(['a', 'b', 'x'], gaps('a', 'b', 'c')).outcome).toBe('partial'))
  it('fehlende Eingaben zählen als falsch', () => expect(checkCloze([], gaps('a', 'b')).outcome).toBe('wrong'))
})

describe('checkChoice', () => {
  const p: ChoicePayload = {
    question: 'q',
    options: [0, 1, 2, 3].map((i) => ({ text: `o${i}`, correct: i === 2, why: 'w' })),
  }
  it('richtig', () => expect(checkChoice(2, p)).toBe('right'))
  it('falsch', () => expect(checkChoice(0, p)).toBe('wrong'))
})

describe('checkMatching', () => {
  const p: MatchingPayload = { prompt: 'p', pairs: [0, 1, 2, 3].map((i) => ({ left: `l${i}`, right: `r${i}` })) }
  it('alle richtig', () => expect(checkMatching([0, 1, 2, 3], p)).toBe('right'))
  it('50 % → partial', () => expect(checkMatching([0, 1, 3, 2], p)).toBe('partial'))
  it('unter 50 % → wrong', () => expect(checkMatching([1, 0, 3, 2], p)).toBe('wrong'))
})

describe('checkOrder', () => {
  const p: OrderPayload = { prompt: 'p', steps: ['a', 'b', 'c', 'd'] }
  it('exakt → right', () => expect(checkOrder([0, 1, 2, 3], p)).toBe('right'))
  it('Reihenfolge mit einer Nachbarvertauschung → partial', () => expect(checkOrder([0, 2, 1, 3], p)).toBe('partial'))
  it('Vertauschung nicht benachbarter Schritte → wrong', () => expect(checkOrder([2, 1, 0, 3], p)).toBe('wrong'))
  it('zwei Vertauschungen → wrong', () => expect(checkOrder([1, 0, 3, 2], p)).toBe('wrong'))
})

describe('checkTyped', () => {
  const A = ['Mitochondrien', 'Mitochondrium', 'Kraftwerk der Zelle']
  it('erkennt Lösung tolerant: Groß/klein, Artikel, Satzzeichen, Tippfehler, Synonym', () => {
    expect(checkTyped('Mitochondrien', A)).toBe(true)
    expect(checkTyped('mitochondrien', A)).toBe(true)
    expect(checkTyped('die Mitochondrien', A)).toBe(true)
    expect(checkTyped('Mitochondrien.', A)).toBe(true)
    expect(checkTyped('Mitochondiren', A)).toBe(true)
    expect(checkTyped('das Kraftwerk der Zelle', A)).toBe(true)
    expect(checkTyped('ATP', ['ATP', 'Adenosintriphosphat'])).toBe(true)
  })
  it('lehnt anderes Wort und leere Eingabe ab; kurze Wörter exakt', () => {
    expect(checkTyped('Ribosomen', A)).toBe(false)
    expect(checkTyped('', A)).toBe(false)
    expect(checkTyped('   ', A)).toBe(false)
    expect(checkTyped('ADP', ['ATP'])).toBe(false)
  })
})
