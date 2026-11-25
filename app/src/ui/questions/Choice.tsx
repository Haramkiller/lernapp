import { useMemo, useState } from 'react'
import { checkChoice } from '../../answers/check'
import { shuffledIndices } from '../random'
import type { ShuffledQuestionProps } from '../types'
import { AnswerBar } from './AnswerBar'

const LETTERS = 'ABCDEFGH'

export function Choice({ card, rng, onAnswer }: ShuffledQuestionProps<'choice'>) {
  const { question, options } = card.payload
  // Anzeigereihenfolge einmal pro Karte; order[pos] = Originalindex
  const order = useMemo(() => shuffledIndices(options.length, rng), [card.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Erst wählen, dann „Prüfen“: verhindert Vertipper am Handy.
  const [selected, setSelected] = useState<number | null>(null)
  return (
    <section className="ask">
      <span className="ask-kind">Wähle aus</span>
      <p className="question">{question}</p>
      <div className="stack">
        {order.map((orig, pos) => (
          <button
            key={orig}
            type="button"
            className={`option${selected === orig ? ' selected' : ''}`}
            aria-pressed={selected === orig}
            onClick={() => setSelected(orig)}
          >
            <span className="badge">{LETTERS[pos]}</span> <span>{options[orig]!.text}</span>
          </button>
        ))}
      </div>
      <AnswerBar
        disabled={selected === null}
        onClick={() => selected !== null && onAnswer(checkChoice(selected, card.payload), { kind: 'choice', index: selected })}
      />
    </section>
  )
}
