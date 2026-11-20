/** Pause zwischen zwei Kämpfen, ab der man „Ausgeruht“ ist. */
export const REST_MINUTES = 5
const REST_MS = REST_MINUTES * 60 * 1000

/** Ausgeruht, wenn noch nie gekämpft wurde oder der letzte Kampf ≥ 5 min zurückliegt (auch außerhalb der App). */
export function isRested(lastBattleAt: Date | null, now: Date): boolean {
  return minutesUntilRested(lastBattleAt, now) === 0
}

/** Ganze Minuten (aufgerundet) bis „Ausgeruht“; 0, wenn schon ausgeruht. */
export function minutesUntilRested(lastBattleAt: Date | null, now: Date): number {
  if (!lastBattleAt) return 0
  const left = lastBattleAt.getTime() + REST_MS - now.getTime()
  return left <= 0 ? 0 : Math.ceil(left / 60_000)
}
