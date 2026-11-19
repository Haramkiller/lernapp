import { describe, expect, it } from 'vitest'
import {
  cardToRow,
  logToRow,
  moduleToRow,
  rowToCard,
  rowToModule,
  rowToState,
  rowToTopic,
  stateToRow,
  topicToRow,
  type Card,
  type Module,
  type Topic,
} from '../src'

const card: Card = {
  id: 'c1',
  moduleId: 'm1',
  topicId: 't1',
  type: 'free',
  payload: { question: 'Q?', modelAnswer: 'A', keyPoints: ['k'] },
  explanation: 'weil',
  source: { file: 'a.pdf', page: 2, quote: 'zitat' },
  examRelevant: true,
  fromExam: false,
  difficulty: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  deleted: false,
}

describe('rows', () => {
  it('Karte: snake_case ohne user_id, Round-Trip', () => {
    const row = cardToRow(card)
    expect(row).toMatchObject({ module_id: 'm1', topic_id: 't1', exam_relevant: true, from_exam: false, updated_at: card.updatedAt })
    expect('user_id' in row).toBe(false)
    expect(rowToCard(row)).toEqual(card)
  })

  it('Modul und Thema: Round-Trip', () => {
    const m: Module = { id: 'm1', name: 'BWL', examDate: '2026-02-01', styleProfile: null, updatedAt: '2026-01-01T00:00:00.000Z' }
    const t: Topic = { id: 't1', moduleId: 'm1', name: 'Kosten', updatedAt: '2026-01-01T00:00:00.000Z' }
    expect(moduleToRow(m)).toEqual({ id: 'm1', name: 'BWL', exam_date: '2026-02-01', style_profile: null, updated_at: m.updatedAt })
    expect(rowToModule(moduleToRow(m))).toEqual(m)
    expect(topicToRow(t)).toEqual({ id: 't1', module_id: 'm1', name: 'Kosten', updated_at: t.updatedAt })
    expect(rowToTopic(topicToRow(t))).toEqual(t)
  })

  it('State: Round-Trip; Log: snake_case mit id', () => {
    const s = { cardId: 'c1', state: { due: 'x', reps: 1 }, updatedAt: '2026-01-01T00:00:00.000Z' }
    expect(stateToRow(s)).toEqual({ card_id: 'c1', state: s.state, updated_at: s.updatedAt })
    expect(rowToState(stateToRow(s))).toEqual(s)
    const log = { id: 'l1', cardId: 'c1', rating: 3 as const, reviewedAt: 'r', studyDay: '2026-01-01', elapsedDays: 2 }
    expect(logToRow(log)).toEqual({ id: 'l1', card_id: 'c1', rating: 3, reviewed_at: 'r', study_day: '2026-01-01', elapsed_days: 2 })
  })
})
