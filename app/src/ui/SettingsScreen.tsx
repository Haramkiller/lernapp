import { useEffect, useState, type FormEvent } from 'react'
import { DEFAULT_SETTINGS, loadOverride, loadSettings, saveOverride, saveSettings } from '../data/settings'

type Props = {
  onBack: () => void
  onLogout: () => void | Promise<void>
  /** Wird nach dem Speichern einer eigenen Datenbank aufgerufen (Verbindung neu aufbauen). */
  onOverrideChanged: () => void
}

export function SettingsScreen({ onBack, onLogout, onOverrideChanged }: Props) {
  const [retention, setRetention] = useState(DEFAULT_SETTINGS.retention)
  const [newPerDay, setNewPerDay] = useState(DEFAULT_SETTINGS.newPerDay)
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const s = await loadSettings()
      setRetention(s.retention)
      setNewPerDay(s.newPerDay)
      const o = await loadOverride()
      setUrl(o?.url ?? '')
      setKey(o?.key ?? '')
    })()
  }, [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const r = Math.min(0.95, Math.max(0.8, retention))
    const n = Math.max(0, Math.round(newPerDay))
    await saveSettings({ retention: r, newPerDay: n })
    const hadOverride = (await loadOverride()) !== null
    const wantsOverride = url.trim() !== '' && key.trim() !== ''
    await saveOverride(wantsOverride ? { url: url.trim(), key: key.trim() } : null)
    setRetention(r)
    setNewPerDay(n)
    setMessage('Gespeichert.')
    if (wantsOverride || hadOverride) onOverrideChanged()
  }

  return (
    <form onSubmit={save} className="card-panel">
      <h1 className="pixel">Einstellungen</h1>
      <label className="field">
        <span>Ziel-Behaltensrate: {Math.round(retention * 100)} %</span>
        <input
          type="range"
          min={0.8}
          max={0.95}
          step={0.01}
          value={retention}
          onChange={(e) => setRetention(Number(e.target.value))}
        />
      </label>
      <label className="field">
        <span>Neue Fragen pro Tag</span>
        <input type="number" min={0} max={200} inputMode="numeric" value={newPerDay} onChange={(e) => setNewPerDay(Number(e.target.value))} />
      </label>
      <h2 className="pixel small">Eigene Datenbank</h2>
      <p className="muted">Leer lassen, um die eingebaute Datenbank zu verwenden.</p>
      <label className="field">
        <span>Supabase-URL</span>
        <input type="text" inputMode="url" autoComplete="off" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <label className="field">
        <span>Öffentlicher Schlüssel</span>
        <input type="text" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      {message && <p role="status">{message}</p>}
      <div className="row">
        <button type="submit" className="primary">
          Speichern
        </button>
        <button type="button" onClick={onBack}>
          Zurück
        </button>
      </div>
      <h2 className="pixel small">Konto</h2>
      <p className="muted">Beim Abmelden bleiben deine Lerndaten auf diesem Gerät gespeichert.</p>
      <button type="button" onClick={() => void onLogout()}>
        Abmelden
      </button>
    </form>
  )
}
