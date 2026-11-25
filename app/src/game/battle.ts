import type { Outcome } from '../srs/grading'
import type { Rng } from '../ui/random'
import type { Life } from './mastery'

export type Tier = 1 | 2 | 3
/** `secured`: die Karte sitzt nach dieser Antwort sicher (ihr Leben fiel auf 0). */
export type Hit = { outcome: Outcome; damage: number; tier: Tier; crit: boolean; lucky: boolean; secured: boolean }
export type Battle = {
  total: number
  answered: number
  /** Exaktes Boss-Leben beim Start und Summe der exakten Schäden; Anzeige = round(start − dealt). */
  start: number
  dealt: number
  /** Exaktes echtes Leben: steigt auch, z. B. wenn eine falsche Antwort eine Karte schwächer macht. */
  real: number
  startHp: number
  /** Angezeigtes Leben: sinkt nur, steigt im Kampf nie. */
  hp: number
  maxHp: number
  combo: number
  bestCombo: number
  /** Karten, die in diesem Kampf auf 0 Leben fielen. */
  secured: number
  finished: boolean
  last: Hit | null
}

const CRIT_AFTER_DAYS = 7
export const LUCKY_CHANCE = 0.1
/** „Ausgeruht“ (Pause am Lagerfeuer): mehr Glückstreffer für den ganzen Kampf. */
export const RESTED_LUCKY_CHANCE = 0.25

const tierOf = (combo: number): Tier => (combo >= 6 ? 3 : combo >= 3 ? 2 : 1)

export function startBattle(total: number, life: Life): Battle {
  const hp = Math.round(life.hp)
  return {
    total,
    answered: 0,
    start: life.hp,
    dealt: 0,
    real: life.hp,
    startHp: hp,
    hp,
    maxHp: life.max,
    combo: 0,
    bestCombo: 0,
    secured: 0,
    finished: false,
    last: null,
  }
}

/**
 * Wertet eine gespeicherte Antwort aus. `before`/`after` = Leben der Karte vor und nach der Wiederholung.
 * Schaden ist ehrlich (nur der Lernfortschritt zählt); Combo, Krit und Glück sind reine Effekte.
 */
export function applyAnswer(
  b: Battle,
  a: { outcome: Outcome; elapsedDays: number | null; before: number; after: number },
  rng: Rng,
  luckyChance: number = LUCKY_CHANCE,
): Battle {
  if (b.finished) return b
  let combo = b.combo
  let crit = false
  let lucky = false
  if (a.outcome === 'right') {
    combo += 1
    crit = a.elapsedDays !== null && a.elapsedDays >= CRIT_AFTER_DAYS
    lucky = rng() < luckyChance
  } else if (a.outcome === 'wrong') {
    combo = 0
  }
  // Falsch macht nie Schaden (vom Nutzer so gewählt), auch wenn eine neue Karte dabei ein wenig gelernt wurde.
  const dealt = b.dealt + (a.outcome === 'wrong' ? 0 : Math.max(0, a.before - a.after))
  // Die Summe wird gerundet, nicht jeder Schaden: so gehen die angezeigten Zahlen auf und erreichen 0.
  const hp = Math.max(0, Math.round(b.start - dealt))
  const secured = a.before > 0 && a.after === 0
  const answered = b.answered + 1
  return {
    ...b,
    answered,
    dealt,
    real: b.real + a.after - a.before,
    hp,
    combo,
    bestCombo: Math.max(b.bestCombo, combo),
    secured: b.secured + (secured ? 1 : 0),
    finished: answered >= b.total,
    last: { outcome: a.outcome, damage: b.hp - hp, tier: tierOf(combo), crit, lucky, secured },
  }
}

export function endBattle(b: Battle): Battle {
  return b.finished ? b : { ...b, finished: true }
}

export function hpPercent(b: Battle): number {
  return b.maxHp === 0 ? 0 : Math.round((b.hp / b.maxHp) * 100)
}

/** Endgültig besiegt: das echte Leben ist (gerundet) 0, alle Karten sitzen sicher. */
export function defeated(b: Battle): boolean {
  return Math.round(b.real) === 0
}
