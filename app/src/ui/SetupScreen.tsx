import { useState, type FormEvent } from 'react'
import type { SupabaseConfig } from '../data/config'

type Props = {
  onSave: (config: SupabaseConfig) => void | Promise<void>
  /** Bereits eingetragene eigene Datenbank (zum Bearbeiten). */
  initial?: SupabaseConfig | null
  /** Zurück zur Anmeldung (nur wenn es eine eingebaute oder gespeicherte Datenbank gibt). */
  onBack?: () => void
  /** Eigene Datenbank entfernen und die eingebaute verwenden. */
  onReset?: () => void | Promise<void>
}

export function SetupScreen({ onSave, initial, onBack, onReset }: Props) {
  const [url, setUrl] = useState(initial?.url ?? '')
  const [key, setKey] = useState(initial?.key ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!/^https?:\/\/\S+$/.test(url.trim())) {
      setError('Bitte eine gültige URL eingeben (https://…).')
      return
    }
    if (!key.trim()) {
      setError('Bitte den öffentlichen Schlüssel eingeben.')
      return
    }
    setError(null)
    void onSave({ url: url.trim(), key: key.trim() })
  }

  return (
    <form onSubmit={submit} className="card-panel">
      <h1 className="pixel">Einrichtung</h1>
      <p>Trage die Adresse und den öffentlichen (anon) Schlüssel deiner Supabase-Datenbank ein.</p>
      <label className="field">
        <span>Supabase-URL</span>
        <input type="text" inputMode="url" autoComplete="off" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <label className="field">
        <span>Öffentlicher Schlüssel</span>
        <input type="text" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      {error && <p role="alert" className="warn">{error}</p>}
      <div className="row">
        <button type="submit" className="primary">
          Speichern
        </button>
        {onBack && (
          <button type="button" onClick={onBack}>
            Zurück
          </button>
        )}
      </div>
      {onReset && (
        <button type="button" className="link" onClick={() => void onReset()}>
          Eingebaute Datenbank verwenden
        </button>
      )}
    </form>
  )
}
