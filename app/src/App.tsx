import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseConfig, type SupabaseConfig } from './data/config'
import { createSupabaseRemote } from './data/remote'
import { loadOverride, saveOverride } from './data/settings'
import { sync } from './data/sync'
import type { Card } from '@lernapp/shared'
import { AskDialog } from './ui/AskDialog'
import { InstallHint } from './ui/InstallHint'
import type { Answer } from './ui/types'
import { HomeScreen, type SyncStatus } from './ui/HomeScreen'
import { LoginScreen, type AuthMode } from './ui/LoginScreen'
import { SettingsScreen } from './ui/SettingsScreen'
import { SetupScreen } from './ui/SetupScreen'
import { StudyScreen } from './ui/StudyScreen'

type View = { name: 'home' } | { name: 'study'; moduleId?: string } | { name: 'settings' }

const env = { url: import.meta.env.VITE_SUPABASE_URL as string | undefined, key: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined }

export function App() {
  // undefined = wird geladen
  const [config, setConfig] = useState<SupabaseConfig | null | undefined>(undefined)
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined)
  const [view, setView] = useState<View>({ name: 'home' })
  const [status, setStatus] = useState<SyncStatus>({ kind: 'idle' })
  const [refreshKey, setRefreshKey] = useState(0)
  const [asking, setAsking] = useState<{ card: Card; answer: Answer } | null>(null)

  const loadConfig = useCallback(async () => {
    setConfig(resolveSupabaseConfig(env, await loadOverride()))
  }, [])
  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  // Der Client wird nur neu gebaut, wenn sich URL oder Schlüssel ändern.
  const client = useMemo(
    () => (config ? createClient(config.url, config.key) : null),
    [config?.url, config?.key], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    if (!client) return
    setSignedIn(undefined)
    void client.auth.getSession().then(({ data }) => setSignedIn(data.session !== null))
    const { data } = client.auth.onAuthStateChange((_event, session) => setSignedIn(session !== null))
    return () => data.subscription.unsubscribe()
  }, [client])

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

  const getToken = useCallback(async () => (await client?.auth.getSession())?.data.session?.access_token ?? null, [client])

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
  if (config === null) {
    return (
      <main className="app">
        <SetupScreen
          onSave={async (c) => {
            await saveOverride(c)
            await loadConfig()
          }}
        />
      </main>
    )
  }
  if (signedIn === undefined) return <main className="app"><p className="muted">Lade …</p></main>
  if (!signedIn) {
    return (
      <main className="app">
        <LoginScreen onSubmit={authenticate} />
      </main>
    )
  }

  return (
    <main className="app">
      <InstallHint />
      {view.name === 'home' && (
        <HomeScreen
          sync={status}
          refreshKey={refreshKey}
          onStudy={(moduleId) => setView({ name: 'study', moduleId })}
          onSettings={() => setView({ name: 'settings' })}
          onSyncNow={() => void runSync()}
        />
      )}
      {view.name === 'study' && (
        <StudyScreen
          moduleId={view.moduleId}
          onFinished={() => void runSync()}
          onAsk={(card, answer) => setAsking({ card, answer })}
          onExit={() => {
            setRefreshKey((k) => k + 1)
            setView({ name: 'home' })
          }}
        />
      )}
      {asking && <AskDialog card={asking.card} answer={asking.answer} getToken={getToken} onClose={() => setAsking(null)} />}
      {view.name === 'settings' && (
        <SettingsScreen
          onBack={() => setView({ name: 'home' })}
          onOverrideChanged={() => void loadConfig()}
          onLogout={async () => {
            await client?.auth.signOut()
            setView({ name: 'home' })
          }}
        />
      )}
    </main>
  )
}
