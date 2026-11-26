import { State } from 'ts-fsrs'
import { studyDay } from '@lernapp/shared'
import type { Outcome } from '../srs/grading'
import type { SrsState } from '../srs/scheduler'
import type { Rng } from '../ui/random'
import { gameAsset, type RegionId } from './bosses'

/**
 * Fundstücke (Spielschicht Teil 4b): Katalog, Drop-Regeln, Seltenheit, Doppelte/Dünger und Forschung.
 * Alles hier ist rein; gespeichert wird in data/finds.ts.
 */
export type Rarity = 'common' | 'rare' | 'legendary'
export type FindItem = { id: string; region: RegionId; rarity: Rarity; name: string }

const region = (r: RegionId, common: [string, string][], rare: [string, string], legendary: [string, string]): FindItem[] => [
  ...common.map(([id, name]) => ({ id, name, region: r, rarity: 'common' as const })),
  { id: rare[0], name: rare[1], region: r, rarity: 'rare' },
  { id: legendary[0], name: legendary[1], region: r, rarity: 'legendary' },
]

export const FIND_ITEMS: FindItem[] = [
  ...region('wald', [['leuchtpilze', 'Leuchtpilze'], ['moosstein', 'Moosstein'], ['baumstumpf', 'Moosiger Baumstumpf'], ['farn', 'Farnbüschel']], ['eulenstatue', 'Eulenstatue'], ['waldteich', 'Waldteich']),
  ...region('sumpf', [['rohrkolben', 'Rohrkolben'], ['giftpilz', 'Giftpilz'], ['wurzel', 'Knorrige Wurzel'], ['froschstein', 'Froschstein']], ['irrlicht', 'Irrlicht-Laterne'], ['sporenbaum', 'Sporenbaum']),
  ...region('kristallberge', [['kristallgruppe', 'Kristallgruppe'], ['bergkristall', 'Bergkristall'], ['geode', 'Geode'], ['eisstein', 'Eisstein']], ['runenstein', 'Runenstein'], ['kristallbrunnen', 'Kristallbrunnen']),
  ...region('kueste', [['muschel', 'Muschel'], ['koralle', 'Koralle'], ['seestern', 'Seestern'], ['treibholz', 'Treibholz']], ['perlmuschel', 'Perlmuschel'], ['gezeitenbecken', 'Gezeitenbecken']),
  ...region('arena', [['bronzehelm', 'Bronzehelm'], ['rundschild', 'Rundschild'], ['saeulenstumpf', 'Säulenstumpf'], ['amphore', 'Amphore']], ['siegerpokal', 'Siegerpokal'], ['titanenstatue', 'Titanenstatue']),
  ...region('vulkan', [['glutstein', 'Glutstein'], ['obsidian', 'Obsidian'], ['ascheblume', 'Ascheblume'], ['schwefelkristall', 'Schwefelkristall']], ['phoenixfeder', 'Phönixfeder'], ['glutbaum', 'Glutbaum']),
]

export const RARITY_NAMES: Record<Rarity, string> = { common: 'Gewöhnlich', rare: 'Selten', legendary: 'Legendär' }
export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'legendary']

const byId = new Map(FIND_ITEMS.map((i) => [i.id, i]))
export function itemById(id: string): FindItem | undefined {
  return byId.get(id)
}

/** Legendäre Stücke sind groß und brauchen einen großen Platz. */
export function itemSize(item: FindItem): 'small' | 'large' {
  return item.rarity === 'legendary' ? 'large' : 'small'
}

export function findImage(id: string): string {
  return gameAsset(`finds/${id}.png`)
}

export const CHEST_IMAGES = { closed: gameAsset('finds/truhe_zu.png'), open: gameAsset('finds/truhe_offen.png') }

/* ---------------- Drops ---------------- */

export const MAX_FINDS = 3
export type DropKind = 'third' | 'combo' | 'rested'
/** `counted` = zählende richtige Antworten in diesem Kampf, `given` = schon gefallene Funde. */
export type LootRun = { counted: number; given: DropKind[] }
export const EMPTY_RUN: LootRun = { counted: 0, given: [] }

/** Richtig (auch teilweise) und die Karte wurde an diesem Lerntag noch nicht beantwortet. */
export function countsForLoot(prev: SrsState | undefined, outcome: Outcome, now: Date): boolean {
  if (outcome === 'wrong') return false
  if (!prev?.last_review) return true
  return studyDay(new Date(prev.last_review)) !== studyDay(now)
}

export function nextDrops(run: LootRun, a: { counts: boolean; combo: number }, rested: boolean): { run: LootRun; drops: DropKind[] } {
  if (!a.counts) return { run, drops: [] }
  const counted = run.counted + 1
  const given = [...run.given]
  const drops: DropKind[] = []
  const give = (kind: DropKind) => {
    if (given.length >= MAX_FINDS) return
    given.push(kind)
    drops.push(kind)
  }
  if (counted === 3) give('third')
  if (rested && counted === 4) give('rested')
  if (a.combo >= 5 && !given.includes('combo')) give('combo')
  return { run: { counted, given }, drops }
}

const NORMAL_ODDS: Record<Rarity, number> = { common: 0.8, rare: 0.17, legendary: 0.03 }
const BOOSTED_ODDS: Record<Rarity, number> = { common: 0.65, rare: 0.28, legendary: 0.07 }

export function oddsFor(kind: DropKind, rested: boolean): Record<Rarity, number> {
  return rested || kind === 'combo' ? { ...BOOSTED_ODDS } : { ...NORMAL_ODDS }
}

export function rollFind(kind: DropKind, rested: boolean, r: RegionId, rng: Rng): FindItem {
  const odds = oddsFor(kind, rested)
  const roll = rng()
  const rarity: Rarity = roll < odds.common ? 'common' : roll < odds.common + odds.rare ? 'rare' : 'legendary'
  const pool = FIND_ITEMS.filter((i) => i.region === r && i.rarity === rarity)
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!
}

/* ---------------- Sammlung und Dünger ---------------- */

export type Find = {
  id: string
  item: string
  rarity: Rarity
  region: RegionId
  cardId: string
  topicId: string
  moduleId: string
  foundAt: string
  foundDay: string
}
export type FindStatus = Find & { opened: boolean; researchedAt: string | null; told: boolean }
export type Owned = { item: FindItem; finds: FindStatus[]; researched: boolean }

const earlier = (a: Find, b: Find) => (a.foundAt !== b.foundAt ? a.foundAt < b.foundAt : a.id < b.id)

/** Doppelt, wenn es einen früheren Fund desselben Stücks gibt (nach Zeitpunkt, dann ID). */
export function isDuplicate(find: Find, all: Find[]): boolean {
  return all.some((o) => o.id !== find.id && o.item === find.item && earlier(o, find))
}

export function collection(finds: FindStatus[]): Map<string, Owned> {
  const owned = new Map<string, Owned>()
  for (const f of [...finds].sort((a, b) => (earlier(a, b) ? -1 : 1))) {
    const item = itemById(f.item)
    if (!item) continue
    const o = owned.get(f.item) ?? { item, finds: [], researched: false }
    o.finds.push(f)
    o.researched ||= f.researchedAt !== null
    owned.set(f.item, o)
  }
  return owned
}

export const SOIL_COST = [2, 4, 6]
export const MAX_SOIL = 3

export function soilSpent(levels: Iterable<number>): number {
  let sum = 0
  for (const level of levels) for (let i = 0; i < Math.min(level, MAX_SOIL); i++) sum += SOIL_COST[i]!
  return sum
}

/** Dünger = doppelte Funde − ausgegebener Dünger, nie unter 0. */
export function fertilizer(finds: Find[], levels: Iterable<number>): number {
  const duplicates = finds.filter((f) => isDuplicate(f, finds)).length
  return Math.max(0, duplicates - soilSpent(levels))
}

/* ---------------- Forschung ---------------- */

/**
 * Letzte Wiederholung an einem späteren Lerntag als dem Fundtag, und die Karte steht danach in „Wiederholung“
 * (richtig gewusst). Eine falsche Antwort lässt sie im Lernen oder Wiederlernen; „Schwer“ auf einer Lernkarte
 * zählt hier nicht, wird aber im Kampf über die Antwort selbst erforscht.
 */
export function researchedByState(find: Find, state: SrsState | undefined): boolean {
  if (!state?.last_review) return false
  return studyDay(new Date(state.last_review)) > find.foundDay && state.state === State.Review
}

/** Für gelöschte Karten: an einem späteren Tag sitzt ein Thema des Moduls sicher. */
export function researchedByModule(find: Find, topicSecureNow: boolean, now: Date): boolean {
  return topicSecureNow && studyDay(now) > find.foundDay
}

const MAX_QUESTION = 60
const dayNumber = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!) / 86_400_000
}

export function researchHint(a: { question: string | null; moduleName: string; due: Date | null; foundDay: string; now: Date }): string {
  if (a.question === null) return `erforscht, sobald ein Thema aus ${a.moduleName} sicher sitzt`
  const today = dayNumber(studyDay(a.now))
  const target = Math.max(a.due ? dayNumber(studyDay(a.due)) : today, dayNumber(a.foundDay) + 1, today)
  const days = target - today
  const when = days === 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} Tagen`
  const q = a.question.trim()
  const shown = q.length > MAX_QUESTION ? `${q.slice(0, MAX_QUESTION - 1)}…` : q
  return `erforscht, wenn du ‚${shown}‘ ${when} wieder weißt`
}
