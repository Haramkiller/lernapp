import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseRemote, RemoteError } from '../src/data/remote'

type Row = Record<string, unknown> & { synced_at: string }

/** Minimaler PostgREST-Ersatz: gte / or-Keyset / order / limit, mit serverseitigem max_rows. */
function stubClient(data: Record<string, Row[]>, maxRows: number, failWith?: { status: number; message: string }) {
  const calls: { table: string; gte?: string; or?: string }[] = []
  const client = {
    from(table: string) {
      const call: { table: string; gte?: string; or?: string } = { table }
      let limit = Infinity
      let keyCol = 'id'
      const b = {
        select: () => b,
        gte: (_c: string, v: string) => ((call.gte = v), b),
        or: (s: string) => ((call.or = s), b),
        order: (c: string) => (c !== 'synced_at' && (keyCol = c), b),
        limit: (n: number) => ((limit = n), b),
        then(resolve: (v: unknown) => unknown) {
          calls.push(call)
          if (failWith) return resolve({ data: null, error: { message: failWith.message }, status: failWith.status })
          let rows = [...(data[table] ?? [])].sort(
            (a, c) => a.synced_at.localeCompare(c.synced_at) || String(a[keyCol]).localeCompare(String(c[keyCol])),
          )
          if (call.or) {
            const m = /synced_at\.gt\.([^,]+),and\(synced_at\.eq\.([^,]+),\w+\.gt\.([^)]+)\)/.exec(call.or)!
            rows = rows.filter((r) => r.synced_at > m[1]! || (r.synced_at === m[2] && String(r[keyCol]) > m[3]!))
          } else if (call.gte) rows = rows.filter((r) => r.synced_at >= call.gte!)
          return resolve({ data: rows.slice(0, Math.min(limit, maxRows)), error: null, status: 200 })
        },
      }
      return b
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const base = { module_id: 'm', name: 'n', updated_at: '2026-03-10T11:00:00+01:00' }
const epoch = '1970-01-01T00:00:00.000Z'
const since = { modules: epoch, topics: epoch, cards: epoch, states: epoch }

describe('createSupabaseRemote.pullSince', () => {
  it('Server liefert Seiten kleiner als angefragt: nichts wird übersprungen, auch bei gleichem synced_at', async () => {
    const topics: Row[] = [
      { ...base, id: 'a', synced_at: '2026-03-10T10:00:00.100000+00:00' },
      { ...base, id: 'b', synced_at: '2026-03-10T10:00:00.100000+00:00' },
      { ...base, id: 'c', synced_at: '2026-03-10T10:00:00.100000+00:00' },
      { ...base, id: 'd', synced_at: '2026-03-10T10:00:01.200000+00:00' },
      { ...base, id: 'e', synced_at: '2026-03-10T10:00:02.300000+00:00' },
    ]
    const { client, calls } = stubClient({ topics }, 2)
    const res = await createSupabaseRemote(client).pullSince(since)
    expect(res.topics.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(res.topics[0]!.updatedAt).toBe('2026-03-10T10:00:00.000Z') // +01:00 normalisiert
    expect(res.cursors.topics).toBe('2026-03-10T10:00:02.300Z')
    expect(res.cursors.modules).toBeUndefined() // leere Tabelle: Cursor springt nicht
    // 3 Seiten mit Daten + 1 leere Abschlussseite
    expect(calls.filter((c) => c.table === 'topics')).toHaveLength(4)
  })

  it('Cursor bleibt unverändert, wenn nichts Neues kommt', async () => {
    const { client } = stubClient({}, 2)
    const res = await createSupabaseRemote(client).pullSince(since)
    expect(res.cursors).toEqual({})
  })

  it('4xx wird als dauerhafter, 5xx als vorübergehender Fehler klassifiziert', async () => {
    const push = (status: number) =>
      createSupabaseRemote({
        from: () => ({ upsert: async () => ({ error: { message: 'x' }, status }) }),
      } as unknown as SupabaseClient).pushLogs([
        { id: 'l', cardId: 'c', rating: 3, reviewedAt: 'r', studyDay: 'd', elapsedDays: 0 },
      ])
    await expect(push(409)).rejects.toMatchObject({ permanent: true })
    await expect(push(503)).rejects.toMatchObject({ permanent: false })
    await expect(push(429)).rejects.toBeInstanceOf(RemoteError)
    await expect(push(429)).rejects.toMatchObject({ permanent: false })
  })
})
