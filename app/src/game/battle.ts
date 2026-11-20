import type { Outcome } from '../srs/grading'
import type { Rng } from '../ui/random'

export type Tier = 1 | 2 | 3
export type Hit = { outcome: Outcome; damage: number; tier: Tier; crit: boolean; lucky: boolean; knockedOut: boolean }
export type Battle = {
  total: number
  answered: number
  phase: number
  hp: number
  maxHp: number
  combo: number
  bestCombo: number
  /** Wie oft der Boss in diesem Kampf zu Boden ging; mindestens einmal = besiegt. */
  knockouts: number
  finished: boolean
  defeated: boolean
  last: Hit | null
}

export const HP_PER_QUESTION = 10
const BASE_DAMAGE = 10
const PARTIAL_DAMAGE = 5
const TIER_BONUS: Record<Tier, number> = { 1: 0, 2: 3, 3: 6 }
const CRIT_AFTER_DAYS = 7
const LUCKY_CHANCE = 0.1
const LUCKY_BONUS = 5

const tierOf = (combo: number): Tier => (combo >= 6 ? 3 : combo >= 3 ? 2 : 1)

export function startBattle(total: number): Battle {
  const hp = total * HP_PER_QUESTION
  return { total, answered: 0, phase: 1, hp, maxHp: hp, combo: 0, bestCombo: 0, knockouts: 0, finished: false, defeated: false, last: null }
}

/** Wertet eine gespeicherte Antwort aus. Kein Tempobonus: Zeit spielt keine Rolle. */
export function applyAnswer(b: Battle, a: { outcome: Outcome; elapsedDays: number | null }, rng: Rng): Battle {
  if (b.finished) return b
  let combo = b.combo
  let damage = 0
  let crit = false
  let lucky = false
  if (a.outcome === 'right') {
    combo += 1
    damage = BASE_DAMAGE + TIER_BONUS[tierOf(combo)]
    crit = a.elapsedDays !== null && a.elapsedDays >= CRIT_AFTER_DAYS
    if (crit) damage *= 2
    lucky = rng() < LUCKY_CHANCE
    if (lucky) damage += LUCKY_BONUS
  } else if (a.outcome === 'partial') {
    damage = PARTIAL_DAMAGE
  } else {
    combo = 0
  }
  const tier = tierOf(combo)
  const answered = b.answered + 1
  let hp = Math.max(0, b.hp - damage)
  let maxHp = b.maxHp
  let phase = b.phase
  const knockedOut = hp === 0
  const remaining = b.total - answered
  const finished = remaining <= 0
  const knockouts = b.knockouts + (knockedOut ? 1 : 0)
  if (knockedOut && remaining > 0) {
    phase += 1
    hp = maxHp = remaining * HP_PER_QUESTION
  }
  // Besiegt, sobald er einmal am Boden war: eine verpatzte letzte Frage macht den Sieg nicht zunichte.
  const defeated = finished && knockouts > 0
  return {
    ...b,
    answered,
    phase,
    hp,
    maxHp,
    combo,
    bestCombo: Math.max(b.bestCombo, combo),
    knockouts,
    finished,
    defeated,
    last: { outcome: a.outcome, damage, tier, crit, lucky, knockedOut },
  }
}

export function endBattle(b: Battle): Battle {
  return b.finished ? b : { ...b, finished: true, defeated: b.knockouts > 0 }
}

export function hpPercent(b: Battle): number {
  return b.maxHp === 0 ? 0 : Math.round((b.hp / b.maxHp) * 100)
}
