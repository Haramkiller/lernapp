import { describe, expect, it } from 'vitest'
import { Rating } from 'ts-fsrs'
import { toRating } from '../src/srs/grading'

describe('toRating mit Einschätzung', () => {
  it('richtig + unsicher → Schwer, sonst wie bisher', () => {
    expect(toRating('right', 'unsure')).toBe(Rating.Hard)
    expect(toRating('right', 'sure')).toBe(Rating.Good)
    expect(toRating('right')).toBe(Rating.Good)
    expect(toRating('right', null)).toBe(Rating.Good)
    expect(toRating('wrong', 'sure')).toBe(Rating.Again)
    expect(toRating('partial', 'sure')).toBe(Rating.Hard)
  })
})
