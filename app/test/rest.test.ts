import { describe, expect, it } from 'vitest'
import { isRested, minutesUntilRested } from '../src/game/rest'

const T = new Date('2026-03-10T10:00:00Z')
const after = (ms: number) => new Date(T.getTime() + ms)

describe('Ausgeruht', () => {
  it('noch nie gekämpft: ausgeruht', () => {
    expect(isRested(null, T)).toBe(true)
    expect(minutesUntilRested(null, T)).toBe(0)
  })

  it('4:59 min nach dem Kampf: noch nicht, 1 min fehlt', () => {
    expect(isRested(T, after(299_000))).toBe(false)
    expect(minutesUntilRested(T, after(299_000))).toBe(1)
    expect(minutesUntilRested(T, after(60_000))).toBe(4)
  })

  it('genau 5 min: ausgeruht', () => {
    expect(isRested(T, after(300_000))).toBe(true)
    expect(minutesUntilRested(T, after(300_000))).toBe(0)
  })
})
