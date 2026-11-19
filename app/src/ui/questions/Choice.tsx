import { useMemo } from 'react'
import { checkChoice } from '../../answers/check'
import { shuffledIndices } from '../random'
import type { ShuffledQuestionProps } from '../types'

export function Choice({ card, rng, onAnswer }: ShuffledQuestionProps<'choice'>) {
  const { question, options } = card.payload
  // Anzeigereihenfolge einmal pro Karte; order[pos] = Originalindex
  const order = useMemo(() => shuffledIndices(options.length, rng), [card.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section>
      <p className="question">{question}</p>
      <div className="stack">
        {order.map((orig) => (
          <button
            key={orig}
            type="button"
            className="option"
            onClick={() => onAnswer(checkChoice(orig, card.payload), { kind: 'choice', index: orig })}
          >
            {options[orig]!.text}
          </button>
        ))}
      </div>
    </section>
  )
}
