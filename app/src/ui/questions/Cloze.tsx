import { Fragment, useState, type FormEvent } from 'react'
import type { Confidence } from '../../srs/grading'
import { checkCloze } from '../../answers/check'
import type { QuestionProps } from '../types'
import { ConfidenceBar } from './ConfidenceBar'

/** Lücke im Satz: wächst mit der Eingabe, gestrichelt solange leer. */
function Gap({ n, value, onChange }: { n: number; value: string; onChange: (v: string) => void }) {
  return (
    <input
      className={`gap${value ? ' filled' : ''}`}
      aria-label={`Lücke ${n + 1}`}
      value={value}
      size={Math.max(5, value.length + 2)}
      placeholder="…"
      autoCapitalize="off"
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function Cloze({ card, onAnswer }: QuestionProps<'cloze'>) {
  const { text, gaps } = card.payload
  const [inputs, setInputs] = useState<string[]>(() => gaps.map(() => ''))
  // "a {{1}} b" → ["a ", "1", " b"]: ungerade Indizes sind Lücken
  const parts = text.split(/\{\{(\d+)\}\}/)
  // Platzhalter {{1}}…{{n}} müssen genau zu den Lücken passen; sonst Eingabefelder unter dem Text
  const found = parts
    .filter((_, i) => i % 2 === 1)
    .map(Number)
    .sort((a, b) => a - b)
  const placeholdersOk = found.length === gaps.length && found.every((n, i) => n === i + 1)

  // Enter schickt nicht ab: man soll sich bewusst für „Sicher“ oder „Unsicher“ entscheiden.
  // Die Handy-Taste „Fertig“ schließt nur die Tastatur.
  const noSubmit = (e: FormEvent) => {
    e.preventDefault()
    ;(document.activeElement as HTMLElement | null)?.blur()
  }
  const check = (c: Confidence) => {
    const { perGap, outcome } = checkCloze(inputs, card.payload)
    onAnswer(outcome, { kind: 'cloze', inputs, perGap }, c)
  }

  return (
    <form className="ask" onSubmit={noSubmit}>
      <span className="ask-kind">Lückentext</span>
      <p className="question cloze">
        {!placeholdersOk && text.replace(/\{\{\d+\}\}/g, '…')}
        {placeholdersOk && parts.map((part, i) => {
          if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>
          const n = Number(part) - 1
          return (
            <Gap key={i} n={n} value={inputs[n] ?? ''} onChange={(v) => setInputs((prev) => prev.map((x, j) => (j === n ? v : x)))} />
          )
        })}
      </p>
      {!placeholdersOk && (
        <div className="stack">
          {gaps.map((_, n) => (
            <Gap key={n} n={n} value={inputs[n] ?? ''} onChange={(v) => setInputs((prev) => prev.map((x, j) => (j === n ? v : x)))} />
          ))}
        </div>
      )}
      <ConfidenceBar onPick={check} />
    </form>
  )
}
