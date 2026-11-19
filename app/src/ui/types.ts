import type { Card } from '@lernapp/shared'
import type { Outcome } from '../srs/grading'
import type { Rng } from './random'

export type CardOf<T extends Card['type']> = Extract<Card, { type: T }>

/** Was die Fragekomponente an Details meldet (Indizes beziehen sich immer auf die Originalreihenfolge). */
export type Answer =
  | { kind: 'choice'; index: number }
  | { kind: 'cloze'; inputs: string[]; perGap: boolean[] }
  | { kind: 'matching'; mapping: number[] }
  | { kind: 'order'; order: number[] }
  | { kind: 'free' }

export type QuestionProps<T extends Card['type']> = {
  card: CardOf<T>
  onAnswer: (outcome: Outcome, answer: Answer) => void
}
export type ShuffledQuestionProps<T extends Card['type']> = QuestionProps<T> & { rng: Rng }
