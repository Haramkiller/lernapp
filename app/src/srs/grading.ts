import { Rating, type Grade } from 'ts-fsrs'

export type Outcome = 'wrong' | 'partial' | 'right'
/** Einschätzung vor dem Aufdecken (Teil 5b). */
export type Confidence = 'sure' | 'unsure'

/** Easy wird bewusst nicht vergeben. Richtig, aber unsicher → Schwer (kommt früher wieder). */
export function toRating(outcome: Outcome, confidence?: Confidence | null): Grade {
  if (outcome === 'right' && confidence === 'unsure') return Rating.Hard
  switch (outcome) {
    case 'wrong':
      return Rating.Again
    case 'partial':
      return Rating.Hard
    case 'right':
      return Rating.Good
  }
}
