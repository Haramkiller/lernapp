import { Fragment, useState, type FormEvent } from 'react'
import { checkCloze } from '../../answers/check'
import type { QuestionProps } from '../types'

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

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const { perGap, outcome } = checkCloze(inputs, card.payload)
    onAnswer(outcome, { kind: 'cloze', inputs, perGap })
  }

  return (
    <form onSubmit={submit}>
      <p className="question cloze">
        {!placeholdersOk && text.replace(/\{\{\d+\}\}/g, '…')}
        {placeholdersOk && parts.map((part, i) => {
          if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>
          const n = Number(part) - 1
          return (
            <input
              key={i}
              className="gap"
              aria-label={`Lücke ${n + 1}`}
              value={inputs[n] ?? ''}
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setInputs((prev) => prev.map((v, k) => (k === n ? e.target.value : v)))}
            />
          )
        })}
      </p>
      {!placeholdersOk && (
        <div className="stack">
          {gaps.map((_, n) => (
            <input
              key={n}
              className="gap"
              aria-label={`Lücke ${n + 1}`}
              value={inputs[n] ?? ''}
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setInputs((prev) => prev.map((v, k) => (k === n ? e.target.value : v)))}
            />
          ))}
        </div>
      )}
      <button type="submit" className="primary">
        Prüfen
      </button>
    </form>
  )
}
