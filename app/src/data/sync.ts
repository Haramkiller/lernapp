import { db, type LogEntry, type OutboxEntry, type StateRow } from './db'
import { isPermanentError, type Cursors, type Remote, type SyncTable } from './remote'
import type { ReviewLog, SrsState } from '../srs/scheduler'
import { newDoneKey } from '../session/queue'

/**
 * Speichert eine Wiederholung atomar: State, Outbox-Einträge (State + Log) und Tageszähler
 * neuer Karten. "Neu" heißt: für die Karte gab es bisher keinen State.
 */
export async function recordReview(
  cardId: string,
  result: { state: SrsState; log: ReviewLog },
): Promise<void> {
  const { state, log } = result
  const row: StateRow = { cardId, state, updatedAt: log.reviewedAt }
  const entry: LogEntry = { ...log, cardId, id: crypto.randomUUID() }
  await db.transaction('rw', db.states, db.outbox, db.meta, async () => {
    const wasNew = (await db.states.get(cardId)) === undefined
    await db.states.put(row)
    await db.outbox.bulkAdd([
      { kind: 'state', payload: row },
      { kind: 'log', payload: entry },
    ])
    if (wasNew) {
      const key = newDoneKey(new Date(log.reviewedAt))
      const done = ((await db.meta.get(key))?.value as number | undefined) ?? 0
      await db.meta.put({ key, value: done + 1 })
    }
  })
}

type Unit<T> = { ids: number[]; item: T }

/** Verschiebt dauerhaft abgelehnte Einträge in die Quarantäne (`dead`). */
async function quarantine(ids: number[], error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  await db.transaction('rw', db.outbox, db.dead, async () => {
    const entries = (await db.outbox.bulkGet(ids)).filter((e): e is OutboxEntry => e !== undefined)
    await db.dead.bulkAdd(entries.map((e) => ({ kind: e.kind, payload: e.payload, error: message })))
    await db.outbox.bulkDelete(ids)
  })
}

/**
 * Schickt Einheiten als Batch. Erfolg → Outbox-Einträge löschen. Vorübergehender Fehler
 * (Netz/5xx) → alles behalten und abbrechen. Dauerhafter Fehler (4xx) → Einheiten einzeln
 * wiederholen, um den schädlichen Eintrag zu isolieren und in Quarantäne zu legen.
 */
async function pushUnits<T>(
  units: Unit<T>[],
  push: (items: T[]) => Promise<void>,
): Promise<{ pushed: number; error?: unknown }> {
  if (units.length === 0) return { pushed: 0 }
  const count = (us: Unit<T>[]) => us.reduce((n, u) => n + u.ids.length, 0)
  try {
    await push(units.map((u) => u.item))
    await db.outbox.bulkDelete(units.flatMap((u) => u.ids))
    return { pushed: count(units) }
  } catch (e) {
    if (!isPermanentError(e)) return { pushed: 0, error: e }
    if (units.length === 1) {
      await quarantine(units[0]!.ids, e)
      return { pushed: 0 }
    }
  }
  let pushed = 0
  for (const u of units) {
    try {
      await push([u.item])
      await db.outbox.bulkDelete(u.ids)
      pushed += u.ids.length
    } catch (e) {
      if (!isPermanentError(e)) return { pushed, error: e }
      await quarantine(u.ids, e)
    }
  }
  return { pushed }
}

async function pushOutbox(remote: Remote): Promise<{ pushed: number; error?: unknown }> {
  const entries = (await db.outbox.toArray()) as (OutboxEntry & { id: number })[]

  // Pro Karte zählt nur der neueste State; die älteren Einträge gehen mit derselben Einheit raus.
  const byCard = new Map<string, Unit<StateRow>>()
  const logUnits: Unit<LogEntry>[] = []
  for (const e of entries) {
    if (e.kind === 'log') {
      logUnits.push({ ids: [e.id], item: e.payload })
      continue
    }
    const unit = byCard.get(e.payload.cardId)
    if (!unit) byCard.set(e.payload.cardId, { ids: [e.id], item: e.payload })
    else {
      unit.ids.push(e.id)
      if (Date.parse(e.payload.updatedAt) >= Date.parse(unit.item.updatedAt)) unit.item = e.payload
    }
  }

  const states = await pushUnits([...byCard.values()], (s) => remote.pushStates(s))
  if (states.error) return states
  const logs = await pushUnits(logUnits, (l) => remote.pushLogs(l))
  return { pushed: states.pushed + logs.pushed, error: logs.error }
}

/** Übernimmt Zeilen nur, wenn sie neuer sind als die lokale Fassung; liefert die Anzahl übernommener. */
async function applyNewer<T extends { updatedAt: string }>(
  items: T[],
  getLocal: (item: T) => Promise<{ updatedAt: string } | undefined>,
  put: (item: T) => Promise<unknown>,
): Promise<number> {
  let applied = 0
  for (const item of items) {
    const local = await getLocal(item)
    if (local && Date.parse(local.updatedAt) >= Date.parse(item.updatedAt)) continue
    await put(item)
    applied++
  }
  return applied
}

const TABLES: SyncTable[] = ['modules', 'topics', 'cards', 'states']
const EPOCH = '1970-01-01T00:00:00.000Z'
/** Überlappung beim Pull: fängt Transaktionen ab, die mit älterem `synced_at` später sichtbar werden. */
export const PULL_OVERLAP_MS = 5000
const cursorKey = (t: SyncTable) => `lastPull:${t}`

export async function sync(
  remote: Remote,
  _now: Date,
): Promise<{ pushed: number; pulled: number; pushError?: string }> {
  // `_now` bleibt in der Signatur; Pull-Cursor sind Server-`synced_at` je Tabelle, nie die Geräteuhr.
  const push = await pushOutbox(remote)

  const cursors = {} as Cursors
  for (const t of TABLES) cursors[t] = ((await db.meta.get(cursorKey(t)))?.value as string | undefined) ?? EPOCH
  const since = {} as Cursors
  for (const t of TABLES) since[t] = new Date(Math.max(0, Date.parse(cursors[t]) - PULL_OVERLAP_MS)).toISOString()

  // Pull läuft auch, wenn der Push scheiterte; ein Pull-Fehler bricht den Sync ab.
  const incoming = await remote.pullSince(since)

  const pulled = await db.transaction('rw', [db.modules, db.topics, db.cards, db.states, db.meta], async () => {
    let n = 0
    n += await applyNewer(incoming.modules, (m) => db.modules.get(m.id), (m) => db.modules.put(m))
    n += await applyNewer(incoming.topics, (t) => db.topics.get(t.id), (t) => db.topics.put(t))
    n += await applyNewer(incoming.cards, (c) => db.cards.get(c.id), (c) => db.cards.put(c))
    n += await applyNewer(incoming.states, (s) => db.states.get(s.cardId), (s) => db.states.put(s))
    for (const t of TABLES) {
      const next = incoming.cursors[t]
      if (next && Date.parse(next) > Date.parse(cursors[t])) await db.meta.put({ key: cursorKey(t), value: next })
    }
    return n
  })

  const result: { pushed: number; pulled: number; pushError?: string } = { pushed: push.pushed, pulled }
  if (push.error) result.pushError = push.error instanceof Error ? push.error.message : String(push.error)
  return result
}
