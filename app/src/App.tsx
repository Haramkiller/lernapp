import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { createAskTicket } from './ask/askTicket'
import { clearSignedInMarker, ensureOwner, saveSignedInMarker, staysSignedInOffline } from './data/account'
import { resolveSupabaseConfig, type SupabaseConfig } from './data/config'
import { createSupabaseRemote } from './data/remote'
import { loadOverride, saveOverride } from './data/settings'
import { sync } from './data/sync'
import { saveLastBattleAt } from './data/game'
import { AskDialog } from './ui/AskDialog'
import { InstallHint } from './ui/InstallHint'
import { CampScreen, type SyncStatus } from './ui/CampScreen'
import { TitleScreen } from './ui/TitleScreen'
import { LoginScreen, type AuthMode } from './ui/LoginScreen'
import { SettingsScreen } from './ui/SettingsScreen'
import { SetupScreen } from './ui/SetupScreen'
import { BattleScreen } from './ui/BattleScreen'

type View = { name: 'title' } | { name: 'camp' } | { name: 'study'; moduleId?: string; rested: boolean } | { name: 'settings' }

const defaultEnv = { url: import.meta.env.VITE_SUPABASE_URL as string | undefined, key: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined }

// Keine Sitzung aus der URL übernehmen: Sonst meldet ein Link mit fremden Tokens im Fragment (#access_token=…)
// unbemerkt im Konto des Absenders an (Login-CSRF). Die App meldet nur per Passwort an.
const createAppClient = (url: string, key: string) => createClient(url, key, { auth: { detectSessionInUrl: false } })

type Props = {
  /** Eingebaute Datenbank (Build-Variablen); für Tests austauschbar. */
  env?: { url?: string; key?: string }
  makeClient?: (url: string, key: string) => SupabaseClient
  /** Rückfrage vor dem Verwerfen nicht synchronisierter Daten eines anderen Kontos. */
  confirm?: (message: string) => boolean
}

export function App({ env = defaultEnv, makeClient = createAppClient, confirm = (m) => window.confirm(m) }: Props = {}) {
  // undefined = wird geladen
  const [config, setConfig] = useState<SupabaseConfig | null | undefined>(undefined)
  const [override, setOverride] = useState<SupabaseConfig | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined)
  const [view, setView] = useState<View>({ name: 'title' })
  const [status, setStatus] = useState<SyncStatus>({ kind: 'idle' })
  const [refreshKey, setRefreshKey] = useState(0)

  const loadConfig = useCallback(async () => {
    const o = await loadOverride()
    setOverride(o)
    setConfig(resolveSupabaseConfig(env, o))
  }, [env.url, env.key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  // Der Client wird nur neu gebaut, wenn sich URL oder Schlüssel ändern.
  const client = useMemo(
    () => (config ? makeClient(config.url, config.key) : null),
    [config?.url, config?.key], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const signedInRef = useRef<boolean | undefined>(undefined)
  const confirmRef = useRef(confirm)
  confirmRef.current = confirm

  useEffect(() => {
    if (!client || !config) return
    let active = true
    const url = config.url
    const set = (v: boolean) => {
      if (!active) return
      signedInRef.current = v
      setSignedIn(v)
    }
    signedInRef.current = undefined
    setSignedIn(undefined)

    // Angemeldet: Daten gehören diesem Konto (sonst nach Rückfrage leeren), Anmeldemarke für den Offline-Start setzen.
    const enter = async (session: Session) => {
      const owner = { url, userId: session.user.id }
      if (!(await ensureOwner(owner, confirmRef.current))) {
        await client.auth.signOut({ scope: 'local' })
        return set(false)
      }
      await saveSignedInMarker(owner)
      set(true)
    }

    void (async () => {
      const { data, error } = await client.auth.getSession()
      if (data.session) return enter(data.session)
      // Abgelaufenes Token und kein Netz: auth-js liefert null + Netzfehler. Offline weiterlernen.
      set(await staysSignedInOffline(error, url, navigator.onLine))
    })().catch(() => set(false))

    const { data } = client.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION entspricht getSession oben; sein null unterscheidet nicht zwischen offline und abgemeldet.
      if (event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_OUT') {
        void clearSignedInMarker()
        return set(false)
      }
      // TOKEN_REFRESHED o. Ä. meldet nicht wieder an, wenn man abgemeldet ist; dafür braucht es ein SIGNED_IN.
      if (event !== 'SIGNED_IN' && !signedInRef.current) return
      if (session) void enter(session).catch(() => set(false))
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [client]) // eslint-disable-line react-hooks/exhaustive-deps

  const running = useRef(false)
  const runSync = useCallback(async () => {
    if (!client || running.current) return
    if (!navigator.onLine) {
      setStatus({ kind: 'offline' })
      return
    }
    running.current = true
    setStatus({ kind: 'syncing' })
    try {
      const result = await sync(createSupabaseRemote(client), new Date())
      setStatus(result.pushError ? { kind: 'error', message: result.pushError } : { kind: 'ok', at: new Date() })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      running.current = false
      setRefreshKey((k) => k + 1)
    }
  }, [client])

  // Sync nach Anmeldung und sobald das Netz zurückkommt; Lernen wird nie darauf blockiert.
  useEffect(() => {
    if (!signedIn) return
    void runSync()
    const online = () => void runSync()
    const offline = () => setStatus({ kind: 'offline' })
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [signedIn, runSync])

  const getTicket = useCallback(async () => (client ? createAskTicket(client) : null), [client])

  const authenticate = async (mode: AuthMode, email: string, password: string): Promise<string | void> => {
    if (!client) return
    if (mode === 'signIn') {
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (error) throw error
      return
    }
    const { data, error } = await client.auth.signUp({ email, password })
    if (error) throw error
    if (!data.session) return 'Fast geschafft: Bestätige deine E-Mail-Adresse über den Link in der Nachricht und melde dich dann an.'
  }

  if (config === undefined) return <main className="app"><p className="muted">Lade …</p></main>
  if (config === null || (setupOpen && !signedIn)) {
    const close = async () => {
      setSetupOpen(false)
      await loadConfig()
    }
    return (
      <main className="app">
        <SetupScreen
          initial={override}
          onSave={async (c) => {
            await saveOverride(c)
            await close()
          }}
          onBack={config ? () => setSetupOpen(false) : undefined}
          onReset={
            override && env.url && env.key
              ? async () => {
                  await saveOverride(null)
                  await close()
                }
              : undefined
          }
        />
      </main>
    )
  }
  if (signedIn === undefined) return <main className="app"><p className="muted">Lade …</p></main>
  if (!signedIn) {
    return (
      <main className="app">
        <LoginScreen onSubmit={authenticate} database={override?.url} onUseOwnDatabase={() => setSetupOpen(true)} />
      </main>
    )
  }

  return (
    <main className="app">
      <InstallHint />
      {view.name === 'title' && <TitleScreen refreshKey={refreshKey} onStart={() => setView({ name: 'camp' })} />}
      {view.name === 'camp' && (
        <CampScreen
          sync={status}
          refreshKey={refreshKey}
          onBattle={(moduleId, rested) => setView({ name: 'study', moduleId, rested })}
          onSettings={() => setView({ name: 'settings' })}
          onSyncNow={() => void runSync()}
        />
      )}
      {view.name === 'study' && (
        <BattleScreen
          moduleId={view.moduleId}
          rested={view.rested}
          onFinished={(answered) => {
            // Erst danach synchronisieren, damit der Zeitpunkt für „Ausgeruht“ gleich mitgeht.
            void (answered > 0 ? saveLastBattleAt(new Date()) : Promise.resolve())
              .catch(() => undefined)
              .then(() => runSync())
          }}
          renderAsk={(card, answer, close) => <AskDialog key={card.id} card={card} answer={answer} getTicket={getTicket} onClose={close} />}
          onExit={() => {
            setRefreshKey((k) => k + 1)
            setView({ name: 'camp' })
          }}
        />
      )}
      {view.name === 'settings' && (
        <SettingsScreen
          onBack={() => setView({ name: 'camp' })}
          onOverrideChanged={() => void loadConfig()}
          onLogout={async () => {
            // scope local: auth-js entfernt die gespeicherte Sitzung auch ohne Netz (global bräche vorher ab).
            await client?.auth.signOut({ scope: 'local' })
            await clearSignedInMarker()
            signedInRef.current = false
            setSignedIn(false)
            setView({ name: 'title' })
          }}
        />
      )}
    </main>
  )
}
