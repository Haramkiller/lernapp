import { describe, it, expect } from 'vitest'
import type { Card } from '@lernapp/shared'
import { markExamRelevant } from '../src/examRelevance'

const card = (id: string, topicId: string): Card => ({
  id, moduleId: 'm', topicId, type: 'free',
  payload: { question: 'q', modelAnswer: 'a', keyPoints: ['k'] },
  explanation: '', source: null, examRelevant: false, fromExam: false, difficulty: 1,
  createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z', deleted: false,
})

describe('markExamRelevant', () => {
  it('"Moose " matcht Thema "moose"; andere bleiben unverändert', () => {
    const cards = [card('1', 't1'), card('2', 't2')]
    const out = markExamRelevant(cards, [{ id: 't1', name: 'moose' }, { id: 't2', name: 'Farne' }], ['Moose '])
    expect(out[0]!.examRelevant).toBe(true)
    expect(out[0]!.updatedAt).not.toBe('2020-01-01T00:00:00.000Z')
    expect(out[1]).toBe(cards[1])
  })
  it('bereits relevante Karten werden nicht angefasst', () => {
    const c = { ...card('1', 't1'), examRelevant: true }
    expect(markExamRelevant([c], [{ id: 't1', name: 'x' }], ['x'])[0]).toBe(c)
  })
})
