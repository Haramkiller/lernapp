import { useEffect, useRef, useState } from 'react'
import { bossFrames } from '../../game/bosses'
import type { ModuleView, Overview, RegionView } from '../../game/overview'
import { FOG_IMAGES, MAP_IMAGE, REGION_SPOTS, regionIcon } from '../../game/scenes'
import { Sprite } from './Sprite'

type Props = {
  overview: Overview
  onBattle: (moduleId: string | undefined) => void
  onClose: () => void
}

const work = (m: ModuleView) => m.due + m.fresh

/** Vorauswahl: Region mit der meisten Arbeit, sonst die erste entdeckte. */
function preselect(regions: RegionView[]): string | null {
  const found = regions.filter((r) => r.modules.length > 0)
  const busiest = [...found].sort((a, b) => Math.max(...b.modules.map(work)) - Math.max(...a.modules.map(work)))[0]
  return busiest?.region.id ?? null
}

export function MapDialog({ overview, onBattle, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(() => preselect(overview.regions))
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const region = overview.regions.find((r) => r.region.id === selected && r.modules.length > 0)
  let fog = 0

  return (
    <div className="map-backdrop">
      <div className="map-window" role="dialog" aria-modal="true" aria-label="Karte">
        <div className="map-head">
          <p className="quest pixel small">{`Tages-Quest ${overview.quest.done}/${overview.quest.total}`}</p>
          <button type="button" ref={close} onClick={onClose}>
            Schließen
          </button>
        </div>
        <div className="map">
          <img className="map-image" src={MAP_IMAGE} alt="" draggable={false} />
          {overview.regions.map(({ region: r, modules }) => {
            const spot = REGION_SPOTS[r.id]
            const style = { left: `${spot.x}%`, top: `${spot.y}%` }
            if (modules.length === 0) {
              const src = FOG_IMAGES[fog++ % FOG_IMAGES.length]
              return (
                <button key={r.id} type="button" className="map-fog" style={style} disabled aria-label="Unentdecktes Gebiet">
                  <img src={src} alt="" draggable={false} />
                </button>
              )
            }
            const threat = Math.max(...modules.map((m) => m.threat ?? 0))
            const todo = modules.reduce((n, m) => n + work(m), 0)
            return (
              <button
                key={r.id}
                type="button"
                className={`map-flag${selected === r.id ? ' selected' : ''}`}
                style={style}
                aria-label={`${r.name}: ${modules.map((m) => m.module.name).join(', ')}`}
                aria-pressed={selected === r.id}
                onClick={() => setSelected(r.id)}
              >
                <span className="flag-title">{modules.map((m) => m.module.name).join(' · ')}</span>
                <span className="flag-info">
                  {threat > 0 && <span className="threat">{`Bedrohung ${threat} %`}</span>}
                  {todo > 0 && <span>{` ${todo} offen`}</span>}
                </span>
              </button>
            )
          })}
        </div>
        {region ? (
          <div className="region-panel">
            {region.modules.map((m) => (
              <section key={m.module.id} className="region-module">
                <div className="region-top">
                  <img className="region-icon" src={regionIcon(region.region.id)} alt="" draggable={false} />
                  <Sprite frames={bossFrames(m.boss, 'idle')} fps={m.boss.fps} className="region-boss" />
                  <div>
                    <h3>{m.bossName}</h3>
                    <p className="muted">{m.threat === null ? 'Noch unerforscht' : `Bedrohung ${m.threat} %`}</p>
                    <span className="bar threat-bar" aria-hidden="true">
                      <span style={{ width: `${m.threat ?? 0}%` }} />
                    </span>
                  </div>
                </div>
                {m.topics.length > 0 && (
                  <ul className="topic-flags">
                    {m.topics.map((t) => (
                      <li key={t.topic.id}>
                        <span>{t.topic.name}</span>
                        {t.due > 0 && <span className="chip due">{`${t.due} fällig`}</span>}
                        {t.fresh > 0 && <span className="chip fresh">{`${t.fresh} neu`}</span>}
                        {t.secure && <span className="chip secure">sitzt sicher</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="row">
                  <button type="button" className="primary" disabled={work(m) === 0} onClick={() => onBattle(m.module.id)}>
                    Kämpfen
                  </button>
                  {work(m) === 0 && <span className="muted">Heute nichts zu tun</span>}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className="muted region-hint">Noch keine Region entdeckt. Module erscheinen nach der Synchronisierung.</p>
        )}
      </div>
    </div>
  )
}
