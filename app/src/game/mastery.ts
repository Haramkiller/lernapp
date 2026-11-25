import { State } from 'ts-fsrs'
import { CardDraftSchema, studyDay, type Card, type Topic } from '@lernapp/shared'
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

/** Karte lässt sich abfragen (gleiche Prüfung wie vor dem Kampf); ungültige Karten zählen nirgends. */
export function isPlayable(card: Card): boolean {
  return CardDraftSchema.safeParse({ ...card, topic: 'x' }).success
}

/** Leben, das eine Karte dem Boss ihres Moduls höchstens gibt (neue Karte). */
export const CARD_LIFE = 10

/**
 * Leben einer Karte: 10 × (1 − Stabilitätsanteil × Abrufanteil), beide bei 1 gedeckelt.
 * Neu = 10, sitzt sicher (isSecure) = 0; Vergessen lässt den Wert wieder steigen.
 */
export function cardLife(s: SrsState | undefined, now: Date, retention: number): number {
  if (!isLearned(s)) return CARD_LIFE
  const stable = Math.min(1, s.stability / SECURE_STABILITY_DAYS)
  const kept = Math.min(1, recall(s, now) / retention)
  return CARD_LIFE * (1 - stable * kept)
}

/** Darunter gilt Leben als 0 (nur Rechenrauschen; eine sichere Karte hat exakt 0). */
export const LIFE_EPSILON = 1e-6

/** Angezeigtes Leben: 0 nur, wenn wirklich alles sicher sitzt; sonst mindestens 1. */
export function shownLife(hp: number): number {
  return hp < LIFE_EPSILON ? 0 : Math.max(1, Math.round(hp))
}

/** `hp` ungerundet; `max` = 10 je Karte. */
export type Life = { hp: number; max: number }

/** Boss-Leben über alle nicht gelöschten, abfragbaren Karten. */
export function bossLife(cards: Card[], states: Map<string, SrsState>, now: Date, retention: number): Life {
  const live = cards.filter((c) => !c.deleted && isPlayable(c))
  return { hp: live.reduce((n, c) => n + cardLife(states.get(c.id), now, retention), 0), max: live.length * CARD_LIFE }
}

/** Anteil (0–100) am Höchstwert; null ohne Karten. */
export function lifePercent(life: Life): number | null {
  if (life.max === 0) return null
  return life.hp < LIFE_EPSILON ? 0 : Math.max(1, Math.round((life.hp / life.max) * 100))
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
