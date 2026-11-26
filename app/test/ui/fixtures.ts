import type { Card } from '@lernapp/shared'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** Auswahlfrage beantworten: Option antippen, dann „Prüfen“. */
export async function pick(option: HTMLElement): Promise<void> {
  await userEvent.click(option)
  await userEvent.click(screen.getByRole('button', { name: 'Sicher' }))
}

type Base = Pick<
  Card,
  'id' | 'moduleId' | 'topicId' | 'createdAt' | 'updatedAt' | 'deleted' | 'explanation' | 'source' | 'examRelevant' | 'fromExam' | 'difficulty'
>

export const base = (id: string, over: Partial<Base> = {}): Base => ({
  id,
  moduleId: 'm1',
  topicId: 't1',
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  deleted: false,
  explanation: 'Weil es so ist.',
  source: null,
  examRelevant: false,
  fromExam: false,
  difficulty: 1,
  ...over,
})

export const choiceCard = (id: string, over: Partial<Base> = {}): Extract<Card, { type: 'choice' }> => ({
  ...base(id, over),
  type: 'choice',
  payload: {
    question: `Frage ${id}?`,
    options: [
      { text: 'Falsch A', correct: false, why: 'A ist falsch, weil A.' },
      { text: 'Richtig B', correct: true, why: 'B stimmt, weil B.' },
      { text: 'Falsch C', correct: false, why: 'C ist falsch, weil C.' },
      { text: 'Falsch D', correct: false, why: 'D ist falsch, weil D.' },
    ],
  },
})

export const clozeCard = (id: string): Extract<Card, { type: 'cloze' }> => ({
  ...base(id),
  type: 'cloze',
  payload: { text: 'Die {{1}} sind das Kraftwerk der Zelle.', gaps: [{ answers: ['Mitochondrien'] }] },
})

export const matchingCard = (id: string): Extract<Card, { type: 'matching' }> => ({
  ...base(id),
  type: 'matching',
  payload: {
    prompt: 'Ordne zu',
    pairs: [
      { left: 'Herz', right: 'Pumpe' },
      { left: 'Lunge', right: 'Gasaustausch' },
      { left: 'Niere', right: 'Filter' },
    ],
  },
})

export const orderCard = (id: string): Extract<Card, { type: 'order' }> => ({
  ...base(id),
  type: 'order',
  payload: { prompt: 'Reihenfolge', steps: ['Erst', 'Dann', 'Zuletzt'] },
})

export const freeCard = (id: string): Extract<Card, { type: 'free' }> => ({
  ...base(id),
  type: 'free',
  payload: { question: 'Erkläre Osmose', modelAnswer: 'Wasser wandert durch die Membran.', keyPoints: ['Membran', 'Konzentrationsgefälle'] },
})
