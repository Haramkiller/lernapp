import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../data/db'
import { loadAreaChoices, loadLastBattleAt } from '../data/game'
import { loadSettings } from '../data/settings'
import { buildOverview, type Overview } from '../game/overview'
import { isRested, minutesUntilRested } from '../game/rest'
import { CAMP, fireFrames } from '../game/scenes'
import { newDoneKey } from '../session/queue'
import { MapDialog } from './game/MapDialog'
import { Sprite } from './game/Sprite'

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
  onBattle: (moduleId: string | undefined, rested: boolean) => void
  onSettings: () => void
  onSyncNow?: () => void
}

type Data = { overview: Overview; dead: number; lastBattleAt: Date | null }

export function syncText(s: SyncStatus): string {
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

/** Lädt alles für Waldplatz, Karte und Titelbild aus der lokalen Datenbank. */
export async function loadOverview(t: Date): Promise<Data> {
  const [cards, rows, topics, modules, settings, dead, chosen, lastBattleAt] = await Promise.all([
    db.cards.toArray(),
    db.states.toArray(),
    db.topics.toArray(),
    db.modules.toArray(),
    loadSettings(),
    db.dead.count(),
    loadAreaChoices(),
    loadLastBattleAt(),
  ])
  const states = new Map(rows.map((r) => [r.cardId, r.state]))
  const newDoneToday = ((await db.meta.get(newDoneKey(t)))?.value as number | undefined) ?? 0
  return { overview: buildOverview({ cards, states, topics, modules, newDoneToday, now: t, settings, chosen }), dead, lastBattleAt }
}

export function CampScreen({ now = () => new Date(), sync, refreshKey = 0, onBattle, onSettings, onSyncNow }: Props) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [mapOpen, setMapOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [, setTick] = useState(0)
  const fire = useRef<HTMLButtonElement>(null)
  /** Alles hinter der Karte; bei offener Karte `inert` (kein Tab, kein Vorlesen dahinter). */
  const body = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    let cancelled = false
    void loadOverview(now())
      .then((d) => {
        if (cancelled) return
        setError(null)
        setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(`Die Daten konnten nicht geladen werden: ${e instanceof Error ? e.message : String(e)}`)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, retry])

  // Die Pause-Anzeige zählt mit.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const closeMap = useCallback(() => setMapOpen(false), [])

  // React 18 kennt `inert` nicht als Prop. Erst nach dem Aufheben darf das Feuer den Fokus bekommen.
  useEffect(() => {
    const el = body.current
    if (!el) return
    if (mapOpen) {
      el.setAttribute('inert', '')
      wasOpen.current = true
    } else {
      el.removeAttribute('inert')
      if (wasOpen.current) fire.current?.focus()
      wasOpen.current = false
    }
  }, [mapOpen, data])

  if (data === null) {
    return (
      <section className="camp">
        {error ? (
          <>
            <p role="alert" className="warn">
              {error}
            </p>
            <button type="button" onClick={() => setRetry((r) => r + 1)}>
              Erneut versuchen
            </button>
          </>
        ) : (
          <p className="muted">Lade …</p>
        )}
      </section>
    )
  }

  const t = now()
  const rested = isRested(data.lastBattleAt, t)
  const battle = (moduleId: string | undefined) => onBattle(moduleId, rested)
  const { fire: f } = CAMP

  return (
    <section className="camp">
      <div ref={body}>
        <div className="scene">
          <img className="scene-backdrop" src={CAMP.backdrop} alt="" draggable={false} />
          <button
            type="button"
            ref={fire}
            className="campfire"
            style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.width}%` }}
            aria-label="Lagerfeuer – Karte öffnen"
            onClick={() => setMapOpen(true)}
          >
            <span className="fire-glow" aria-hidden="true" />
            <Sprite frames={fireFrames()} fps={f.fps} />
          </button>
          <button type="button" className="scene-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            Menü
          </button>
          <p className="scene-hint">
            {rested ? 'Ausgeruht · tippe aufs Feuer für die Karte' : `Pause am Feuer: noch ${minutesUntilRested(data.lastBattleAt, t)} min bis Ausgeruht`}
          </p>
        </div>
        {menuOpen && (
          <div className="camp-menu card-panel">
            <p className={`sync ${sync.kind}`}>{syncText(sync)}</p>
            {data.dead > 0 && <p className="warn">{`${data.dead} Einträge konnten nicht synchronisiert werden`}</p>}
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
          </div>
        )}
        {data.overview.strays > 0 && (
          <div className="row strays">
            <span>{`Verirrte Karten: ${data.overview.strays}`}</span>
            <button type="button" onClick={() => battle(undefined)}>
              Kämpfen
            </button>
          </div>
        )}
      </div>
      {mapOpen && <MapDialog overview={data.overview} onBattle={battle} onClose={closeMap} />}
    </section>
  )
}
