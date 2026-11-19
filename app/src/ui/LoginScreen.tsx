import { useState, type FormEvent } from 'react'

export type AuthMode = 'signIn' | 'signUp'

type Props = {
  /** Wirft bei Fehlern; ein zurückgegebener Text wird als Hinweis angezeigt. */
  onSubmit: (mode: AuthMode, email: string, password: string) => Promise<string | void>
}

export function LoginScreen({ onSubmit }: Props) {
  const [mode, setMode] = useState<AuthMode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const msg = await onSubmit(mode, email.trim(), password)
      if (msg) setInfo(msg)
    } catch (err) {
      setError(`${mode === 'signIn' ? 'Anmeldung' : 'Registrierung'} fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card-panel">
      <h1 className="pixel">{mode === 'signIn' ? 'Anmelden' : 'Registrieren'}</h1>
      <label className="field">
        <span>E-Mail</span>
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Passwort</span>
        <input
          type="password"
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p role="alert" className="warn">{error}</p>}
      {info && <p role="status">{info}</p>}
      <button type="submit" className="primary" disabled={busy}>
        {mode === 'signIn' ? 'Anmelden' : 'Registrieren'}
      </button>
      <button type="button" className="link" onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
        {mode === 'signIn' ? 'Noch kein Konto? Registrieren' : 'Schon ein Konto? Anmelden'}
      </button>
    </form>
  )
}
