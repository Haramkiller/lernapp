import type { Card } from '@lernapp/shared'
import { WERKSTATT_URL } from './askMode'

export type HistoryEntry = { role: 'user' | 'assistant'; text: string }

export const MAX_HISTORY = 20
export const MAX_ENTRY = 4000
export const MAX_ANSWER = 2000

/** Kürzt den Verlauf auf die Grenzen der Werkstatt (neueste Einträge bleiben). */
export function trimHistory(history: HistoryEntry[]): HistoryEntry[] {
  return history.slice(-MAX_HISTORY).map((h) => ({ role: h.role, text: h.text.slice(0, MAX_ENTRY) }))
}

export class WerkstattError extends Error {
  /** unreachable = Werkstatt nicht erreichbar oder Serverfehler -> Wechsel in den Zwischenablage-Modus. */
  constructor(
    message: string,
    readonly unreachable: boolean,
    /** Fehlertext der Werkstatt bei 5xx (nicht bei Netzwerkfehlern). */
    readonly serverMessage?: string,
  ) {
    super(message)
  }
}

export async function askWerkstatt(card: Card, userAnswer: string, history: HistoryEntry[], token: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${WERKSTATT_URL}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ card, userAnswer: userAnswer.slice(0, MAX_ANSWER), history: trimHistory(history) }),
    })
  } catch {
    throw new WerkstattError('Die Werkstatt ist nicht erreichbar.', true)
  }
  const body = (await res.json().catch(() => ({}))) as { answer?: string; error?: string }
  if (!res.ok || typeof body.answer !== 'string') {
    const message = body.error ?? `Die Werkstatt hat mit Fehler ${res.status} geantwortet.`
    const server = res.status >= 500
    throw new WerkstattError(message, server, server ? message : undefined)
  }
  return body.answer
}
