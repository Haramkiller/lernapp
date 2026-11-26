import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cardToRow, moduleToRow, topicToRow, type Card, type Module, type Topic } from '@lernapp/shared'
import { db } from '../src/data/db'
import { loadModuleContent, loadModules, saveImport } from '../src/data/cardImport'
import type { Prepared } from '../src/cards/prepare'

const mod = (id: string, name: string): Module => ({ id, name, examDate: null, styleProfile: null, updatedAt: '2026-11-26T10:00:00.000Z' })
const topic = (id: string, moduleId: string): Topic => ({ id, moduleId, name: `T ${id}`, updatedAt: '2026-11-26T10:00:00.000Z' })
const card = (id: string, moduleId: string, deleted = false): Card =>
  ({
    id,
    moduleId,
    topicId: 't1',
    type: 'free',
    payload: { question: `Frage ${id}?`, modelAnswer: 'm', keyPoints: ['k'] },
    explanation: '',
    source: null,
    examRelevant: false,
    fromExam: false,
    difficulty: 2,
    createdAt: '2026-11-26T10:00:00.000Z',
    updatedAt: '2026-11-26T10:00:00.000Z',
    deleted,
  }) as Card

/** Zeichnet from(tabelle).upsert(zeilen) auf; `fail` lässt eine Tabelle scheitern. */
function fakeClient(fail?: string) {
  const calls: { table: string; rows: unknown[] }[] = []
  const client = {
    from: (table: string) => ({
      upsert: async (rows: unknown[]) => {
        calls.push({ table, rows })
        return { error: table === fail ? { message: 'permission denied' } : null }
      },
    }),
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const prepared = (over: Partial<Prepared> = {}): Prepared => ({
  module: mod('m1', 'Botanik'),
  isNewModule: true,
  topics: [topic('t1', 'm1')],
  cards: [card('c1', 'm1'), card('c2', 'm1')],
  found: 2,
  rejected: 0,
  duplicates: 0,
  ...over,
})

beforeEach(async () => {
  await Promise.all([db.modules.clear(), db.topics.clear(), db.cards.clear()])
})

describe('loadModules / loadModuleContent', () => {
  it('Module nach Name sortiert', async () => {
    await db.modules.bulkPut([mod('b', 'Zoologie'), mod('a', 'Botanik')])
    expect((await loadModules()).map((m) => m.name)).toEqual(['Botanik', 'Zoologie'])
  })

  it('liefert Themen und nicht gelöschte Karten des Moduls', async () => {
    await db.topics.bulkPut([topic('t1', 'm1'), topic('t2', 'm2')])
    await db.cards.bulkPut([card('c1', 'm1'), card('c2', 'm1', true), card('c3', 'm2')])
    const content = await loadModuleContent('m1')
    expect(content.topics.map((t) => t.id)).toEqual(['t1'])
    expect(content.cards.map((c) => c.id)).toEqual(['c1'])
  })
})

describe('saveImport', () => {
  it('schreibt modules → topics → cards als Zeilen', async () => {
    const { client, calls } = fakeClient()
    const p = prepared()
    await saveImport(client, p)
    expect(calls.map((c) => c.table)).toEqual(['modules', 'topics', 'cards'])
    expect(calls[0]!.rows).toEqual([moduleToRow(p.module)])
    expect(calls[1]!.rows).toEqual(p.topics.map(topicToRow))
    expect(calls[2]!.rows).toEqual(p.cards.map(cardToRow))
  })

  it('bestehendes Modul wird nicht geschrieben, leere Themen auch nicht', async () => {
    const { client, calls } = fakeClient()
    await saveImport(client, prepared({ isNewModule: false, topics: [] }))
    expect(calls.map((c) => c.table)).toEqual(['cards'])
  })

  it('450 Karten: drei Pakete', async () => {
    const { client, calls } = fakeClient()
    const cards = Array.from({ length: 450 }, (_, i) => card(`c${i}`, 'm1'))
    await saveImport(client, prepared({ isNewModule: false, topics: [], cards }))
    expect(calls.map((c) => c.rows.length)).toEqual([200, 200, 50])
  })

  it('Fehler von Supabase bricht ab und wirft mit Meldung', async () => {
    const { client, calls } = fakeClient('topics')
    await expect(saveImport(client, prepared())).rejects.toThrow(/permission denied/)
    expect(calls.map((c) => c.table)).toEqual(['modules', 'topics'])
  })

  it('zweiter Aufruf mit demselben Prepared schreibt dieselben IDs', async () => {
    const { client, calls } = fakeClient()
    const p = prepared()
    await saveImport(client, p)
    await saveImport(client, p)
    const ids = (i: number) => (calls[i]!.rows as { id: string }[]).map((r) => r.id)
    expect(ids(5)).toEqual(ids(2))
  })
})
