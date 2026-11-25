import type { Card, Module, Topic } from '@lernapp/shared'
import type { SrsState } from '../srs/scheduler'
import { assignBosses, type AreaChoices, type RegionId } from './bosses'
import { isLearned, isPlayable, isSecure } from './mastery'

/**
 * Gewächshaus: Zustand jeder Pflanze wird aus dem Lernstand berechnet, nie gespeichert (Spec 8).
 * Gespeichert werden nur Meilensteine: wann ein Thema erstmals sicher saß bzw. ein Boss erstmals
 * endgültig besiegt war – das unterscheidet „welk“ von „wächst noch“.
 */
export type PlantStage = 'seed' | 'sprout' | 'young' | 'bloom' | 'wilted'

/** topicId → ISO bzw. moduleId → ISO. */
export type Milestones = { securedAt: Map<string, string>; defeatedAt: Map<string, string> }

export type PlantView = { topic: Topic; stage: PlantStage; species: number; total: number; due: number; securePct: number }
export type BedView = { module: Module; region: RegionId; plants: PlantView[]; tree: 'none' | 'bloom' | 'wilted' }

export const SPECIES_COUNT = 12

/** Je Region 4 Arten (überlappend), damit ein Beet bunt bleibt und das Gebiet trotzdem durchscheint. */
export const REGION_SPECIES: Record<RegionId, number[]> = {
  wald: [0, 1, 2, 3],
  sumpf: [3, 4, 5, 6],
  kristallberge: [6, 7, 8, 9],
  kueste: [9, 10, 11, 0],
  arena: [1, 4, 7, 10],
  vulkan: [2, 5, 8, 11],
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export function speciesFor(topicId: string, region: RegionId): number {
  const pool = REGION_SPECIES[region]
  return pool[hash(topicId) % pool.length]!
}

/**
 * Saat (nichts gelernt) → Sämling (< 50 % sicher) → jung (≥ 50 %) → Blüte (alle sicher).
 * Welk nur, wenn das Thema schon einmal sicher war und eine *gelernte* Karte jetzt unsicher ist:
 * neue Karten aus der Werkstatt lassen nichts welken (Spec 6.5).
 */
export function plantStage(cards: Card[], states: Map<string, SrsState>, now: Date, retention: number, everSecure: boolean): PlantStage {
  const live = cards.filter((c) => !c.deleted)
  const learned = live.filter((c) => isLearned(states.get(c.id)))
  if (learned.length === 0) return 'seed'
  const secure = live.filter((c) => isSecure(states.get(c.id), now, retention)).length
  if (secure === live.length) return 'bloom'
  if (everSecure && learned.some((c) => !isSecure(states.get(c.id), now, retention))) return 'wilted'
  return secure / live.length < 0.5 ? 'sprout' : 'young'
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'de')

export function buildGarden(input: {
  modules: Module[]
  topics: Topic[]
  cards: Card[]
  states: Map<string, SrsState>
  now: Date
  retention: number
  chosen: AreaChoices
  milestones: Milestones
}): BedView[] {
  const { modules, topics, cards, states, now, retention, chosen, milestones } = input
  const bosses = assignBosses(modules, chosen)
  const byTopic = new Map<string, Card[]>()
  for (const c of cards) if (!c.deleted && isPlayable(c)) byTopic.set(c.topicId, [...(byTopic.get(c.topicId) ?? []), c])

  return [...modules].sort(byName).map((module) => {
    const region = bosses.get(module.id)!.region
    const plants: PlantView[] = topics
      .filter((t) => t.moduleId === module.id && (byTopic.get(t.id)?.length ?? 0) > 0)
      .sort(byName)
      .map((topic) => {
        const own = byTopic.get(topic.id)!
        const secure = own.filter((c) => isSecure(states.get(c.id), now, retention)).length
        return {
          topic,
          stage: plantStage(own, states, now, retention, milestones.securedAt.has(topic.id)),
          species: speciesFor(topic.id, region),
          total: own.length,
          due: own.filter((c) => isLearned(states.get(c.id)) && !isSecure(states.get(c.id), now, retention)).length,
          securePct: Math.round((secure / own.length) * 100),
        }
      })
    // Wie die Pflanzen: welk nur, wenn Gelerntes verblasst – neue Karten oder Themen lassen nichts welken.
    const tree = !milestones.defeatedAt.has(module.id) ? 'none' : plants.some((p) => p.stage === 'wilted') ? 'wilted' : 'bloom'
    return { module, region, plants, tree }
  })
}

/** Themen bzw. Module, die jetzt sicher bzw. endgültig besiegt sind und noch keinen Meilenstein haben. */
export function newMilestones(beds: BedView[], milestones: Milestones): { topics: string[]; modules: string[] } {
  const topics: string[] = []
  const modules: string[] = []
  for (const bed of beds) {
    for (const p of bed.plants) if (p.stage === 'bloom' && !milestones.securedAt.has(p.topic.id)) topics.push(p.topic.id)
    const allBloom = bed.plants.length > 0 && bed.plants.every((p) => p.stage === 'bloom')
    if (allBloom && !milestones.defeatedAt.has(bed.module.id)) modules.push(bed.module.id)
  }
  return { topics, modules }
}

export function bloomCount(beds: BedView[]): number {
  return beds.reduce((n, b) => n + b.plants.filter((p) => p.stage === 'bloom').length + (b.tree === 'bloom' ? 1 : 0), 0)
}
