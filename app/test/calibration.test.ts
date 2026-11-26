import { describe, expect, it } from 'vitest'
import { calibrationByModule } from '../src/game/calibration'
import type { LogEntry } from '../src/data/db'

const NOW = new Date('2026-03-10T10:00:00.000Z')
const DAY = 86_400_000
let n = 0
const log = (over: Partial<LogEntry>): LogEntry => ({
  id: `l${++n}`, cardId: 'a', rating: 3, reviewedAt: new Date(NOW.getTime() - DAY).toISOString(), studyDay: 'x', elapsedDays: 0,
  confidence: 'sure', outcome: 'right', ...over,
})
const cardModule = new Map([['a', 'm1'], ['b', 'm2']])
const many = (k: number, over: Partial<LogEntry>) => Array.from({ length: k }, () => log(over))

describe('calibrationByModule', () => {
  it('Prozent richtiger sicherer Antworten; teilweise zählt nicht als richtig', () => {
    const logs = [...many(8, {}), log({ outcome: 'partial' }), log({ outcome: 'wrong' }), ...many(5, { confidence: 'unsure', outcome: 'wrong' })]
    expect(calibrationByModule(logs, cardModule, NOW)).toEqual(new Map([['m1', 80]]))
  })

  it('unter 10 sicheren Antworten: nichts', () => {
    expect(calibrationByModule(many(9, {}), cardModule, NOW).size).toBe(0)
  })

  it('älter als 30 Tage und unbekannte Karten werden ignoriert', () => {
    const logs = [
      ...many(9, {}),
      log({ reviewedAt: new Date(NOW.getTime() - 31 * DAY).toISOString() }),
      log({ cardId: 'weg' }),
    ]
    expect(calibrationByModule(logs, cardModule, NOW).size).toBe(0)
  })
})
