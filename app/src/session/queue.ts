import { studyDay, type Card } from '@lernapp/shared'
import { isDue, recall, type SrsState } from '../srs/scheduler'

export type Settings = { retention: number; newPerDay: number }

/** Speicherschlüssel des Tageszählers neuer Karten; wechselt um 04:00 Uhr. */
export function newDoneKey(now: Date): string {
  return 'newDone:' + studyDay(now)
}

/** Greedy: nächste Karte in Prioritätsreihenfolge mit anderem Thema als die vorige. */
function interleave(cards: Card[]): Card[] {
  const rest = [...cards]
  const out: Card[] = []
  while (rest.length > 0) {
    const prev = out[out.length - 1]?.topicId
    const i = rest.findIndex((c) => c.topicId !== prev)
    out.push(...rest.splice(i === -1 ? 0 : i, 1))
  }
  return out
}

export function buildQueue(input: {
  cards: Card[]
  states: Map<string, SrsState>
  newDoneToday: number
  now: Date
  settings: Settings
  moduleId?: string
}): string[] {
  const { cards, states, newDoneToday, now, settings, moduleId } = input
  const live = cards.filter((c) => !c.deleted && (moduleId === undefined || c.moduleId === moduleId))

  const due = live
    .filter((c) => {
      const s = states.get(c.id)
      return s !== undefined && isDue(s, now)
    })
    .map((c) => ({ card: c, r: recall(states.get(c.id)!, now) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.card)

  const newLimit = Math.max(0, settings.newPerDay - newDoneToday)
  const fresh = live
    .filter((c) => !states.has(c.id))
    .sort(
      (a, b) =>
        Number(b.examRelevant) - Number(a.examRelevant) ||
        (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0),
    )
    .slice(0, newLimit)

  return interleave([...due, ...fresh]).map((c) => c.id)
}
