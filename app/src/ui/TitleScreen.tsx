import { useEffect, useState } from 'react'
import type { Quest } from '../game/mastery'
import { TITLE_IMAGE } from '../game/scenes'
import { loadOverview } from './CampScreen'

type Props = {
  now?: () => Date
  /** Erhöhen, um den Stand neu zu laden (z. B. nach einem Sync); kein Neuaufbau, damit kein Tippen verloren geht. */
  refreshKey?: number
  onStart: () => void
}

function questText(q: Quest): string {
  return q.total === 0 ? 'Heute ist nichts fällig' : `Tages-Quest ${q.done}/${q.total}`
}

/** Kurzes Titelbild nach dem App-Start; der ganze Bildschirm ist antippbar. */
export function TitleScreen({ now = () => new Date(), refreshKey = 0, onStart }: Props) {
  const [quest, setQuest] = useState<Quest | null>(null)

  useEffect(() => {
    let cancelled = false
    // Ohne Daten (Fehler) bleibt das Titelbild einfach ohne Stand; das Spiel ist trotzdem erreichbar.
    void loadOverview(now())
      .then((d) => !cancelled && setQuest(d.overview.quest))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  return (
    <section className="title-screen" onClick={onStart}>
      <img className="title-image" src={TITLE_IMAGE} alt="" draggable={false} />
      <div className="title-top">
        <h1 className="pixel">Lernabenteuer</h1>
        {quest && <p>{questText(quest)}</p>}
      </div>
      <button
        type="button"
        className="primary big title-start"
        onClick={(e) => {
          e.stopPropagation()
          onStart()
        }}
      >
        Los geht&apos;s
      </button>
    </section>
  )
}
