import type { AreaChoices } from '../game/bosses'
import type { Milestones } from '../game/garden'
import { db, type GameItem } from './db'

const AREA = 'area:'
const REST = 'rest'
const TOPIC = 'topic:'
const BOSS = 'boss:'
const LIFE = 'life:'
/** Schlüssel für das Boss-Leben eines Kampfes über alle Module. */
export const ALL_MODULES = '*'

/** Speichert lokal und legt den Eintrag für den nächsten Sync in die Outbox (in einer Transaktion). */
export async function putGameItem(item: GameItem): Promise<void> {
  await db.transaction('rw', db.game, db.outbox, async () => {
    await db.game.put(item)
    await db.outbox.add({ kind: 'game', payload: item })
  })
}

export async function loadAreaChoices(): Promise<AreaChoices> {
  const items = await db.game.where('id').startsWith(AREA).toArray()
  const choices: AreaChoices = new Map()
  for (const { id, data } of items) if (typeof data.bossId === 'string') choices.set(id.slice(AREA.length), data.bossId)
  return choices
}

/** `bossId: null` = automatisch; bleibt als Zeile, damit die Rücknahme auch auf andere Geräte synchronisiert. */
export async function saveAreaChoice(moduleId: string, bossId: string | null, now: Date): Promise<void> {
  await putGameItem({ id: AREA + moduleId, data: { bossId }, updatedAt: now.toISOString() })
}

export async function loadLastBattleAt(): Promise<Date | null> {
  const at = (await db.game.get(REST))?.data.at
  return typeof at === 'string' ? new Date(at) : null
}

export async function saveLastBattleAt(at: Date): Promise<void> {
  await putGameItem({ id: REST, data: { at: at.toISOString() }, updatedAt: at.toISOString() })
}

/** Zuletzt angezeigtes Boss-Leben am Kampfende (für „hat sich erholt“); null ohne Eintrag. */
export async function loadBossLife(key: string): Promise<number | null> {
  const hp = (await db.game.get(LIFE + key))?.data.hp
  return typeof hp === 'number' ? hp : null
}

export async function saveBossLife(key: string, hp: number, now: Date): Promise<void> {
  await putGameItem({ id: LIFE + key, data: { hp }, updatedAt: now.toISOString() })
}

/** Gewächshaus: wann ein Thema erstmals sicher saß bzw. ein Modul erstmals ganz blühte. */
export async function loadMilestones(): Promise<Milestones> {
  const ms: Milestones = { securedAt: new Map(), defeatedAt: new Map() }
  for (const { id, data } of await db.game.where('id').startsWith(TOPIC).toArray())
    if (typeof data.securedAt === 'string') ms.securedAt.set(id.slice(TOPIC.length), data.securedAt)
  for (const { id, data } of await db.game.where('id').startsWith(BOSS).toArray())
    if (typeof data.defeatedAt === 'string') ms.defeatedAt.set(id.slice(BOSS.length), data.defeatedAt)
  return ms
}

/** Schreibt nur die übergebenen (neuen) Meilensteine; gibt ihre Anzahl zurück. */
export async function recordMilestones(found: { topics: string[]; modules: string[] }, now: Date): Promise<number> {
  const at = now.toISOString()
  for (const t of found.topics) await putGameItem({ id: TOPIC + t, data: { securedAt: at }, updatedAt: at })
  for (const m of found.modules) await putGameItem({ id: BOSS + m, data: { defeatedAt: at }, updatedAt: at })
  return found.topics.length + found.modules.length
}
