import { useEffect, useState } from 'react'
import { db } from '../data/db'
import { loadAreaChoices, loadMilestones, recordMilestones } from '../data/game'
import { loadSettings } from '../data/settings'
import { bloomCount, buildGarden, newMilestones, type BedView, type Milestones, type PlantView } from '../game/garden'
import { GARDEN_VIEWS, insectFrames, plantImage, slotPositions, treeImage, type BedArea, type Move, type ViewId } from '../game/scenes'
import type { SyncStatus } from './CampScreen'
import { SceneMenu } from './game/SceneMenu'
import { Sprite } from './game/Sprite'

type Props = {
  now?: () => Date
  sync: SyncStatus
  /** Erhöhen, um die Anzeige neu zu laden (z. B. nach einem Sync). */
  refreshKey?: number
  onCamp: () => void
  onSettings: () => void
  onSyncNow?: () => void
}

type Data = { beds: BedView[]; dead: number }
type Side = 'left' | 'right'

/**
 * Lädt den Lernstand, trägt neue Meilensteine ein (Fehler dabei blockieren die Anzeige nicht)
 * und baut daraus den Garten.
 */
export async function loadGarden(t: Date): Promise<Data> {
  const [cards, rows, topics, modules, settings, chosen, milestones, dead] = await Promise.all([
    db.cards.toArray(),
    db.states.toArray(),
    db.topics.toArray(),
    db.modules.toArray(),
    loadSettings(),
    loadAreaChoices(),
    loadMilestones(),
    db.dead.count(),
  ])
  const states = new Map(rows.map((r) => [r.cardId, r.state]))
  const build = (ms: Milestones) => buildGarden({ modules, topics, cards, states, now: t, retention: settings.retention, chosen, milestones: ms })
  let beds = build(milestones)
  const found = newMilestones(beds, milestones)
  if (found.topics.length + found.modules.length > 0) {
    try {
      await recordMilestones(found, t)
    } catch {
      // Nächstes Öffnen versucht es erneut.
    }
    const at = t.toISOString()
    for (const id of found.topics) milestones.securedAt.set(id, at)
    for (const id of found.modules) milestones.defeatedAt.set(id, at)
    beds = build(milestones)
  }
  return { beds, dead }
}

export function plantSign(p: PlantView, moduleName: string): string {
  const head = `${p.topic.name} · ${moduleName}`
  switch (p.stage) {
    case 'bloom':
      return `${head} · sitzt sicher · ${p.total} Karten`
    case 'wilted':
      return `${head} · welkt · ${p.due} Karten fällig`
    case 'seed':
      return `${head} · Saat · noch nichts gelernt`
    default:
      return `${head} · wächst · ${Math.round((p.securePct * p.total) / 100)} von ${p.total} sicher`
  }
}

const MOVES: { move: Move; label: string; cls: string }[] = [
  { move: 'left', label: '↶ Links', cls: 'nav-left' },
  { move: 'forward', label: '↑ Vorwärts', cls: 'nav-forward' },
  { move: 'right', label: 'Rechts ↷', cls: 'nav-right' },
  { move: 'back', label: '↓ Umdrehen', cls: 'nav-back' },
]

/** Pseudozufällige, aber feste Flugbahnen, damit Insekten nicht bei jedem Rendern springen. */
const FLIGHTS = [
  { x: 22, y: 40, d: 0 },
  { x: 70, y: 34, d: -2.5 },
  { x: 40, y: 52, d: -5 },
  { x: 82, y: 50, d: -1.2 },
  { x: 14, y: 58, d: -3.8 },
  { x: 58, y: 44, d: -6.1 },
  { x: 32, y: 30, d: -4.4 },
  { x: 76, y: 60, d: -7.3 },
]

export function GreenhouseScreen({ now = () => new Date(), sync, refreshKey = 0, onCamp, onSettings, onSyncNow }: Props) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [view, setView] = useState<ViewId>('gang')
  const [page, setPage] = useState<Record<Side, number>>({ left: 0, right: 0 })
  const [sign, setSign] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadGarden(now())
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

  if (data === null) {
    return (
      <section className="greenhouse">
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

  const v = GARDEN_VIEWS[view]
  const near = view === 'beetL' || view === 'beetR'
  // Linkes Beet = 1., 3., 5. … Modul, rechtes Beet = 2., 4., … Modul.
  const sides: Record<Side, BedView[]> = {
    left: data.beds.filter((_, i) => i % 2 === 0),
    right: data.beds.filter((_, i) => i % 2 === 1),
  }
  const bedFor = (side: Side) => sides[side][near ? Math.min(page[side], sides[side].length - 1) : 0]
  const insects = Math.min(8, Math.floor(bloomCount(data.beds) / 2))

  const go = (move: Move) => {
    const to = v.moves[move]
    if (to) {
      setView(to)
      setSign(null)
    }
  }
  const turnPage = (side: Side, delta: number) => {
    setPage((p) => ({ ...p, [side]: p[side] + delta }))
    setSign(null)
  }

  const renderBed = (area: BedArea, key: number) => {
    const bed = bedFor(area.side)
    if (!bed) return null
    const slots = slotPositions(area, bed.plants.length)
    const cx = area.x + area.w / 2
    return (
      <div key={key} className="bed">
        {near && bed.tree !== 'none' && (
          <img className="tree" src={treeImage(bed.tree)} alt="" draggable={false} style={{ left: `${cx}%`, top: `${area.y}%`, width: `${46 * area.scale}%` }} />
        )}
        {slots.map((s, i) => {
          const p = bed.plants[i]!
          return (
            <button
              key={p.topic.id}
              type="button"
              className={`plant stage-${p.stage}`}
              aria-label={p.topic.name}
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}%` }}
              onClick={(e) => {
                e.stopPropagation()
                setSign(plantSign(p, bed.module.name))
              }}
            >
              <img src={plantImage(p.species, p.stage)} alt="" draggable={false} />
            </button>
          )
        })}
        <span className={`bed-sign${near ? ' near' : ''}`} style={{ left: `${cx}%`, top: `${area.y + area.h + (near ? 9 : 4)}%` }}>
          {bed.module.name}
        </span>
      </div>
    )
  }

  const side: Side | null = near ? v.beds[0]!.side : null
  const pages = side ? sides[side].length : 0
  const current = side ? Math.min(page[side], pages - 1) : 0

  return (
    <section className="greenhouse">
      <div className="scene" onClick={() => setSign(null)}>
        <img className={`scene-backdrop${v.mirror ? ' mirror' : ''}`} src={v.image} alt="" draggable={false} />
        {v.beds.map(renderBed)}
        {FLIGHTS.slice(0, insects).map((f, i) => (
          <span
            key={i}
            className={`insect ${i % 2 === 0 ? 'butterfly' : 'bee'}`}
            aria-hidden="true"
            style={{ left: `${f.x}%`, top: `${f.y}%`, animationDelay: `${f.d}s` }}
          >
            <Sprite frames={insectFrames(i % 2 === 0 ? 'butterfly' : 'bee')} fps={i % 2 === 0 ? 8 : 14} />
          </span>
        ))}
        <span className="scene-where">{v.name}</span>
        <SceneMenu sync={sync} dead={data.dead} onSettings={onSettings} onSyncNow={onSyncNow} />
        {side && pages > 1 && (
          <div className="bed-pager">
            <button type="button" disabled={current === 0} onClick={(e) => (e.stopPropagation(), turnPage(side, -1))}>
              ‹ Beet
            </button>
            <button type="button" disabled={current >= pages - 1} onClick={(e) => (e.stopPropagation(), turnPage(side, 1))}>
              Beet ›
            </button>
          </div>
        )}
        {sign && (
          <p className="plant-sign" role="status">
            {sign}
          </p>
        )}
      </div>
      {data.beds.length === 0 && <p className="muted center">Noch keine Beete – erstelle Karten in der Werkstatt</p>}
      <nav className="garden-nav" aria-label="Gehen">
        {MOVES.map(({ move, label, cls }) =>
          move === 'forward' && v.door ? (
            <button key={move} type="button" className={cls} onClick={onCamp}>
              ↑ Zum Lagerfeuer
            </button>
          ) : (
            <button key={move} type="button" className={cls} disabled={!v.moves[move]} onClick={() => go(move)}>
              {label}
            </button>
          ),
        )}
      </nav>
    </section>
  )
}
