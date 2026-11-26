import { studyDay } from '@lernapp/shared'
import { MAX_SOIL, SOIL_COST, fertilizer, researchedByModule, researchedByState, type Find, type FindStatus } from '../game/finds'
import { isPlayable, isSecure } from '../game/mastery'
import { GARDEN_SLOTS } from '../game/scenes'
import { db, type GameItem } from './db'
import { putGameItem } from './game'
import { loadSettings } from './settings'

/**
 * Funde in der Spieltabelle. Ein Fund (`find:`) wird einmal geschrieben und nie geändert; geöffnet,
 * erforscht und gemeldet sind eigene Zeilen, damit „neueste Änderung gewinnt“ keinen Status überschreibt.
 */
const FIND = 'find:'
const OPENED = 'opened:'
const RESEARCHED = 'researched:'
const TOLD = 'told:'
const PLACE = 'place:'
const SOIL = 'soil:'

const rows = (prefix: string) => db.game.where('id').startsWith(prefix).toArray()
const ids = async (prefix: string) => new Map((await rows(prefix)).map((r) => [r.id.slice(prefix.length), r.data]))

export async function saveFind(find: Find): Promise<void> {
  const { id, ...data } = find
  await putGameItem({ id: FIND + id, data, updatedAt: find.foundAt })
}

export async function loadFinds(): Promise<FindStatus[]> {
  const [finds, opened, researched, told] = await Promise.all([rows(FIND), ids(OPENED), ids(RESEARCHED), ids(TOLD)])
  return finds
    .map(({ id, data }): FindStatus => {
      const fid = id.slice(FIND.length)
      const at = researched.get(fid)?.at
      return { ...(data as Omit<Find, 'id'>), id: fid, opened: opened.has(fid), researchedAt: typeof at === 'string' ? at : null, told: told.has(fid) }
    })
    .sort((a, b) => (a.foundAt !== b.foundAt ? (a.foundAt < b.foundAt ? -1 : 1) : a.id < b.id ? -1 : 1))
}

async function mark(prefix: string, list: string[], now: Date): Promise<void> {
  const at = now.toISOString()
  for (const id of list) await putGameItem({ id: prefix + id, data: { at }, updatedAt: at })
}

export const markOpened = (list: string[], now: Date) => mark(OPENED, list, now)
export const markTold = (list: string[], now: Date) => mark(TOLD, list, now)

/** Richtige Antwort auf `cardId`: erforscht ihre Funde von einem früheren Lerntag. */
export async function researchByAnswer(cardId: string, now: Date): Promise<number> {
  const today = studyDay(now)
  const due = (await loadFinds()).filter((f) => f.researchedAt === null && f.cardId === cardId && f.foundDay < today)
  await mark(RESEARCHED, due.map((f) => f.id), now)
  return due.length
}

/** Prüft unerforschte Funde am Kartenzustand bzw. (gelöschte Karte) an sicheren Themen des Moduls. */
export async function checkResearch(now: Date): Promise<number> {
  const open = (await loadFinds()).filter((f) => f.researchedAt === null)
  if (open.length === 0) return 0
  const [cards, states, settings] = await Promise.all([db.cards.toArray(), db.states.toArray(), loadSettings()])
  const stateOf = new Map(states.map((s) => [s.cardId, s.state]))
  const cardOf = new Map(cards.map((c) => [c.id, c]))
  const byTopic = new Map<string, { moduleId: string; secure: boolean }>()
  for (const c of cards) {
    if (c.deleted || !isPlayable(c)) continue
    const secure = isSecure(stateOf.get(c.id), now, settings.retention)
    const t = byTopic.get(c.topicId)
    byTopic.set(c.topicId, { moduleId: c.moduleId, secure: (t?.secure ?? true) && secure })
  }
  const moduleSecure = (moduleId: string) => [...byTopic.values()].some((t) => t.moduleId === moduleId && t.secure)
  const done = open.filter((f) => {
    const card = cardOf.get(f.cardId)
    return card && !card.deleted ? researchedByState(f, stateOf.get(f.cardId)) : researchedByModule(f, moduleSecure(f.moduleId), now)
  })
  await mark(RESEARCHED, done.map((f) => f.id), now)
  return done.length
}

/* ---------------- Gestalten ---------------- */

/** slotId → itemId; moduleId → Erdstufe. */
export type Design = { placements: Map<string, string>; soil: Map<string, number> }

export async function loadDesign(): Promise<Design> {
  // Nur Plätze, die es (noch) gibt; ein Stück auf einem entfernten Platz ist wieder frei.
  const slots = new Set(GARDEN_SLOTS.map((s) => PLACE + s.id))
  const placed = (await rows(PLACE)).filter(
    (r): r is GameItem & { data: { item: string } } => typeof r.data.item === 'string' && slots.has(r.id),
  )
  // Nach einem Sync kann ein Stück auf zwei Plätzen stehen: der zuletzt geänderte gewinnt.
  const newest = new Map<string, GameItem>()
  for (const r of placed) {
    const item = r.data.item as string
    const other = newest.get(item)
    if (!other || r.updatedAt > other.updatedAt) newest.set(item, r)
  }
  const placements = new Map([...newest.values()].map((r) => [r.id.slice(PLACE.length), r.data.item as string]))
  const soil = new Map<string, number>()
  for (const r of await rows(SOIL)) if (typeof r.data.level === 'number') soil.set(r.id.slice(SOIL.length), r.data.level)
  return { placements, soil }
}

/**
 * Stellt ein Stück auf (oder räumt mit `null` ab); ein Stück steht höchstens an einem Platz.
 * Liest die rohen Zeilen: nach einem Sync-Konflikt können ältere Doppel-Einträge des neuen oder des
 * abgeräumten Stücks liegen, die sonst wieder auftauchen würden. Sie werden mit geleert.
 */
export async function placeItem(slotId: string, itemId: string | null, design: Design, now: Date): Promise<void> {
  const at = now.toISOString()
  const affected = new Set([itemId, design.placements.get(slotId)].filter((i): i is string => typeof i === 'string'))
  for (const r of await rows(PLACE))
    if (r.id !== PLACE + slotId && typeof r.data.item === 'string' && affected.has(r.data.item))
      await putGameItem({ id: r.id, data: { item: null }, updatedAt: at })
  await putGameItem({ id: PLACE + slotId, data: { item: itemId }, updatedAt: at })
}

export async function raiseSoil(moduleId: string, now: Date): Promise<number> {
  const [finds, design] = await Promise.all([loadFinds(), loadDesign()])
  const level = design.soil.get(moduleId) ?? 0
  if (level >= MAX_SOIL) throw new Error('Beste Erde erreicht')
  if (fertilizer(finds, design.soil.values()) < SOIL_COST[level]!) throw new Error('Nicht genug Dünger')
  const at = now.toISOString()
  await putGameItem({ id: SOIL + moduleId, data: { level: level + 1 }, updatedAt: at })
  return level + 1
}
