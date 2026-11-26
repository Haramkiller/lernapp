import { useState, type FormEvent, type ReactNode } from 'react'

export type AuthMode = 'signIn' | 'signUp'
/** 'confirm' = Konto angelegt, die E-Mail muss noch bestätigt werden. */
export type AuthResult = 'confirm' | void

type Props = {
  mode: AuthMode
  title: string
  submitLabel: string
  initialEmail?: string
  /** Wirft bei Fehlern. */
  onSubmit: (email: string, password: string) => Promise<AuthResult>
  onBack?: () => void
  /** Text unter der Überschrift (z. B. Fortschritt, Erklärung). */
  children?: ReactNode
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Häufige englische Meldungen von Supabase auf Deutsch; Unbekanntes bleibt wie es ist. */
function explain(text: string): string {
  if (/invalid login credentials/i.test(text)) return 'E-Mail oder Passwort stimmen nicht.'
  if (/already registered/i.test(text)) return 'Diese E-Mail hat schon ein Konto. Geh zurück und wähle „Ich habe schon ein Konto“.'
  return text
}

/** Formular für Anmelden oder Konto anlegen; welcher Fall gilt, bestimmt der Aufrufer (WelcomeFlow). */
export function LoginScreen({ mode, title, submitLabel, initialEmail = '', onSubmit, onBack, children }: Props) {
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit(email.trim(), password)
    } catch (err) {
      const text = message(err)
      setError(
        /not confirmed/i.test(text)
          ? 'Deine E-Mail ist noch nicht bestätigt. Tippe zuerst auf den Link in der Mail.'
          : `${mode === 'signIn' ? 'Anmeldung' : 'Registrierung'} fehlgeschlagen: ${explain(text)}`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card-panel">
      <h1 className="pixel">{title}</h1>
      {children}
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
      {error && (
        <p role="alert" className="warn">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="primary" disabled={busy}>
          {submitLabel}
        </button>
        {onBack && (
          <button type="button" onClick={onBack}>
            Zurück
          </button>
        )}
      </div>
    </form>
  )
}
