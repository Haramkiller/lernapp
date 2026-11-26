import type { Card, Module, Topic } from '@lernapp/shared'
import type { SrsState } from '../srs/scheduler'
import { buildQueue, type Settings } from '../session/queue'
import { REGIONS, assignBosses, type AreaChoices, type BossDef, type RegionDef } from './bosses'
import { bossLife, dailyQuest, isPlayable, lifePercent, topicStatus, type Quest, type TopicStatus } from './mastery'

export type ModuleView = {
  module: Module
  boss: BossDef
  bossName: string
  /** Boss-Leben in % des Höchstwerts; null = Modul ohne Karten. */
  life: number | null
  due: number
  fresh: number
  topics: TopicStatus[]
  /** „Wenn du sicher bist: N % richtig“ (letzte 30 Tage); null = zu wenige sichere Antworten. */
  calibration: number | null
}
/** `modules` leer = Region liegt im Nebel. */
export type RegionView = { region: RegionDef; modules: ModuleView[] }
/** `strays` = Karten der heutigen Lernliste ohne bekanntes Modul (gelöscht oder noch nicht synchronisiert). */
export type Overview = { quest: Quest; regions: RegionView[]; strays: number }

/** Alles für Karte und Titelbild, berechnet aus dem Lernstand (nichts davon wird gespeichert). */
export function buildOverview(input: {
  cards: Card[]
  states: Map<string, SrsState>
  topics: Topic[]
  modules: Module[]
  newDoneToday: number
  now: Date
  settings: Settings
  chosen: AreaChoices
  /** Treffsicherheit je Modul (siehe calibrationByModule). */
  calibration?: Map<string, number>
}): Overview {
  const { cards, states, topics, modules, newDoneToday, now, settings, chosen, calibration } = input
  const retention = settings.retention
  const bosses = assignBosses(modules, chosen)
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'de')

  const views = [...modules].sort(byName).map((module): ModuleView => {
    const boss = bosses.get(module.id)!
    const mine = cards.filter((c) => c.moduleId === module.id && !c.deleted && isPlayable(c))
    const queue = buildQueue({ cards: mine, states, newDoneToday, now, settings, moduleId: module.id })
    const queued = new Set(queue)
    const fresh = queue.filter((id) => !states.has(id)).length
    return {
      module,
      boss,
      bossName: `${boss.title} · ${module.name}`,
      life: lifePercent(bossLife(mine, states, now, retention)),
      due: queue.length - fresh,
      fresh,
      calibration: calibration?.get(module.id) ?? null,
      topics: topics
        .filter((t) => t.moduleId === module.id)
        .sort(byName)
        .map((t) => topicStatus(t, mine.filter((c) => c.topicId === t.id), states, queued, now, retention)),
    }
  })

  const known = new Set(modules.map((m) => m.id))
  const byId = new Map(cards.map((c) => [c.id, c]))
  const strays = buildQueue({ cards, states, newDoneToday, now, settings }).filter((id) => !known.has(byId.get(id)!.moduleId)).length

  return {
    quest: dailyQuest({ cards, states, newDoneToday, now, settings }),
    regions: REGIONS.map((region) => ({ region, modules: views.filter((v) => v.boss.region === region.id) })),
    strays,
  }
}
