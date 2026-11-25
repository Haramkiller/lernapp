import { useState } from 'react'
import { LoginScreen, type AuthMode, type AuthResult } from './LoginScreen'

type Props = {
  /** Wirft bei Fehlern; 'confirm' = Konto angelegt, E-Mail muss noch bestätigt werden. */
  onSubmit: (mode: AuthMode, email: string, password: string) => Promise<AuthResult>
  /** Adresse der eigenen Datenbank, falls eine eingetragen ist (sonst eingebaute). */
  database?: string
  /** Öffnet die Einrichtung für eine eigene Datenbank. */
  onUseOwnDatabase?: () => void
}

type Step = 'welcome' | 'signIn' | 'signUp' | 'confirm' | 'signInAfter'

const Progress = ({ n }: { n: 1 | 2 | 3 }) => <p className="muted pixel step-progress">Schritt {n} von 3</p>

/** Start für Abgemeldete: Willkommen, dann Anmelden oder Schritt für Schritt ein Konto anlegen. */
export function WelcomeFlow({ onSubmit, database, onUseOwnDatabase }: Props) {
  const [step, setStep] = useState<Step>('welcome')
  const [email, setEmail] = useState('')
  const home = () => setStep('welcome')

  if (step === 'signIn' || step === 'signInAfter') {
    const after = step === 'signInAfter'
    return (
      <LoginScreen
        mode="signIn"
        title="Anmelden"
        submitLabel="Anmelden"
        initialEmail={after ? email : ''}
        onSubmit={async (e, p) => onSubmit('signIn', e, p)}
        onBack={after ? () => setStep('confirm') : home}
      >
        {after && <Progress n={3} />}
      </LoginScreen>
    )
  }

  if (step === 'signUp') {
    return (
      <LoginScreen
        mode="signUp"
        title="Konto anlegen"
        submitLabel="Konto anlegen"
        initialEmail={email}
        onSubmit={async (e, p) => {
          const result = await onSubmit('signUp', e, p)
          setEmail(e)
          // Ohne Bestätigung ist die App jetzt angemeldet und wechselt von selbst ins Spiel.
          if (result === 'confirm') setStep('confirm')
        }}
        onBack={home}
      >
        <Progress n={1} />
        <p>Mit dieser E-Mail und diesem Passwort meldest du dich später an, auch am PC.</p>
      </LoginScreen>
    )
  }

  if (step === 'confirm') {
    return (
      <section className="card-panel">
        <h1 className="pixel">E-Mail bestätigen</h1>
        <Progress n={2} />
        <p>Wir haben dir eine Mail an {email} geschickt. Tippe auf den Link darin und komm dann hierher zurück.</p>
        <p className="muted">Keine Mail? Schau im Spam-Ordner nach.</p>
        <p className="muted">Öffnet der Link eine Fehlerseite („Verbindung abgelehnt“), ist deine Mail trotzdem bestätigt.</p>
        <div className="row">
          <button type="button" className="primary" onClick={() => setStep('signInAfter')}>
            Ich habe bestätigt – weiter
          </button>
          <button type="button" onClick={() => setStep('signUp')}>
            Zurück
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="card-panel welcome">
      <h1 className="pixel">Willkommen bei Lernabenteuer</h1>
      <p>Lerne mit deinen eigenen Karten, besiege Bosse und lass dein Gewächshaus wachsen.</p>
      <div className="welcome-choices">
        <button type="button" className="primary" onClick={() => setStep('signUp')}>
          Ich bin neu
        </button>
        <button type="button" onClick={() => setStep('signIn')}>
          Ich habe schon ein Konto
        </button>
      </div>
      {database && <p className="muted">Eigene Datenbank: {database}</p>}
      {onUseOwnDatabase && (
        <button type="button" className="link" onClick={onUseOwnDatabase}>
          Eigene Datenbank verwenden
        </button>
      )}
    </section>
  )
}
