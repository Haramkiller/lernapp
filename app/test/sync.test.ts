import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Card } from '@lernapp/shared'
import { db, type LogEntry, type StateRow } from '../src/data/db'
import type { Remote } from '../src/data/remote'
import { recordReview, sync } from '../src/data/sync'
import { newSrsState, review } from '../src/srs/scheduler'
import { newDoneKey } from '../src/session/queue'

type Pulled = Awaited<ReturnType<Remote['pullSince']>>

function fakeRemote(opts: { fail?: boolean } = {}) {
  const r = {
    fail: opts.fail ?? false,
    states: new Map<string, StateRow>(),
    logs: new Map<string, LogEntry>(),
    data: { modules: [], topics: [], cards: [], states: [] } as Pulled,
    async pullSince(since: string): Promise<Pulled> {
      if (r.fail) throw new Error('offline')
      return {
        modules: r.data.modules.filter((x) => x.updatedAt > since),
        topics: r.data.topics.filter((x) => x.updatedAt > since),
        cards: r.data.cards.filter((x) => x.updatedAt > since),
        states: [...r.states.values(), ...r.data.states].filter((x) => x.updatedAt > since),
      }
    },
    async pushStates(s: StateRow[]) {
      if (r.fail) throw new Error('offline')
      for (const x of s) r.states.set(x.cardId, x)
    },
    async pushLogs(l: LogEntry[]) {
      if (r.fail) throw new Error('offline')
      for (const x of l) r.logs.set(x.id, x)
    },
  }
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
  it('bei Fehler bleibt die Outbox erhalten', async () => {
    await learn('c1', T1)
    await expect(sync(fakeRemote({ fail: true }), T2)).rejects.toThrow('offline')
    expect(await db.outbox.count()).toBe(2)
  })

  it('leert die Outbox nach Erfolg', async () => {
    await learn('c1', T1)
    const remote = fakeRemote()
    const res = await sync(remote, T2)
    expect(res.pushed).toBe(2)
    expect(await db.outbox.count()).toBe(0)
    expect(remote.states.get('c1')).toBeDefined()
    expect(remote.logs.size).toBe(1)
  })

  it('schickt pro Karte nur den neuesten State', async () => {
    await learn('c1', T1)
    await learn('c1', T2)
    const remote = fakeRemote()
    await sync(remote, T2)
    expect(remote.states.get('c1')?.state.reps).toBe(2)
    expect(remote.logs.size).toBe(2)
    expect(await db.outbox.count()).toBe(0)
  })

  it('zwei Geräte: neuerer State gewinnt, beide Logs bleiben', async () => {
    const remote = fakeRemote()
    await learn('c1', T1)
    await sync(remote, T1)
    // Gerät B hat einen älteren State (09:00) und ein eigenes Log hochgeladen.
    remote.data.states.push({ cardId: 'c1', state: newSrsState(T1), updatedAt: '2026-03-10T09:00:00.000Z' })
    remote.logs.set('b-log', { id: 'b-log', cardId: 'c1', rating: 3, reviewedAt: '2026-03-10T09:00:00.000Z', studyDay: '2026-03-10', elapsedDays: 0 })
    await learn('c1', T2)
    await sync(remote, T2)
    const local = await db.states.get('c1')
    expect(local?.updatedAt).toBe(T2.toISOString())
    expect(local?.state.reps).toBe(2)
    expect(remote.states.get('c1')?.updatedAt).toBe(T2.toISOString())
    expect(remote.logs.size).toBe(3)
  })

  it('übernimmt einen neueren Remote-State, ignoriert einen älteren', async () => {
    const remote = fakeRemote()
    await learn('c1', T1)
    await sync(remote, T1)
    const newer = review(newSrsState(T2), 4, T2, { cardId: 'c1' }).state
    remote.data.states.push({ cardId: 'c1', state: newer, updatedAt: '2026-03-10T12:00:00.000Z' })
    await sync(remote, T2)
    expect((await db.states.get('c1'))?.updatedAt).toBe('2026-03-10T12:00:00.000Z')
    remote.data.states.length = 0
    remote.data.states.push({ cardId: 'c1', state: newSrsState(T1), updatedAt: '2026-03-10T08:00:00.000Z' })
    await sync(remote, T2)
    expect((await db.states.get('c1'))?.updatedAt).toBe('2026-03-10T12:00:00.000Z')
  })

  it('pull übernimmt neue Karten und gelöscht-Markierungen; lastPull = max updated_at', async () => {
    const remote = fakeRemote()
    remote.data.modules.push({ id: 'm1', name: 'BWL', examDate: null, styleProfile: null, updatedAt: '2026-03-10T09:00:00.000Z' })
    remote.data.topics.push({ id: 't1', moduleId: 'm1', name: 'Kosten', updatedAt: '2026-03-10T09:00:00.000Z' })
    remote.data.cards.push(card('c1', { updatedAt: '2026-03-10T09:30:00.000Z' }), card('c2', { updatedAt: '2026-03-10T09:40:00.000Z' }))
    const res = await sync(remote, new Date('2030-01-01T00:00:00Z'))
    expect(res.pulled).toBe(4)
    expect(await db.cards.count()).toBe(2)
    expect((await db.meta.get('lastPull'))?.value).toBe('2026-03-10T09:40:00.000Z')

    remote.data.cards.push(card('c1', { updatedAt: '2026-03-10T10:30:00.000Z', deleted: true }))
    await sync(remote, T2)
    expect((await db.cards.get('c1'))?.deleted).toBe(true)
    expect((await db.cards.get('c2'))?.deleted).toBe(false)
    expect((await db.meta.get('lastPull'))?.value).toBe('2026-03-10T10:30:00.000Z')
  })
})
