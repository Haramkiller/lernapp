import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Card, Module, Topic } from '@lernapp/shared'
import { db, type LogEntry, type StateRow } from '../src/data/db'
import { RemoteError, type Cursors, type Pulled, type Remote, type SyncTable } from '../src/data/remote'
import { recordReview, sync } from '../src/data/sync'
import { newSrsState, review } from '../src/srs/scheduler'
import { newDoneKey } from '../src/session/queue'

/**
 * In-Memory-Server: bedingter Upsert (älteres updated_at wird ignoriert, wie der DB-Trigger) und ein
 * streng wachsendes synced_at (Serverzeit, 10 s Abstand), das nur bei angenommenen Schreibvorgängen vergeben wird.
 */
function fakeRemote(opts: { fail?: boolean; failPush?: boolean; poison?: string[]; pushError?: RemoteError } = {}) {
  let clock = Date.parse('2026-03-10T00:00:00Z')
  type Row = { item: { updatedAt: string }; syncedAt: string }
  const tables: Record<SyncTable, Map<string, Row>> = {
    modules: new Map(),
    topics: new Map(),
    cards: new Map(),
    states: new Map(),
  }
  const r = {
    fail: opts.fail ?? false,
    failPush: opts.failPush ?? false,
    poison: new Set(opts.poison ?? []),
    pushError: opts.pushError,
    logs: new Map<string, LogEntry>(),
    put(table: SyncTable, key: string, item: { updatedAt: string; [k: string]: unknown }) {
      const ex = tables[table].get(key)
      if (ex && Date.parse(item.updatedAt) <= Date.parse(ex.item.updatedAt)) return
      clock += 10_000
      tables[table].set(key, { item, syncedAt: new Date(clock).toISOString() })
    },
    syncedAt: (table: SyncTable, key: string) => tables[table].get(key)?.syncedAt,
    state: (cardId: string) => tables.states.get(cardId)?.item as StateRow | undefined,
    async pullSince(since: Cursors): Promise<Pulled> {
      if (r.fail) throw new Error('offline')
      const out: Record<SyncTable, unknown[]> = { modules: [], topics: [], cards: [], states: [] }
      const cursors: Partial<Cursors> = {}
      for (const t of Object.keys(tables) as SyncTable[]) {
        for (const row of tables[t].values()) {
          if (Date.parse(row.syncedAt) < Date.parse(since[t])) continue
          out[t].push(row.item)
          if (!cursors[t] || row.syncedAt > cursors[t]!) cursors[t] = row.syncedAt
        }
      }
      return { ...out, cursors } as unknown as Pulled
    },
    async pushStates(s: StateRow[]) {
      if (r.fail || r.failPush) throw new Error('offline')
      if (r.pushError) throw r.pushError
      const bad = s.find((x) => r.poison.has(x.cardId))
      if (bad) throw new RemoteError('FK violation ' + bad.cardId, true)
      for (const x of s) r.put('states', x.cardId, x)
    },
    async pushLogs(l: LogEntry[]) {
      if (r.fail || r.failPush) throw new Error('offline')
      if (r.pushError) throw r.pushError
      const bad = l.find((x) => r.poison.has(x.cardId))
      if (bad) throw new RemoteError('FK violation ' + bad.cardId, true)
      for (const x of l) r.logs.set(x.id, x)
    },
  } satisfies Remote & Record<string, unknown>
  return r
}

const T1 = new Date('2026-03-10T10:00:00Z')
const T2 = new Date('2026-03-10T11:00:00Z')

function card(id: string, over: Partial<Card> = {}): Card {
  return {
    id,
    moduleId: 'm1',
    topicId: 't1',
    type: 'free',
    payload: { question: 'Q', modelAnswer: 'A', keyPoints: ['k'] },
    explanation: '',
    source: null,
    examRelevant: false,
    fromExam: false,
    difficulty: 1,
    createdAt: T1.toISOString(),
    updatedAt: T1.toISOString(),
    deleted: false,
    ...over,
  } as Card
}

async function learn(cardId: string, at: Date, rating: 1 | 2 | 3 | 4 = 3) {
  const prev = (await db.states.get(cardId))?.state ?? newSrsState(at)
  await recordReview(cardId, review(prev, rating, at, { cardId }))
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('recordReview', () => {
  it('offline: landet in Outbox (State + Log), zählt neue Karte', async () => {
    await learn('c1', T1)
    expect((await db.states.get('c1'))?.state.reps).toBe(1)
    const box = await db.outbox.toArray()
    expect(box.map((e) => e.kind).sort()).toEqual(['log', 'state'])
    expect((await db.meta.get(newDoneKey(T1)))?.value).toBe(1)
  })

  it('zweite Wiederholung derselben Karte zählt nicht als neu', async () => {
    await learn('c1', T1)
    await learn('c1', T2)
    expect((await db.meta.get(newDoneKey(T1)))?.value).toBe(1)
  })
})

describe('sync', () => {
  it('bei komplettem Ausfall (Push und Pull) wirft sync und die Outbox bleibt', async () => {
    await learn('c1', T1)
    await expect(sync(fakeRemote({ fail: true }), T2)).rejects.toThrow('offline')
    expect(await db.outbox.count()).toBe(2)
  })

  it('leert die Outbox nach Erfolg', async () => {
    await learn('c1', T1)
    const remote = fakeRemote()
    const res = await sync(remote, T2)
    expect(res.pushed).toBe(2)
    expect(res.pushError).toBeUndefined()
    expect(await db.outbox.count()).toBe(0)
    expect(remote.state('c1')).toBeDefined()
    expect(remote.logs.size).toBe(1)
  })

  it('schickt pro Karte nur den neuesten State', async () => {
    await learn('c1', T1)
    await learn('c1', T2)
    const remote = fakeRemote()
    const res = await sync(remote, T2)
    expect(remote.state('c1')?.state.reps).toBe(2)
    expect(remote.logs.size).toBe(2)
    expect(res.pushed).toBe(4)
    expect(await db.outbox.count()).toBe(0)
  })

  it('zwei Geräte: neuerer State gewinnt, beide Logs bleiben', async () => {
    const remote = fakeRemote()
    await learn('c1', T1)
    await sync(remote, T1)
    remote.put('states', 'c1', { cardId: 'c1', state: newSrsState(T1), updatedAt: '2026-03-10T09:00:00.000Z' })
    remote.logs.set('b-log', { id: 'b-log', cardId: 'c1', rating: 3, reviewedAt: '2026-03-10T09:00:00.000Z', studyDay: '2026-03-10', elapsedDays: 0 })
    await learn('c1', T2)
    await sync(remote, T2)
    const local = await db.states.get('c1')
    expect(local?.updatedAt).toBe(T2.toISOString())
    expect(local?.state.reps).toBe(2)
    expect(remote.state('c1')?.updatedAt).toBe(T2.toISOString())
    expect(remote.logs.size).toBe(3)
  })

  it('Push außer der Reihe: Server behält den neueren State, beide Geräte konvergieren', async () => {
    const remote = fakeRemote()
    // Gerät B (direkt am Server) pusht zuerst den NEUEREN State (T2).
    const newer = review(newSrsState(T1), 4, T2, { cardId: 'c1' }).state
    await remote.pushStates([{ cardId: 'c1', state: newer, updatedAt: T2.toISOString() }])
    // Gerät A hatte offline die ÄLTERE Wiederholung (T1) und pusht erst jetzt.
    await learn('c1', T1)
    await sync(remote, T2)
    expect(remote.state('c1')?.updatedAt).toBe(T2.toISOString())
    expect(remote.state('c1')?.state).toEqual(newer)
    expect((await db.states.get('c1'))?.updatedAt).toBe(T2.toISOString())
    expect((await db.states.get('c1'))?.state).toEqual(newer)
    expect(remote.logs.size).toBe(1)
    // Erneuter Sync ändert nichts.
    await sync(remote, T2)
    expect((await db.states.get('c1'))?.state).toEqual(newer)
  })

  it('alter State, der erst nach dem Cursor eines anderen Geräts hochgeladen wird, wird trotzdem gepullt', async () => {
    const remote = fakeRemote()
    remote.put('states', 'c0', { cardId: 'c0', state: newSrsState(T1), updatedAt: '2026-03-10T09:00:00.000Z' })
    await sync(remote, T2) // Cursor rückt auf das synced_at von c0 vor
    const cursorBefore = (await db.meta.get('lastPull:states'))?.value as string
    expect(cursorBefore).toBe(remote.syncedAt('states', 'c0'))
    // Weitere Server-Schreibvorgänge, danach lädt ein anderes Gerät eine sehr alte Wiederholung hoch.
    for (let i = 0; i < 3; i++) remote.put('modules', 'm' + i, { id: 'm' + i, name: 'x', examDate: null, styleProfile: null, updatedAt: T1.toISOString() } as Module)
    const old = { cardId: 'c9', state: newSrsState(T1), updatedAt: '2026-01-01T00:00:00.000Z' }
    await remote.pushStates([old])
    expect(Date.parse(remote.syncedAt('states', 'c9')!)).toBeGreaterThan(Date.parse(cursorBefore) + 5000)
    await sync(remote, T2)
    expect((await db.states.get('c9'))?.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('übernimmt einen neueren Remote-State, ignoriert einen älteren', async () => {
    const remote = fakeRemote()
    await learn('c1', T1)
    await sync(remote, T1)
    const newer = review(newSrsState(T2), 4, T2, { cardId: 'c1' }).state
    remote.put('states', 'c1', { cardId: 'c1', state: newer, updatedAt: '2026-03-10T12:00:00.000Z' })
    await sync(remote, T2)
    expect((await db.states.get('c1'))?.updatedAt).toBe('2026-03-10T12:00:00.000Z')
  })

  it('ignoriert einen älteren eingehenden State', async () => {
    const remote = fakeRemote()
    const local = review(newSrsState(T2), 4, T2, { cardId: 'c1' }).state
    await db.states.put({ cardId: 'c1', state: local, updatedAt: '2026-03-10T12:00:00.000Z' })
    remote.put('states', 'c1', { cardId: 'c1', state: newSrsState(T1), updatedAt: '2026-03-10T08:00:00.000Z' })
    const res = await sync(remote, T2)
    expect(res.pulled).toBe(0)
    expect((await db.states.get('c1'))?.state).toEqual(local)
  })

  it('pull übernimmt neue Karten und gelöscht-Markierungen; Cursor je Tabelle = max synced_at', async () => {
    const remote = fakeRemote()
    const m: Module = { id: 'm1', name: 'BWL', examDate: null, styleProfile: null, updatedAt: '2026-03-10T09:00:00.000Z' }
    const t: Topic = { id: 't1', moduleId: 'm1', name: 'Kosten', updatedAt: '2026-03-10T09:00:00.000Z' }
    remote.put('modules', 'm1', m)
    remote.put('topics', 't1', t)
    remote.put('cards', 'c1', card('c1', { updatedAt: '2026-03-10T09:30:00.000Z' }))
    remote.put('cards', 'c2', card('c2', { updatedAt: '2026-03-10T09:40:00.000Z' }))
    const res = await sync(remote, new Date('2030-01-01T00:00:00Z'))
    expect(res.pulled).toBe(4)
    expect(await db.cards.count()).toBe(2)
    expect((await db.meta.get('lastPull:cards'))?.value).toBe(remote.syncedAt('cards', 'c2'))
    expect((await db.meta.get('lastPull:modules'))?.value).toBe(remote.syncedAt('modules', 'm1'))

    remote.put('cards', 'c1', card('c1', { updatedAt: '2026-03-10T10:30:00.000Z', deleted: true }))
    const again = await sync(remote, T2)
    expect(again.pulled).toBe(1) // Überlappung liefert c2 erneut, wird aber als nicht neuer ignoriert
    expect((await db.cards.get('c1'))?.deleted).toBe(true)
    expect((await db.cards.get('c2'))?.deleted).toBe(false)
    expect((await db.meta.get('lastPull:cards'))?.value).toBe(remote.syncedAt('cards', 'c1'))
  })
})

describe('sync: Push-Fehler', () => {
  it('vorübergehender Push-Fehler: Pull läuft trotzdem, Outbox bleibt, pushError gemeldet', async () => {
    const remote = fakeRemote({ failPush: true })
    remote.put('cards', 'c5', card('c5'))
    await learn('c1', T1)
    const res = await sync(remote, T2)
    expect(res.pushError).toBe('offline')
    expect(res.pushed).toBe(0)
    expect(res.pulled).toBe(1)
    expect(await db.cards.get('c5')).toBeDefined()
    expect(await db.outbox.count()).toBe(2)
    expect(await db.dead.count()).toBe(0)
  })

  it('dauerhaft abgelehnter Eintrag (4xx) kommt in Quarantäne, der Rest geht durch', async () => {
    const remote = fakeRemote({ poison: ['c1'] })
    remote.put('cards', 'c5', card('c5'))
    await learn('c1', T1)
    await learn('c2', T1)
    const res = await sync(remote, T2)
    expect(res.pushError).toBeUndefined()
    expect(res.pushed).toBe(2)
    expect(remote.state('c2')).toBeDefined()
    expect(remote.state('c1')).toBeUndefined()
    expect(remote.logs.size).toBe(1)
    expect(await db.outbox.count()).toBe(0)
    const dead = await db.dead.toArray()
    expect(dead.map((d) => d.kind).sort()).toEqual(['log', 'state'])
    expect(dead.every((d) => d.error === 'FK violation c1')).toBe(true)
    expect(await db.cards.get('c5')).toBeDefined() // Pull lief ebenfalls
    // Folge-Sync ist sauber.
    expect((await sync(remote, T2)).pushed).toBe(0)
  })

  it('Giftzeile mitten im Batch: nur diese landet in Quarantäne', async () => {
    const remote = fakeRemote({ poison: ['c2'] })
    for (const id of ['c1', 'c2', 'c3']) await learn(id, T1)
    const res = await sync(remote, T2)
    expect(res.pushed).toBe(4)
    expect(remote.state('c1')).toBeDefined()
    expect(remote.state('c3')).toBeDefined()
    expect((await db.dead.toArray()).map((d) => (d.payload as { cardId: string }).cardId)).toEqual(['c2', 'c2'])
    expect(await db.outbox.count()).toBe(0)
  })

  it.each([
    ['401 (JWT abgelaufen)', new RemoteError('JWT expired', false)],
    ['404 (Tabelle fehlt)', new RemoteError('relation not found', false)],
  ])('%s: nichts kommt in Quarantäne, Outbox bleibt, Pull läuft', async (_n, err) => {
    const remote = fakeRemote({ pushError: err })
    remote.put('cards', 'c5', card('c5'))
    await learn('c1', T1)
    await learn('c2', T1)
    const res = await sync(remote, T2)
    expect(res.pushError).toBe(err.message)
    expect(await db.dead.count()).toBe(0)
    expect(await db.outbox.count()).toBe(4)
    expect(await db.cards.get('c5')).toBeDefined()
  })

  it('Sicherung: scheitert auch der erste Einzelversuch identisch, wird nichts in Quarantäne gelegt', async () => {
    const remote = fakeRemote({ pushError: new RemoteError('bad request', true) })
    await learn('c1', T1)
    await learn('c2', T1)
    const res = await sync(remote, T2)
    expect(res.pushError).toBe('bad request')
    expect(await db.dead.count()).toBe(0)
    expect(await db.outbox.count()).toBe(4)
  })
})
