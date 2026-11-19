import { describe, expect, it } from 'vitest'
import type { Card } from '@lernapp/shared'
import { newSrsState, type SrsState } from '../src/srs/scheduler'
import { buildQueue, newDoneKey } from '../src/session/queue'

const now = new Date('2026-11-19T10:00:00')
const settings = { retention: 0.9, newPerDay: 3 }

function card(id: string, o: Partial<Card> = {}): Card {
  return {
    id,
    moduleId: 'm1',
    topicId: 't1',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    deleted: false,
    examRelevant: false,
    fromExam: false,
    type: 'free',
    payload: { question: 'q', answer: 'a' },
    explanation: '',
    source: null,
    difficulty: 3,
    ...o,
  } as unknown as Card
}

/** Fälliger, bereits gelernter Zustand; kleineres `daysAgo`-Verhältnis → höherer recall. */
function dueState(stability: number, daysSinceReview: number): SrsState {
  const last = new Date(now.getTime() - daysSinceReview * 86400000)
  return {
    ...newSrsState(last),
    state: 2,
    stability,
    difficulty: 5,
    reps: 3,
    last_review: last.toISOString(),
    due: new Date(now.getTime() - 3600000).toISOString(),
  }
}

function futureState(): SrsState {
  return { ...dueState(10, 1), due: new Date(now.getTime() + 5 * 86400000).toISOString() }
}

const run = (cards: Card[], states: Map<string, SrsState>, extra = {}) =>
  buildQueue({ cards, states, newDoneToday: 0, now, settings, ...extra })

describe('Tages-Warteschlange', () => {
  it('fällige vor neuen, niedrigster recall zuerst', () => {
    const cards = [card('new1', { topicId: 'a' }), card('d1', { topicId: 'b' }), card('d2', { topicId: 'c' })]
    const states = new Map([
      ['d1', dueState(5, 5)],
      ['d2', dueState(5, 50)], // länger her → niedrigerer recall
    ])
    expect(run(cards, states)).toEqual(['d2', 'd1', 'new1'])
  })

  it('nicht fällige Karten sind ausgeschlossen', () => {
    const cards = [card('f'), card('n', { topicId: 'x' })]
    expect(run(cards, new Map([['f', futureState()]]))).toEqual(['n'])
  })

  it('neue Karten begrenzt auf newPerDay - newDoneToday', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map((id, i) => card(id, { topicId: 't' + i }))
    expect(run(cards, new Map())).toHaveLength(3)
    expect(run(cards, new Map(), { newDoneToday: 2 })).toHaveLength(1)
    expect(run(cards, new Map(), { newDoneToday: 7 })).toHaveLength(0)
  })

  it('klausurrelevante neue Karten zuerst, sonst nach createdAt', () => {
    const cards = [
      card('late', { topicId: 'a', createdAt: '2026-11-05T00:00:00.000Z' }),
      card('early', { topicId: 'b', createdAt: '2026-11-01T00:00:00.000Z' }),
      card('exam', { topicId: 'c', createdAt: '2026-11-09T00:00:00.000Z', examRelevant: true }),
    ]
    expect(run(cards, new Map())).toEqual(['exam', 'early', 'late'])
  })

  it('verzahnt Themen A,A,B,B → A,B,A,B', () => {
    const cards = [
      card('a1', { topicId: 'A', createdAt: '2026-11-01T00:00:00.000Z' }),
      card('a2', { topicId: 'A', createdAt: '2026-11-02T00:00:00.000Z' }),
      card('b1', { topicId: 'B', createdAt: '2026-11-03T00:00:00.000Z' }),
      card('b2', { topicId: 'B', createdAt: '2026-11-04T00:00:00.000Z' }),
    ]
    const q = buildQueue({ cards, states: new Map(), newDoneToday: 0, now, settings: { retention: 0.9, newPerDay: 10 } })
    expect(q).toEqual(['a1', 'b1', 'a2', 'b2'])
  })

  it('bleibt beim gleichen Thema, wenn es sich nicht vermeiden lässt', () => {
    const cards = [card('a1', { topicId: 'A' }), card('a2', { topicId: 'A' })]
    expect(run(cards, new Map())).toEqual(['a1', 'a2'])
  })

  it('moduleId filtert auf ein Modul', () => {
    const cards = [card('x', { moduleId: 'm1' }), card('y', { moduleId: 'm2', topicId: 'z' })]
    expect(run(cards, new Map(), { moduleId: 'm2' })).toEqual(['y'])
  })

  it('gelöschte Karten erscheinen nie', () => {
    const cards = [card('gone', { deleted: true }), card('d', { topicId: 'x', deleted: true }), card('ok', { topicId: 'y' })]
    const states = new Map([['d', dueState(5, 20)]])
    expect(run(cards, states)).toEqual(['ok'])
  })

  it('Tageszähler: newDoneToday vom Vortag (03:59) zählt nicht', () => {
    const before = new Date('2026-11-20T03:59:00')
    const after = new Date('2026-11-20T04:00:00')
    expect(newDoneKey(before)).toBe('newDone:2026-11-19')
    expect(newDoneKey(after)).toBe('newDone:2026-11-20')
    const cards = ['a', 'b', 'c', 'd'].map((id, i) => card(id, { topicId: 't' + i }))
    const base = { cards, states: new Map<string, SrsState>(), now: after, settings }
    expect(buildQueue({ ...base, newDoneToday: settings.newPerDay })).toEqual([])
    expect(buildQueue({ ...base, newDoneToday: 0 })).toHaveLength(3)
  })
})
