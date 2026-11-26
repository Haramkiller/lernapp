import { createEmptyCard, fsrs, State, type Card, type Grade } from 'ts-fsrs'
import { studyDay } from '@lernapp/shared'

/** Serialisierbare ts-fsrs-Karte: Datumsfelder als ISO-String. */
export type SrsState = Omit<Card, 'due' | 'last_review'> & {
  due: string
  last_review?: string
}

export type ReviewLog = {
  cardId: string
  rating: 1 | 2 | 3 | 4
  reviewedAt: string
  studyDay: string
  elapsedDays: number
  /** Einschätzung vor dem Aufdecken; fehlt bei freien Antworten und alten Einträgen. */
  confidence?: 'sure' | 'unsure'
  /** Ergebnis der Antwort, nur zusammen mit confidence (die Bewertung allein unterscheidet „richtig + unsicher“ nicht von „teilweise“). */
  outcome?: 'right' | 'partial' | 'wrong'
}

// Bewusst die Legacy-API von ts-fsrs 6 (fsrs/createEmptyCard/next/retrievability):
// Die nicht-deprecatete API (DefaultScheduler) ist asynchron (Promise, laedt das Modell
// lazy), nutzt ein anderes Kartenformat (dueAt/cardId) und standardmaessig FSRS-7. Das
// wuerde die synchrone oeffentliche Schnittstelle und das persistierte SrsState-Format aendern.
export const DEFAULT_RETENTION = 0.9
const DAY_MS = 24 * 60 * 60 * 1000

function toCard(state: SrsState): Card {
  const { due, last_review, ...rest } = state
  const card: Card = { ...rest, due: new Date(due) }
  if (last_review !== undefined) card.last_review = new Date(last_review)
  return card
}

function toState(card: Card): SrsState {
  const { due, last_review, ...rest } = card
  const state: SrsState = { ...rest, due: due.toISOString() }
  if (last_review !== undefined) state.last_review = last_review.toISOString()
  return state
}

export function newSrsState(now: Date): SrsState {
  return toState(createEmptyCard(now))
}

export type ReviewOptions = {
  /** Pflicht: landet im ReviewLog (Sync nutzt die ID); die Planung selbst braucht sie nicht. */
  cardId: string
  retention?: number
}

export function review(
  state: SrsState,
  rating: Grade,
  now: Date,
  { cardId, retention = DEFAULT_RETENTION }: ReviewOptions,
): { state: SrsState; log: ReviewLog } {
  const scheduler = fsrs({ request_retention: retention })
  const elapsedDays = state.last_review
    ? Math.max(0, Math.floor((now.getTime() - new Date(state.last_review).getTime()) / DAY_MS))
    : 0
  const { card } = scheduler.next(toCard(state), now, rating)
  return {
    state: toState(card),
    log: {
      cardId,
      rating: rating as 1 | 2 | 3 | 4,
      reviewedAt: now.toISOString(),
      studyDay: studyDay(now),
      elapsedDays,
    },
  }
}

export function isDue(state: SrsState, now: Date): boolean {
  return new Date(state.due).getTime() <= now.getTime()
}

/** Abrufwahrscheinlichkeit 0–1; neue Karte → 0. */
export function recall(state: SrsState, now: Date): number {
  if (state.state === State.New) return 0
  return fsrs().retrievability(toCard(state), now)
}
