import { useEffect, useRef, useState } from 'react'
import type { Card } from '@lernapp/shared'
import { askWerkstatt, WerkstattError, type HistoryEntry } from '../ask/askClient'
import { getAskMode, invalidateAskMode, type AskMode } from '../ask/askMode'
import { buildAskText, describeAnswer } from '../ask/askPrompt'
import type { Answer } from './types'

export const CLAUDE_URL = 'https://claude.ai/new'
const FIRST_QUESTION = 'Erkläre mir genauer, warum meine Antwort falsch ist und wo mein Denkfehler liegt.'

type Props = {
  card: Card
  answer: Answer
  /** Liefert das Supabase-Zugriffstoken der App-Sitzung. */
  getToken: () => Promise<string | null>
  onClose: () => void
}

export function AskDialog({ card, answer, getToken, onClose }: Props) {
  const [mode, setMode] = useState<AskMode | null>(null)
  const userAnswer = describeAnswer(card, answer)

  useEffect(() => {
    let alive = true
    void getAskMode().then((m) => {
      if (alive) setMode(m)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="ask" role="dialog" aria-label="Nachfragen">
      <div className="row between">
        <h2 className="pixel">Nachfragen</h2>
        <button type="button" onClick={onClose}>
          Schließen
        </button>
      </div>
      {mode === null && <p className="muted">Prüfe Verbindung …</p>}
      {mode === 'werkstatt' && (
        <Chat
          card={card}
          userAnswer={userAnswer}
          getToken={getToken}
          onFallback={() => {
            invalidateAskMode()
            setMode('clipboard')
          }}
        />
      )}
      {mode === 'clipboard' && <ClipboardAsk text={buildAskText(card, userAnswer)} />}
    </section>
  )
}

function ClipboardAsk({ text }: { text: string }) {
  const [copied, setCopied] = useState<boolean | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        await navigator.clipboard.writeText(text)
        if (alive) setCopied(true)
      } catch {
        if (alive) setCopied(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [text])

  useEffect(() => {
    if (copied === false) area.current?.select()
  }, [copied])

  return (
    <div className="stack">
      {copied === true && <p className="why right">Text kopiert – in Claude einfügen</p>}
      {copied === false && (
        <>
          <p className="warn">Text markieren und kopieren, dann in Claude einfügen:</p>
          <textarea ref={area} readOnly rows={8} value={text} aria-label="Text zum Kopieren" onFocus={(e) => e.currentTarget.select()} />
        </>
      )}
      <button type="button" className="primary" onClick={() => window.open(CLAUDE_URL, '_blank', 'noopener')}>
        Claude öffnen
      </button>
    </div>
  )
}

type ChatProps = {
  card: Card
  userAnswer: string
  getToken: () => Promise<string | null>
  /** Werkstatt nicht erreichbar: für diese Nachfrage auf Zwischenablage umschalten. */
  onFallback: () => void
}

function Chat({ card, userAnswer, getToken, onFallback }: ChatProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async (text: string) => {
    if (busy) return
    const next: HistoryEntry[] = [...history, { role: 'user', text }]
    setHistory(next)
    setInput('')
    setBusy(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) throw new WerkstattError('Du bist nicht angemeldet.', false)
      // Die neue Frage steht als letzter Eintrag im Verlauf.
      const reply = await askWerkstatt(card, userAnswer, next, token)
      setHistory([...next, { role: 'assistant', text: reply }])
    } catch (e) {
      if (e instanceof WerkstattError && e.unreachable) {
        onFallback()
        return
      }
      setHistory(history)
      setInput(text)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <ul className="chat">
        {history.map((h, i) => (
          <li key={i} className={h.role}>
            <strong>{h.role === 'user' ? 'Du' : 'Claude'}:</strong> {h.text}
          </li>
        ))}
      </ul>
      {busy && <p className="muted">Claude denkt nach …</p>}
      {error && (
        <p role="alert" className="warn">
          {error}
        </p>
      )}
      {history.length === 0 && (
        <button type="button" className="primary" disabled={busy} onClick={() => void send(FIRST_QUESTION)}>
          Erklärung anfordern
        </button>
      )}
      <textarea aria-label="Deine Nachfrage" rows={3} value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} />
      <button type="button" disabled={busy || !input.trim()} onClick={() => void send(input.trim())}>
        Senden
      </button>
    </div>
  )
}
