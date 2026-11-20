import { State } from 'ts-fsrs'
import { studyDay, type Card, type Topic } from '@lernapp/shared'
import { recall, type SrsState } from '../srs/scheduler'
import { buildQueue, type Settings } from '../session/queue'

/** Ab dieser Stabilität (Tage) gilt eine Karte als dauerhaft verankert. */
export const SECURE_STABILITY_DAYS = 7

/** Mindestens einmal gelernt (State vorhanden und nicht mehr „neu“). */
export function isLearned(s: SrsState | undefined): s is SrsState {
  return s !== undefined && s.state !== State.New
}

/** Sitzt sicher: gelernt, Abruf ≥ Zielwert und Stabilität ≥ SECURE_STABILITY_DAYS. */
export function isSecure(s: SrsState | undefined, now: Date, retention: number): boolean {
  return isLearned(s) && s.stability >= SECURE_STABILITY_DAYS && recall(s, now) >= retention
}

export type TopicStatus = { topic: Topic; total: number; due: number; fresh: number; secure: boolean }

/** `cards` sind die Karten des Themas, `queue` die heutige Lernliste (IDs). */
export function topicStatus(
  topic: Topic,
  cards: Card[],
  states: Map<string, SrsState>,
  queue: Set<string>,
  now: Date,
  retention: number,
): TopicStatus {
  const live = cards.filter((c) => !c.deleted)
  const queued = live.filter((c) => queue.has(c.id))
  return {
    topic,
    total: live.length,
    due: queued.filter((c) => states.has(c.id)).length,
    fresh: queued.filter((c) => !states.has(c.id)).length,
    secure: live.length > 0 && live.every((c) => isSecure(states.get(c.id), now, retention)),
  }
}

/** Anteil (0–100) der gelernten Karten, die gerade nicht sicher sitzen; null ohne gelernte Karte. */
export function moduleThreat(cards: Card[], states: Map<string, SrsState>, now: Date, retention: number): number | null {
  const learned = cards.filter((c) => !c.deleted && isLearned(states.get(c.id)))
  if (learned.length === 0) return null
  const shaky = learned.filter((c) => !isSecure(states.get(c.id), now, retention)).length
  return Math.round((shaky / learned.length) * 100)
}

export type Quest = { done: number; total: number }

/** Heute erledigt (heute wiederholt und nicht mehr in der Liste) gegen erledigt + noch offen. */
export function dailyQuest(input: {
  cards: Card[]
  states: Map<string, SrsState>
  newDoneToday: number
  now: Date
  settings: Settings
}): Quest {
  const queue = buildQueue(input)
  const open = new Set(queue)
  const today = studyDay(input.now)
  const done = input.cards.filter((c) => {
    const last = input.states.get(c.id)?.last_review
    return !c.deleted && !open.has(c.id) && last !== undefined && studyDay(new Date(last)) === today
  }).length
  return { done, total: done + queue.length }
}
