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
import { loadLastBattleAt, saveAreaChoice } from '../../src/data/game'
import { choiceCard, pick } from './fixtures'

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
/** Erster Bildschirm nach der Anmeldung: das Titelbild. */
const home = () => screen.findByRole('button', { name: "Los geht's" })
/** Titelbild → Gewächshaus → Menü. */
async function openMenu() {
  await userEvent.click(await home())
  await userEvent.click(await screen.findByRole('button', { name: 'Menü' }))
}

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

  it('Gerät offline + Netzfehler beim Auffrischen: Übersicht mit Offline-Hinweis', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await saveSignedInMarker({ url: URL_A, userId: 'u1' })
    const { client } = fakeClient({ data: { session: null }, error: retryable() })
    render(<App env={env} makeClient={() => client} />)
    expect(await home()).toBeInTheDocument()
    await openMenu()
    expect(await screen.findByText(/Offline/)).toBeInTheDocument()
  })

  it('Gerät offline ohne Fehlerobjekt (keine Sitzung gespeichert): Anmeldung', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await saveSignedInMarker({ url: URL_A, userId: 'u1' })
    const { client } = fakeClient({ data: { session: null }, error: null })
    render(<App env={env} makeClient={() => client} />)
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
  })

  it('endgültig ungültige Sitzung (online, kein Netzfehler): Anmeldung', async () => {
    await saveSignedInMarker({ url: URL_A, userId: 'u1' })
    const { client } = fakeClient({ data: { session: null }, error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found') })
    render(<App env={env} makeClient={() => client} />)
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
  })

  it('online ohne Sitzung: Anmeldung und veraltete Anmeldemarke wird gelöscht', async () => {
    await saveSignedInMarker({ url: URL_A, userId: 'u1' })
    const { client } = fakeClient({ data: { session: null }, error: null })
    render(<App env={env} makeClient={() => client} />)
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
    await vi.waitFor(async () => expect(await db.meta.get('signedIn')).toBeUndefined())
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

describe('App: Abmelden', () => {
  it('meldet lokal ab; ein späteres TOKEN_REFRESHED meldet nicht wieder an, erst ein echtes SIGNED_IN', async () => {
    const { client, auth, emit } = fakeClient({ data: { session: session('u1') }, error: null })
    // Netzaufruf scheitert: auth-js (scope global) würde die Sitzung behalten und kein SIGNED_OUT senden
    auth.signOut.mockImplementation(async () => ({ error: retryable() }) as never)
    render(<App env={env} makeClient={() => client} />)
    await openMenu()
    await userEvent.click(await screen.findByRole('button', { name: 'Einstellungen' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Abmelden' }))
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(await db.meta.get('signedIn')).toBeUndefined()

    emit('TOKEN_REFRESHED', session('u1'))
    await act(async () => {})
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()

    emit('SIGNED_IN', session('u1'))
    expect(await home()).toBeInTheDocument()
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

describe('App: keine Sitzung aus der URL (Login-CSRF)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
  })

  it('der echte Standard-Client übernimmt keine fremde Sitzung aus dem URL-Fragment', async () => {
    // Link eines Angreifers mit dessen Tokens; auth-js prüft sie per /auth/v1/user und würde sie übernehmen
    window.history.replaceState(null, '', '/#access_token=AT&refresh_token=RT&expires_in=3600&token_type=bearer')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'attacker', aud: 'authenticated', role: 'authenticated', email: 'a@b.de' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App env={env} />) // ohne makeClient: der Client, den die App wirklich baut
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
    await act(async () => {})
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([input]) => String(input instanceof Request ? input.url : input).includes('/auth/v1/user'))).toBe(false)
    expect(await db.meta.get('owner')).toBeUndefined()
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
    // Erst auf den neuen Client warten: Vorher zeigt die App kurz noch die alte Anmeldeseite bzw. „Lade …“.
    await vi.waitFor(() => expect(made.at(-1)).toBe('https://b.supabase.co'))
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
    expect(await loadOverride()).toEqual({ url: 'https://b.supabase.co', key: 'anon-b' })
  }, 15_000) // tippt viele Zeichen einzeln; unter Last (CI) reichen die 5 s Standard nicht

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
    // Erst auf den neuen Client warten, dann auf die Anmeldeseite (unter Last dauert der Wechsel länger als 1 s).
    await vi.waitFor(() => expect(made.at(-1)).toBe(URL_A), { timeout: 5_000 })
    expect(await screen.findByRole('heading', { name: 'Anmelden' }, { timeout: 5_000 })).toBeInTheDocument()
    expect(await loadOverride()).toBeNull()
  })
})

/** Gewächshaus → Tür → Lagerfeuer. */
async function toCamp() {
  await userEvent.click(await screen.findByRole('button', { name: '↑ Vorwärts' }))
  await userEvent.click(await screen.findByRole('button', { name: '↑ Zum Lagerfeuer' }))
}

describe('App: Titelbild, Lagerfeuer, Kampf', () => {
  it('Titelbild → Gewächshaus → Tür → Lagerfeuer → zurück ins Gewächshaus', async () => {
    const { client } = fakeClient({ data: { session: session('u1') }, error: null })
    render(<App env={env} makeClient={() => client} />)
    await userEvent.click(await home())
    expect(await screen.findByText('Eingang')).toBeInTheDocument()
    await toCamp()
    expect(await screen.findByRole('button', { name: 'Lagerfeuer – Karte öffnen' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Gewächshaus' }))
    expect(await screen.findByText('Eingang')).toBeInTheDocument()
  })

  it('Einstellungen „Zurück“ führt in die Szene, aus der man kam', async () => {
    const { client } = fakeClient({ data: { session: session('u1') }, error: null })
    render(<App env={env} makeClient={() => client} />)
    await openMenu()
    await userEvent.click(await screen.findByRole('button', { name: 'Einstellungen' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Zurück' }))
    expect(await screen.findByText('Eingang')).toBeInTheDocument()
    await toCamp()
    await userEvent.click(await screen.findByRole('button', { name: 'Menü' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Einstellungen' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Zurück' }))
    expect(await screen.findByRole('button', { name: 'Lagerfeuer – Karte öffnen' })).toBeInTheDocument()
  })

  it('nach einem Kampf mit einer Antwort zurück ans Feuer; der Zeitpunkt für „Ausgeruht“ ist gespeichert', async () => {
    const iso = new Date().toISOString()
    await db.modules.put({ id: 'm1', name: 'Botanik', examDate: null, styleProfile: null, updatedAt: iso })
    await saveAreaChoice('m1', 'moosgolem', new Date())
    await db.cards.bulkPut([choiceCard('a'), choiceCard('b')])
    const { client } = fakeClient({ data: { session: session('u1') }, error: null })
    render(<App env={env} makeClient={() => client} />)
    await userEvent.click(await home())
    await toCamp()
    await userEvent.click(await screen.findByRole('button', { name: 'Lagerfeuer – Karte öffnen' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Wald: Botanik' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Kämpfen' }))
    await pick(await screen.findByRole('button', { name: /Richtig B/ }))
    await screen.findByRole('button', { name: 'Weiter' })
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Beenden' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Beenden' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Zur Übersicht' }))
    expect(await screen.findByRole('button', { name: 'Lagerfeuer – Karte öffnen' })).toBeInTheDocument()
    await vi.waitFor(async () => expect(await loadLastBattleAt()).not.toBeNull())
  })
})
