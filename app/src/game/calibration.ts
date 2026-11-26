import type { LogEntry } from '../data/db'

/** Zeitraum der Treffsicherheit je Modul (Tage). */
export const CALIBRATION_DAYS = 30
/** Erst ab so vielen „sicheren“ Antworten wird ein Wert angezeigt. */
export const CALIBRATION_MIN = 10

const DAY_MS = 86_400_000

/** Prozent richtiger Antworten unter „sicher“ je Modul (teilweise zählt nicht als richtig). */
export function calibrationByModule(logs: LogEntry[], cardModule: Map<string, string>, now: Date): Map<string, number> {
  const since = now.getTime() - CALIBRATION_DAYS * DAY_MS
  const tally = new Map<string, { right: number; total: number }>()
  for (const l of logs) {
    if (l.confidence !== 'sure' || Date.parse(l.reviewedAt) < since) continue
    const moduleId = cardModule.get(l.cardId)
    if (!moduleId) continue
    const t = tally.get(moduleId) ?? { right: 0, total: 0 }
    t.total += 1
    if (l.outcome === 'right') t.right += 1
    tally.set(moduleId, t)
  }
  const out = new Map<string, number>()
  for (const [moduleId, t] of tally) if (t.total >= CALIBRATION_MIN) out.set(moduleId, Math.round((t.right / t.total) * 100))
  return out
}
