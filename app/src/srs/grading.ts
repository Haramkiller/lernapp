import { Rating, type Grade } from 'ts-fsrs'

export type Outcome = 'wrong' | 'partial' | 'right'

/** Easy wird in Stufe 1a bewusst nicht vergeben. */
export function toRating(outcome: Outcome): Grade {
  switch (outcome) {
    case 'wrong':
      return Rating.Again
    case 'partial':
      return Rating.Hard
    case 'right':
      return Rating.Good
  }
}
