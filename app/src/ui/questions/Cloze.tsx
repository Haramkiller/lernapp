import { Fragment, useState, type FormEvent } from 'react'
import { checkCloze } from '../../answers/check'
import type { QuestionProps } from '../types'

export function Cloze({ card, onAnswer }: QuestionProps<'cloze'>) {
  const { text, gaps } = card.payload
  const [inputs, setInputs] = useState<string[]>(() => gaps.map(() => ''))
  // "a {{1}} b" → ["a ", "1", " b"]: ungerade Indizes sind Lücken
  const parts = text.split(/\{\{(\d+)\}\}/)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const { perGap, outcome } = checkCloze(inputs, card.payload)
    onAnswer(outcome, { kind: 'cloze', inputs, perGap })
  }

  return (
    <form onSubmit={submit}>
      <p className="question cloze">
        {parts.map((part, i) => {
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
      <button type="submit" className="primary">
        Prüfen
      </button>
    </form>
  )
}
