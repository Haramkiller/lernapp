import { describe, it, expect } from 'vitest'
import { studyDay } from '../src/day'

describe('studyDay', () => {
  it('03:59 gehört zum Vortag', () => expect(studyDay(new Date(2026, 10, 20, 3, 59))).toBe('2026-11-19'))
  it('04:00 ist neuer Tag', () => expect(studyDay(new Date(2026, 10, 20, 4, 0))).toBe('2026-11-20'))
  it('Mittag bleibt am selben Tag', () => expect(studyDay(new Date(2026, 10, 20, 12, 0))).toBe('2026-11-20'))
  it('Mitternacht am Monatsersten gehört zum letzten Tag des Vormonats', () =>
    expect(studyDay(new Date(2026, 11, 1, 0, 30))).toBe('2026-11-30'))
  it('Mitternacht am Jahresersten gehört zum Vorjahr', () =>
    expect(studyDay(new Date(2027, 0, 1, 2, 0))).toBe('2026-12-31'))
})
