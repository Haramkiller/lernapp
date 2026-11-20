import type { AreaChoices } from '../game/bosses'
import { db, type GameItem } from './db'

const AREA = 'area:'
const REST = 'rest'

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
