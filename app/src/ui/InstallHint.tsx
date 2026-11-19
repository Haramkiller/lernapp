import { useEffect, useState } from 'react'
import { db } from '../data/db'
import { isIosNotInstalled } from './iosInstall'

const DISMISS_KEY = 'installHintDismissed'

function detect(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  const standalone = (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || nav.standalone === true
  return isIosNotInstalled(nav.userAgent, standalone, nav.maxTouchPoints ?? 0)
}

export function InstallHint() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!detect()) return
    let alive = true
    void db.meta
      .get(DISMISS_KEY)
      .then((row) => alive && setVisible(!row?.value))
      .catch(() => alive && setVisible(true))
    return () => {
      alive = false
    }
  }, [])

  if (!visible) return null
  return (
    <aside className="install-hint" role="note">
      <p>Für Offline-Lernen und Erinnerungen: Teilen-Symbol → „Zum Home-Bildschirm“.</p>
      <button
        type="button"
        onClick={() => {
          setVisible(false)
          void db.meta.put({ key: DISMISS_KEY, value: true }).catch(() => undefined)
        }}
      >
        Verstanden
      </button>
    </aside>
  )
}
