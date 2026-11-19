import { describe, expect, it } from 'vitest'
import { Rating } from 'ts-fsrs'
import { studyDay } from '@lernapp/shared'
import { isDue, newSrsState, recall, review } from '../src/srs/scheduler'
import { toRating } from '../src/srs/grading'

const DAY = 24 * 60 * 60 * 1000
const t0 = new Date('2026-03-10T10:00:00')

describe('FSRS-Planung', () => {
  it('neue Karte ist sofort fällig', () => {
    expect(isDue(newSrsState(t0), t0)).toBe(true)
  })

  it('Good verschiebt Fälligkeit in die Zukunft', () => {
    const { state } = review(newSrsState(t0), Rating.Good, t0)
    expect(new Date(state.due).getTime()).toBeGreaterThan(t0.getTime())
    expect(isDue(state, t0)).toBe(false)
  })

  it('Again nach Good macht Intervall kürzer als zweites Good', () => {
    const s1 = review(newSrsState(t0), Rating.Good, t0).state
    const t1 = new Date(new Date(s1.due).getTime())
    const again = review(s1, Rating.Again, t1).state
    const good = review(s1, Rating.Good, t1).state
    expect(new Date(again.due).getTime() - t1.getTime()).toBeLessThan(
      new Date(good.due).getTime() - t1.getTime(),
    )
  })

  it('recall sinkt mit der Zeit', () => {
    const { state } = review(newSrsState(t0), Rating.Good, t0)
    const r1 = recall(state, new Date(t0.getTime() + DAY))
    const r30 = recall(state, new Date(t0.getTime() + 30 * DAY))
    expect(r1).toBeGreaterThan(r30)
    expect(r1).toBeLessThanOrEqual(1)
    expect(r30).toBeGreaterThanOrEqual(0)
  })

  it('recall einer neuen Karte ist 0', () => {
    expect(recall(newSrsState(t0), t0)).toBe(0)
  })

  it('State überlebt JSON round-trip', () => {
    const s = review(newSrsState(t0), Rating.Good, t0).state
    const restored = JSON.parse(JSON.stringify(s))
    const t1 = new Date(t0.getTime() + 2 * DAY)
    const { state } = review(restored, Rating.Good, t1)
    expect(typeof state.due).toBe('string')
    expect(new Date(state.due).getTime()).toBeGreaterThan(t1.getTime())
    expect(typeof state.last_review).toBe('string')
  })

  it('ReviewLog: studyDay (04:00-Grenze) und elapsedDays', () => {
    const night = new Date('2026-03-10T02:00:00')
    const first = review(newSrsState(night), Rating.Good, night, 0.9, 'c1')
    expect(first.log.cardId).toBe('c1')
    expect(first.log.rating).toBe(3)
    expect(first.log.reviewedAt).toBe(night.toISOString())
    expect(first.log.studyDay).toBe(studyDay(night))
    expect(first.log.studyDay).toBe('2026-03-09')
    expect(first.log.elapsedDays).toBe(0)
    const later = new Date(night.getTime() + 3 * DAY)
    const second = review(first.state, Rating.Good, later, 0.9, 'c1')
    expect(second.log.elapsedDays).toBe(3)
  })

  it('höhere Retention ergibt kürzeres Intervall', () => {
    const lo = review(newSrsState(t0), Rating.Good, t0, 0.8).state
    const hi = review(newSrsState(t0), Rating.Good, t0, 0.97).state
    expect(new Date(hi.due).getTime()).toBeLessThanOrEqual(new Date(lo.due).getTime())
  })
})

describe('Bewertung', () => {
  it('toRating mappt wrong/partial/right auf 1/2/3', () => {
    expect(toRating('wrong')).toBe(1)
    expect(toRating('partial')).toBe(2)
    expect(toRating('right')).toBe(3)
  })
})
