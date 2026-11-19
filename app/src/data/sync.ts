import { db, type LogEntry, type OutboxEntry, type StateRow } from './db'
import type { Remote } from './remote'
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

async function pushOutbox(remote: Remote): Promise<number> {
  const entries = (await db.outbox.toArray()) as (OutboxEntry & { id: number })[]
  if (entries.length === 0) return 0

  // Pro Karte zählt nur der neueste State (ein Upsert mit doppeltem Schlüssel wäre ein Fehler).
  const latest = new Map<string, StateRow>()
  const stateIds: number[] = []
  const logs: LogEntry[] = []
  const logIds: number[] = []
  for (const e of entries) {
    if (e.kind === 'state') {
      stateIds.push(e.id)
      const prev = latest.get(e.payload.cardId)
      if (!prev || prev.updatedAt <= e.payload.updatedAt) latest.set(e.payload.cardId, e.payload)
    } else {
      logIds.push(e.id)
      logs.push(e.payload)
    }
  }

  // Erst nach erfolgreichem Remote-Aufruf löschen; bei Fehler bleiben die Einträge erhalten.
  if (latest.size > 0) {
    await remote.pushStates([...latest.values()])
    await db.outbox.bulkDelete(stateIds)
  }
  if (logs.length > 0) {
    await remote.pushLogs(logs)
    await db.outbox.bulkDelete(logIds)
  }
  return stateIds.length + logIds.length
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
    if (local && local.updatedAt >= item.updatedAt) continue
    await put(item)
    applied++
  }
  return applied
}

export async function sync(remote: Remote, _now: Date): Promise<{ pushed: number; pulled: number }> {
  // `_now` bleibt in der Signatur, der Pull-Cursor folgt aber dem Server-`updated_at`
  // (nicht der Geräteuhr), damit Uhrabweichungen keine Lücken reißen.
  const pushed = await pushOutbox(remote)

  const since = ((await db.meta.get('lastPull'))?.value as string | undefined) ?? '1970-01-01T00:00:00.000Z'
  const incoming = await remote.pullSince(since)

  let cursor = since
  for (const list of [incoming.modules, incoming.topics, incoming.cards, incoming.states]) {
    for (const item of list) if (item.updatedAt > cursor) cursor = item.updatedAt
  }

  const pulled = await db.transaction('rw', [db.modules, db.topics, db.cards, db.states, db.meta], async () => {
    let n = 0
    n += await applyNewer(incoming.modules, (m) => db.modules.get(m.id), (m) => db.modules.put(m))
    n += await applyNewer(incoming.topics, (t) => db.topics.get(t.id), (t) => db.topics.put(t))
    n += await applyNewer(incoming.cards, (c) => db.cards.get(c.id), (c) => db.cards.put(c))
    n += await applyNewer(incoming.states, (s) => db.states.get(s.cardId), (s) => db.states.put(s))
    if (cursor !== since) await db.meta.put({ key: 'lastPull', value: cursor })
    return n
  })

  return { pushed, pulled }
}
