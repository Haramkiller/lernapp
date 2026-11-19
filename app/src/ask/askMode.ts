export const WERKSTATT_URL = 'http://127.0.0.1:5174'

export type AskMode = 'werkstatt' | 'clipboard'

/** Prüft, ob die Werkstatt auf diesem Rechner läuft (Timeout 800 ms). */
export async function detectAskMode(): Promise<AskMode> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 800)
  try {
    const res = await fetch(`${WERKSTATT_URL}/api/health`, { signal: ctrl.signal })
    return res.ok ? 'werkstatt' : 'clipboard'
  } catch {
    return 'clipboard'
  } finally {
    clearTimeout(timer)
  }
}

let cached: Promise<AskMode> | null = null

/** Ergebnis wird pro App-Sitzung gemerkt. */
export function getAskMode(): Promise<AskMode> {
  cached ??= detectAskMode()
  return cached
}

/** Nach einem fehlgeschlagenen Werkstatt-Aufruf: beim nächsten Mal neu prüfen. */
export function invalidateAskMode(): void {
  cached = null
}
