// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthApiError, AuthRetryableFetchError, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { App } from '../../src/App'
import { db } from '../../src/data/db'
import { saveSignedInMarker } from '../../src/data/account'
import { loadOverride, saveOverride } from '../../src/data/settings'

const URL_A = 'https://a.supabase.co'
const env = { url: URL_A, key: 'anon-a' }

type GetSession = { data: { session: Session | null }; error: unknown }
const session = (userId: string) => ({ access_token: 't', user: { id: userId } }) as unknown as Session

/** Ersatz für den Supabase-Client: nur die Auth-Teile, die App nutzt; Datenzugriff scheitert (offline). */
function fakeClient(initial: GetSession) {
  const listeners: ((e: AuthChangeEvent, s: Session | null) => void)[] = []
  const client = {
    auth: {
      getSession: vi.fn(async () => initial),
      onAuthStateChange: vi.fn((cb: (e: AuthChangeEvent, s: Session | null) => void) => {
        listeners.push(cb)
        // auth-js meldet bei gescheitertem Auffrischen INITIAL_SESSION mit null
        queueMicrotask(() => cb('INITIAL_SESSION', initial.data.session))
        return { data: { subscription: { unsubscribe: () => listeners.splice(listeners.indexOf(cb), 1) } } }
      }),
      signOut: vi.fn(async () => {
        listeners.forEach((cb) => cb('SIGNED_OUT', null))
        return { error: null }
      }),
      signInWithPassword: vi.fn(async () => ({ data: {}, error: null })),
      signUp: vi.fn(),
    },
    from: () => {
      throw new Error('Failed to fetch')
    },
  }
  const emit = (e: AuthChangeEvent, s: Session | null) => act(() => listeners.forEach((cb) => cb(e, s)))
  return { client: client as unknown as SupabaseClient, auth: client.auth, emit }
}

const retryable = () => new AuthRetryableFetchError('Failed to fetch', 0)
const home = () => screen.findByRole('button', { name: /Einstellungen/ })

beforeEach(async () => {
  await Promise.all([db.cards.clear(), db.states.clear(), db.outbox.clear(), db.meta.clear(), db.modules.clear(), db.topics.clear(), db.dead.clear()])
})
afterEach(() => vi.restoreAllMocks())

describe('App: Offline-Start', () => {
  it('abgelaufenes Token + Netzfehler beim Auffrischen: Übersicht statt Anmeldung', async () => {
    await saveSignedInMarker({ url: URL_A, userId: 'u1' })
    const { client } = fakeClient({ data: { session: null }, error: retryable() })
    render(<App env={env} makeClient={() => client} />)
    expect(await home()).toBeInTheDocument()
    // INITIAL_SESSION mit null darf nicht nachträglich zur Anmeldung wechseln
    await act(async () => {})
    expect(screen.queryByRole('heading', { name: 'Anmelden' })).not.toBeInTheDocument()
  })

  it('Gerät offline ohne Fehlerobjekt: Übersicht', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await saveSignedInMarker({ url: URL_A, userId: 'u1' })
    const { client } = fakeClient({ data: { session: null }, error: null })
    render(<App env={env} makeClient={() => client} />)
    expect(await home()).toBeInTheDocument()
    expect(await screen.findByText(/Offline/)).toBeInTheDocument()
  })

  it('endgültig ungültige Sitzung (online, kein Netzfehler): Anmeldung', async () => {
    await saveSignedInMarker({ url: URL_A, userId: 'u1' })
    const { client } = fakeClient({ data: { session: null }, error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found') })
    render(<App env={env} makeClient={() => client} />)
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
  })

  it('Netzfehler, aber nie angemeldet: Anmeldung', async () => {
    const { client } = fakeClient({ data: { session: null }, error: retryable() })
    render(<App env={env} makeClient={() => client} />)
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
  })

  it('scheitert das Auffrischen später endgültig (SIGNED_OUT): Anmeldung', async () => {
    await saveSignedInMarker({ url: URL_A, userId: 'u1' })
    const { client, emit } = fakeClient({ data: { session: null }, error: retryable() })
    render(<App env={env} makeClient={() => client} />)
    await home()
    emit('SIGNED_OUT', null)
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
    expect(await db.meta.get('signedIn')).toBeUndefined()
  })

  it('Sitzung vorhanden: Anmeldemarke und Eigentümer werden gespeichert', async () => {
    const { client } = fakeClient({ data: { session: session('u1') }, error: null })
    render(<App env={env} makeClient={() => client} />)
    await home()
    await vi.waitFor(async () => expect((await db.meta.get('signedIn'))?.value).toEqual({ url: URL_A, userId: 'u1' }))
    expect((await db.meta.get('owner'))?.value).toEqual({ url: URL_A, userId: 'u1' })
  })
})

describe('App: Kontowechsel', () => {
  it('anderes Konto mit offenen Änderungen: Warnung; Abbrechen meldet das neue Konto lokal ab', async () => {
    await db.meta.put({ key: 'owner', value: { url: URL_A, userId: 'u1' } })
    await db.outbox.add({ kind: 'log', payload: { id: 'l', cardId: 'c1', rating: 3, reviewedAt: 'r', studyDay: 'd', elapsedDays: 0 } })
    const confirm = vi.fn(() => false)
    const { client, auth, emit } = fakeClient({ data: { session: null }, error: null })
    render(<App env={env} makeClient={() => client} confirm={confirm} />)
    await screen.findByRole('heading', { name: 'Anmelden' })
    emit('SIGNED_IN', session('u2'))
    await vi.waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
    expect(await db.outbox.count()).toBe(1)
  })

  it('anderes Konto, bestätigt: alte Daten weg, Übersicht', async () => {
    await db.meta.put({ key: 'owner', value: { url: URL_A, userId: 'u1' } })
    await db.meta.put({ key: 'lastPull:cards', value: '2026-03-10T10:00:00.000Z' })
    await db.outbox.add({ kind: 'log', payload: { id: 'l', cardId: 'c1', rating: 3, reviewedAt: 'r', studyDay: 'd', elapsedDays: 0 } })
    const { client, emit } = fakeClient({ data: { session: null }, error: null })
    render(<App env={env} makeClient={() => client} confirm={() => true} />)
    await screen.findByRole('heading', { name: 'Anmelden' })
    emit('SIGNED_IN', session('u2'))
    expect(await home()).toBeInTheDocument()
    expect(await db.outbox.count()).toBe(0)
    expect(await db.meta.get('lastPull:cards')).toBeUndefined()
  })
})

describe('App: eigene Datenbank vor der Anmeldung', () => {
  it('Link auf der Anmeldeseite öffnet die Einrichtung; Speichern verbindet neu; Zurück möglich', async () => {
    const made: string[] = []
    const makeClient = (url: string) => {
      made.push(url)
      return fakeClient({ data: { session: null }, error: null }).client
    }
    render(<App env={env} makeClient={makeClient} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Eigene Datenbank verwenden' }))
    expect(screen.getByRole('heading', { name: 'Einrichtung' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Eigene Datenbank verwenden' }))
    await userEvent.type(screen.getByLabelText('Supabase-URL'), 'https://b.supabase.co')
    await userEvent.type(screen.getByLabelText('Öffentlicher Schlüssel'), 'anon-b')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
    expect(await loadOverride()).toEqual({ url: 'https://b.supabase.co', key: 'anon-b' })
    await vi.waitFor(() => expect(made.at(-1)).toBe('https://b.supabase.co'))
  })

  it('mit eigener Datenbank: zurück zur eingebauten', async () => {
    await saveOverride({ url: 'https://b.supabase.co', key: 'anon-b' })
    const made: string[] = []
    const makeClient = (url: string) => {
      made.push(url)
      return fakeClient({ data: { session: null }, error: null }).client
    }
    render(<App env={env} makeClient={makeClient} />)
    expect(await screen.findByText(/b\.supabase\.co/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Eigene Datenbank verwenden' }))
    expect(screen.getByLabelText('Supabase-URL')).toHaveValue('https://b.supabase.co')
    await userEvent.click(screen.getByRole('button', { name: 'Eingebaute Datenbank verwenden' }))
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
    expect(await loadOverride()).toBeNull()
    await vi.waitFor(() => expect(made.at(-1)).toBe(URL_A))
  })
})
