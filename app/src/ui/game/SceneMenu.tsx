import { useState } from 'react'
import { syncText, type SyncStatus } from '../CampScreen'

type Props = { sync: SyncStatus; dead: number; onSettings: () => void; onSyncNow?: () => void; onCreateCards?: () => void }

/** Knopf „Menü“ oben rechts in einer Szene; das Panel legt sich darunter über die Szene. */
export function SceneMenu({ sync, dead, onSettings, onSyncNow, onCreateCards }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="scene-menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Menü
      </button>
      {open && (
        <div className="scene-menu-panel card-panel">
          <p className={`sync ${sync.kind}`}>{syncText(sync)}</p>
          {dead > 0 && <p className="warn">{`${dead} Einträge konnten nicht synchronisiert werden`}</p>}
          <div className="row">
            {onSyncNow && (
              <button type="button" onClick={onSyncNow}>
                Jetzt synchronisieren
              </button>
            )}
            {onCreateCards && (
              <button type="button" onClick={onCreateCards}>
                Karten erstellen
              </button>
            )}
            <button type="button" onClick={onSettings}>
              Einstellungen
            </button>
          </div>
        </div>
      )}
    </>
  )
}
