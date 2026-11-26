import { describe, expect, it } from 'vitest'
import { ParseError, type Card, type Module, type Topic } from '@lernapp/shared'
import { newModule, prepareImport, questionKey } from '../../src/cards/prepare'

const NOW = new Date('2026-11-26T10:00:00.000Z')
const ids = () => {
  let n = 0
  return () => `id-${++n}`
}

const choice = (question: string, topic = 'Moose', page: number | null = 3) => ({
  topic,
  type: 'choice',
  payload: {
    question,
    options: [
      { text: 'a', correct: true, why: 'weil' },
      { text: 'b', correct: false, why: 'nein' },
      { text: 'c', correct: false, why: 'nein' },
      { text: 'd', correct: false, why: 'nein' },
    ],
  },
  explanation: 'kurz',
  source: page === null ? null : { file: 'skript.pdf', page, quote: 'z' },
  examRelevant: false,
  fromExam: false,
  difficulty: 2,
})
const free = (question: string) => ({ ...choice(question), type: 'free', payload: { question, modelAnswer: 'm', keyPoints: ['k'] } })
const answer = (...cards: unknown[]) => JSON.stringify({ cards })

const mod: Module = { id: 'm1', name: 'Botanik', examDate: null, styleProfile: null, updatedAt: 'x' }
const moose: Topic = { id: 't1', moduleId: 'm1', name: 'Moose', updatedAt: 'x' }
const stored = (question: string, deleted = false): Card =>
  ({ ...choice(question), topic: undefined, id: 'c-old', moduleId: 'm1', topicId: 't1', createdAt: 'x', updatedAt: 'x', deleted }) as unknown as Card

describe('prepareImport', () => {
  it('neues Modul: Modul, Themen und Karten mit IDs und Zeitstempeln', () => {
    const p = prepareImport(answer(choice('A?'), choice('B?', 'Farne')), { kind: 'new', module: newModule(' Botanik ', NOW, () => 'm-new') }, { topics: [], cards: [] }, NOW, ids())
    expect(p.isNewModule).toBe(true)
    expect(p.module).toMatchObject({ name: 'Botanik', examDate: null, styleProfile: null, updatedAt: NOW.toISOString() })
    expect(p.topics.map((t) => t.name)).toEqual(['Moose', 'Farne'])
    expect(p.found).toBe(2)
    for (const c of p.cards) {
      expect(c.moduleId).toBe(p.module.id)
      expect(p.topics.some((t) => t.id === c.topicId && t.moduleId === p.module.id)).toBe(true)
      expect(c.createdAt).toBe(NOW.toISOString())
      expect(c.updatedAt).toBe(NOW.toISOString())
      expect(c.deleted).toBe(false)
      expect('topic' in c).toBe(false)
    }
    expect(new Set(p.cards.map((c) => c.id)).size).toBe(2)
  })

  it('bestehendes Thema in anderer Schreibweise wird wiederverwendet', () => {
    const p = prepareImport(answer(choice('A?', 'moose')), { kind: 'existing', module: mod }, { topics: [moose], cards: [] }, NOW, ids())
    expect(p.isNewModule).toBe(false)
    expect(p.module).toBe(mod)
    expect(p.topics).toEqual([])
    expect(p.cards[0]!.topicId).toBe('t1')
  })

  it('Doppel gegen Modul und innerhalb der Antwort', () => {
    const p = prepareImport(
      answer(choice('was ist ein Moos'), choice('Neu?'), choice('Neu?')),
      { kind: 'existing', module: mod },
      { topics: [moose], cards: [stored('Was ist ein Moos?')] },
      NOW,
      ids(),
    )
    expect(p.found).toBe(3)
    expect(p.duplicates).toBe(2)
    expect(p.cards).toHaveLength(1)
  })

  it('gelöschte vorhandene Karte zählt nicht als Doppel', () => {
    const p = prepareImport(answer(choice('A?')), { kind: 'existing', module: mod }, { topics: [moose], cards: [stored('A?', true)] }, NOW, ids())
    expect(p.duplicates).toBe(0)
    expect(p.cards).toHaveLength(1)
  })

  it('gleiche Frage, anderer Typ ist kein Doppel', () => {
    const p = prepareImport(answer(choice('A?'), free('A?')), { kind: 'new', module: newModule('B', NOW) }, { topics: [], cards: [] }, NOW, ids())
    expect(p.duplicates).toBe(0)
    expect(questionKey(choice('A?') as never)).not.toBe(questionKey(free('A?') as never))
  })

  it('ungültige Karte wird gezählt', () => {
    const bad = { ...choice('X?'), difficulty: 7 }
    const p = prepareImport(answer(choice('A?'), bad), { kind: 'new', module: newModule('B', NOW) }, { topics: [], cards: [] }, NOW, ids())
    expect(p.rejected).toBe(1)
    expect(p.found).toBe(1)
  })

  it('kein JSON wirft ParseError', () => {
    expect(() => prepareImport('hallo', { kind: 'new', module: newModule('B', NOW) }, { topics: [], cards: [] }, NOW)).toThrow(ParseError)
  })
})
