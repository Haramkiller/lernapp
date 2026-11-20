import { useEffect, useState, type FormEvent } from 'react'
import type { Module } from '@lernapp/shared'
import { db } from '../data/db'
import { loadAreaChoices, saveAreaChoice } from '../data/game'
import { DEFAULT_SETTINGS, loadOverride, loadSettings, saveOverride, saveSettings } from '../data/settings'
import { BOSSES, regionOf } from '../game/bosses'

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
  const [modules, setModules] = useState<Module[]>([])
  /** moduleId → bossId; '' = automatisch. `savedAreas` ist der Stand in der Datenbank. */
  const [areas, setAreas] = useState<Record<string, string>>({})
  const [savedAreas, setSavedAreas] = useState<Record<string, string>>({})

  useEffect(() => {
    void (async () => {
      const s = await loadSettings()
      setRetention(s.retention)
      setNewPerDay(s.newPerDay)
      const o = await loadOverride()
      setUrl(o?.url ?? '')
      setKey(o?.key ?? '')
      const [mods, chosen] = await Promise.all([db.modules.toArray(), loadAreaChoices()])
      setModules(mods.sort((a, b) => a.name.localeCompare(b.name, 'de')))
      const current = Object.fromEntries(mods.map((m) => [m.id, chosen.get(m.id) ?? '']))
      setAreas(current)
      setSavedAreas(current)
    })()
  }, [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const r = Math.min(0.95, Math.max(0.8, retention))
    const n = Math.max(0, Math.round(newPerDay))
    await saveSettings({ retention: r, newPerDay: n })
    // Nur geänderte Gebiete schreiben (jede Änderung geht in den Sync).
    const t = new Date()
    for (const [moduleId, bossId] of Object.entries(areas)) {
      if (bossId !== (savedAreas[moduleId] ?? '')) await saveAreaChoice(moduleId, bossId || null, t)
    }
    setSavedAreas(areas)
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
      {modules.length > 0 && (
        <>
          <h2 className="pixel small">Gebiete</h2>
          <p className="muted">Jedes Modul hat auf der Karte ein Gebiet mit eigenem Boss.</p>
          {modules.map((m) => (
            <label key={m.id} className="field">
              <span>{`Gebiet für ${m.name}`}</span>
              <select value={areas[m.id] ?? ''} onChange={(e) => setAreas((a) => ({ ...a, [m.id]: e.target.value }))}>
                <option value="">Automatisch</option>
                {BOSSES.map((b) => (
                  <option key={b.id} value={b.id}>{`${regionOf(b).name} – ${b.title}`}</option>
                ))}
              </select>
            </label>
          ))}
        </>
      )}
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
