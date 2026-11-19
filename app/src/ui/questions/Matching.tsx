import { useMemo, useState } from 'react'
import { checkMatching } from '../../answers/check'
import { shuffledIndices } from '../random'
import type { ShuffledQuestionProps } from '../types'

export function Matching({ card, rng, onAnswer }: ShuffledQuestionProps<'matching'>) {
  const { prompt, pairs } = card.payload
  // rightOrder[pos] = Originalindex des rechten Elements an Anzeigeposition pos
  const rightOrder = useMemo(() => shuffledIndices(pairs.length, rng), [card.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // choice[i] = gewählter Originalindex des rechten Elements für links i (-1 = noch keiner)
  const [choice, setChoice] = useState<number[]>(() => pairs.map(() => -1))
  const complete = choice.every((c) => c >= 0)

  return (
    <section>
      <p className="question">{prompt}</p>
      <div className="stack">
        {pairs.map((p, i) => (
          <label key={i} className="field">
            <span>{p.left}</span>
            <select
              value={choice[i]}
              onChange={(e) => setChoice((prev) => prev.map((v, k) => (k === i ? Number(e.target.value) : v)))}
            >
              <option value={-1}>– wählen –</option>
              {rightOrder.map((orig) => (
                <option key={orig} value={orig}>
                  {pairs[orig]!.right}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="primary"
        disabled={!complete}
        onClick={() => onAnswer(checkMatching(choice, card.payload), { kind: 'matching', mapping: choice })}
      >
        Prüfen
      </button>
    </section>
  )
}
