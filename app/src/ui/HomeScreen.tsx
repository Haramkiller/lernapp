import { useEffect, useState } from 'react'
import { db } from '../data/db'
import { loadSettings } from '../data/settings'
import { newDoneKey } from '../session/queue'
import { moduleProgress, todayCounts, type ModuleProgress } from '../session/stats'

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'ok'; at: Date }
  | { kind: 'offline' }
  | { kind: 'error'; message: string }

type Props = {
  now?: () => Date
  sync: SyncStatus
  /** Erhöhen, um die Anzeige neu zu laden (z. B. nach einem Sync). */
  refreshKey?: number
  onStudy: (moduleId?: string) => void
  onSettings: () => void
  onSyncNow?: () => void
}

type Data = { due: number; fresh: number; modules: ModuleProgress[]; dead: number }

function syncText(s: SyncStatus): string {
  switch (s.kind) {
    case 'idle':
      return 'Noch nicht synchronisiert'
    case 'syncing':
      return 'Synchronisiere …'
    case 'ok':
      return `Zuletzt synchronisiert: ${s.at.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
    case 'offline':
      return 'Offline: deine Antworten werden später synchronisiert'
    case 'error':
      return `Synchronisierung fehlgeschlagen: ${s.message}`
  }
}

export function HomeScreen({ now = () => new Date(), sync, refreshKey = 0, onStudy, onSettings, onSyncNow }: Props) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
      const t = now()
      const [cards, rows, modules, settings, dead] = await Promise.all([
        db.cards.toArray(),
        db.states.toArray(),
        db.modules.toArray(),
        loadSettings(),
        db.dead.count(),
      ])
      const states = new Map(rows.map((r) => [r.cardId, r.state]))
      const newDoneToday = ((await db.meta.get(newDoneKey(t)))?.value as number | undefined) ?? 0
      const counts = todayCounts({ cards, states, newDoneToday, now: t, settings })
      const progress = moduleProgress(modules, cards, states, t, settings.retention)
      if (!cancelled) {
        setError(null)
        setData({ ...counts, modules: progress, dead })
      }
      } catch (e) {
        if (!cancelled) setError(`Die Daten konnten nicht geladen werden: ${e instanceof Error ? e.message : String(e)}`)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, retry])

  return (
    <section>
      <h1 className="pixel">Lernapp</h1>
      {data === null && error ? (
        <>
          <p role="alert" className="warn">{error}</p>
          <button type="button" onClick={() => setRetry((r) => r + 1)}>Erneut versuchen</button>
        </>
      ) : data === null ? (
        <p className="muted">Lade …</p>
      ) : (
        <>
          <p className="today">{`Heute fällig: ${data.due} · Neu: ${data.fresh}`}</p>
          <button type="button" className="primary big" onClick={() => onStudy()} disabled={data.due + data.fresh === 0}>
            Lernen
          </button>
          <h2 className="pixel small">Module</h2>
          {data.modules.length === 0 ? (
            <p className="muted">Noch keine Module. Sie erscheinen nach der Synchronisierung.</p>
          ) : (
            <ul className="modules">
              {data.modules.map(({ module, percent, total }) => (
                <li key={module.id}>
                  <button type="button" className="module" onClick={() => onStudy(module.id)} aria-label={`${module.name} lernen`}>
                    <span className="module-name">{module.name}</span>
                    <span className="pixel small">{percent} %</span>
                    <span className="bar" aria-hidden="true">
                      <span style={{ width: `${percent}%` }} />
                    </span>
                    <span className="muted">{total} Karten</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data.dead > 0 && <p className="warn">{`${data.dead} Einträge konnten nicht synchronisiert werden`}</p>}
        </>
      )}
      <p className={`sync ${sync.kind}`}>{syncText(sync)}</p>
      <div className="row">
        {onSyncNow && (
          <button type="button" onClick={onSyncNow}>
            Jetzt synchronisieren
          </button>
        )}
        <button type="button" onClick={onSettings}>
          Einstellungen
        </button>
      </div>
    </section>
  )
}
