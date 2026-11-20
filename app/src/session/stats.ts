import type { Card, Module } from '@lernapp/shared'
import { recall, type SrsState } from '../srs/scheduler'
import { buildQueue, type Settings } from './queue'

export type ModuleProgress = { module: Module; total: number; mastered: number; percent: number }

/** „Heute fällig“ und „Neu“ aus derselben Warteschlange, die auch das Lernen verwendet. */
export function todayCounts(input: {
  cards: Card[]
  states: Map<string, SrsState>
  newDoneToday: number
  now: Date
  settings: Settings
}): { due: number; fresh: number } {
  const queue = buildQueue(input)
  const fresh = queue.filter((id) => !input.states.has(id)).length
  return { due: queue.length - fresh, fresh }
}

/** Anteil nicht gelöschter Karten mit `recall ≥ retention`; nie gelernte Karten zählen als nicht gemeistert. */
export function moduleProgress(
  modules: Module[],
  cards: Card[],
  states: Map<string, SrsState>,
  now: Date,
  retention: number,
): ModuleProgress[] {
  return modules.map((module) => {
    const mine = cards.filter((c) => c.moduleId === module.id && !c.deleted)
    const mastered = mine.filter((c) => {
      const s = states.get(c.id)
      return s !== undefined && recall(s, now) >= retention
    }).length
    return { module, total: mine.length, mastered, percent: mine.length === 0 ? 0 : Math.round((mastered / mine.length) * 100) }
  })
}

/** Modul mit der längsten heutigen Lernliste (Gleichstand: alphabetisch); nichts zu tun → undefined. */
export function nextBattleModule(input: {
  cards: Card[]
  states: Map<string, SrsState>
  newDoneToday: number
  now: Date
  settings: Settings
  modules: Module[]
}): Module | undefined {
  const { modules, ...rest } = input
  let best: { module: Module; size: number } | undefined
  for (const module of [...modules].sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
    const size = buildQueue({ ...rest, moduleId: module.id }).length
    if (size > 0 && (!best || size > best.size)) best = { module, size }
  }
  return best?.module
}
