import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { db } from '../src/data/db'
import {
  clearSignedInMarker,
  ensureOwner,
  OWNER_CHANGE_WARNING,
  saveSignedInMarker,
  staysSignedInOffline,
} from '../src/data/account'
import { choiceCard } from './ui/fixtures'

const A = { url: 'https://a.supabase.co', userId: 'u1' }

beforeEach(async () => {
  await Promise.all([db.cards.clear(), db.states.clear(), db.outbox.clear(), db.meta.clear(), db.modules.clear(), db.topics.clear(), db.dead.clear()])
})

async function seedUserData() {
  await db.modules.put({ id: 'm1', name: 'M', updatedAt: '2026-03-01T10:00:00.000Z' } as never)
  await db.cards.put(choiceCard('c1'))
  await db.meta.bulkPut([
    { key: 'lastPull:cards', value: '2026-03-10T10:00:00.000Z' },
    { key: 'newDone:2026-03-10', value: 3 },
    { key: 'settings', value: { retention: 0.85, newPerDay: 10 } },
    { key: 'supabaseOverride', value: { url: 'https://b.supabase.co', key: 'k' } },
  ])
}

describe('ensureOwner', () => {
  it('erstes Konto auf dem Gerät übernimmt die vorhandenen Daten', async () => {
    await seedUserData()
    expect(await ensureOwner(A, vi.fn())).toBe(true)
    expect(await db.cards.count()).toBe(1)
    expect((await db.meta.get('owner'))?.value).toEqual(A)
  })

  it('gleiches Konto behält die Daten', async () => {
    await db.meta.put({ key: 'owner', value: A })
    await seedUserData()
    await db.outbox.add({ kind: 'log', payload: { id: 'l', cardId: 'c1', rating: 3, reviewedAt: 'r', studyDay: 'd', elapsedDays: 0 } })
    const confirm = vi.fn()
    expect(await ensureOwner({ ...A }, confirm)).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
    expect(await db.cards.count()).toBe(1)
    expect(await db.outbox.count()).toBe(1)
    expect(await db.meta.get('lastPull:cards')).toBeDefined()
  })

  it('anderes Konto: Lerndaten, Outbox, Quarantäne und Pull-Cursor werden gelöscht', async () => {
    await db.meta.put({ key: 'owner', value: A })
    await seedUserData()
    await db.dead.add({ kind: 'log', payload: { id: 'l', cardId: 'c1', rating: 3, reviewedAt: 'r', studyDay: 'd', elapsedDays: 0 }, error: 'x' })
    await db.logs.put({ id: 'l', cardId: 'c1', rating: 3, reviewedAt: 'r', studyDay: 'd', elapsedDays: 0, confidence: 'sure', outcome: 'right' })
    const confirm = vi.fn()
    const other = { url: A.url, userId: 'u2' }
    expect(await ensureOwner(other, confirm)).toBe(true)
    expect(confirm).not.toHaveBeenCalled() // Outbox leer: nichts geht verloren
    expect(await db.cards.count()).toBe(0)
    expect(await db.modules.count()).toBe(0)
    expect(await db.dead.count()).toBe(0)
    expect(await db.logs.count()).toBe(0)
    expect(await db.meta.get('lastPull:cards')).toBeUndefined()
    expect(await db.meta.get('newDone:2026-03-10')).toBeUndefined()
    expect((await db.meta.get('owner'))?.value).toEqual(other)
    // Geräteeinstellungen bleiben
    expect(await db.meta.get('settings')).toBeDefined()
    expect(await db.meta.get('supabaseOverride')).toBeDefined()
  })

  it('andere Datenbank (gleiche Nutzer-ID) gilt als anderer Eigentümer', async () => {
    await db.meta.put({ key: 'owner', value: A })
    await seedUserData()
    expect(await ensureOwner({ url: 'https://b.supabase.co', userId: 'u1' }, vi.fn())).toBe(true)
    expect(await db.cards.count()).toBe(0)
  })

  it('anderes Konto mit nicht synchronisierten Änderungen fragt nach; Abbrechen behält alles', async () => {
    await db.meta.put({ key: 'owner', value: A })
    await seedUserData()
    await db.outbox.add({ kind: 'log', payload: { id: 'l', cardId: 'c1', rating: 3, reviewedAt: 'r', studyDay: 'd', elapsedDays: 0 } })
    const confirm = vi.fn(() => false)
    expect(await ensureOwner({ url: A.url, userId: 'u2' }, confirm)).toBe(false)
    expect(confirm).toHaveBeenCalledWith(OWNER_CHANGE_WARNING)
    expect(await db.cards.count()).toBe(1)
    expect(await db.outbox.count()).toBe(1)
    expect((await db.meta.get('owner'))?.value).toEqual(A)

    confirm.mockReturnValue(true)
    expect(await ensureOwner({ url: A.url, userId: 'u2' }, confirm)).toBe(true)
    expect(await db.outbox.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
  })

  it('gleichzeitige Aufrufe fragen nur einmal', async () => {
    await db.meta.put({ key: 'owner', value: A })
    await db.outbox.add({ kind: 'log', payload: { id: 'l', cardId: 'c1', rating: 3, reviewedAt: 'r', studyDay: 'd', elapsedDays: 0 } })
    const confirm = vi.fn(() => true)
    const other = { url: A.url, userId: 'u2' }
    expect(await Promise.all([ensureOwner(other, confirm), ensureOwner(other, confirm)])).toEqual([true, true])
    expect(confirm).toHaveBeenCalledTimes(1)
  })
})

describe('staysSignedInOffline', () => {
  const retryable = new AuthRetryableFetchError('Failed to fetch', 0)

  it('Netzfehler beim Auffrischen + Anmeldemarke für diese Datenbank → angemeldet bleiben', async () => {
    await saveSignedInMarker(A)
    expect(await staysSignedInOffline(retryable, A.url, true)).toBe(true)
  })

  it('offline ohne Fehlerobjekt (keine Sitzung gespeichert) → nicht angemeldet, trotz Marke', async () => {
    await saveSignedInMarker(A)
    expect(await staysSignedInOffline(null, A.url, false)).toBe(false)
  })

  it('ohne Marke, mit Marke einer anderen Datenbank oder nach Abmelden → nicht angemeldet', async () => {
    expect(await staysSignedInOffline(retryable, A.url, false)).toBe(false)
    await saveSignedInMarker(A)
    expect(await staysSignedInOffline(retryable, 'https://b.supabase.co', false)).toBe(false)
    await clearSignedInMarker()
    expect(await staysSignedInOffline(retryable, A.url, false)).toBe(false)
  })

  it('endgültiger Fehler (online) → nicht angemeldet', async () => {
    await saveSignedInMarker(A)
    expect(await staysSignedInOffline(new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'), A.url, true)).toBe(false)
    expect(await staysSignedInOffline(null, A.url, true)).toBe(false)
  })
})
