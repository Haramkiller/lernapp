import { useMemo, useState } from 'react'
import { checkOrder } from '../../answers/check'
import { shuffledIndices } from '../random'
import type { ShuffledQuestionProps } from '../types'

export function Order({ card, rng, onAnswer }: ShuffledQuestionProps<'order'>) {
  const { prompt, steps } = card.payload
  const initial = useMemo(() => shuffledIndices(steps.length, rng), [card.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // order[pos] = Originalindex des Schritts, der an Position pos steht
  const [order, setOrder] = useState<number[]>(initial)

  const move = (pos: number, delta: -1 | 1) =>
    setOrder((prev) => {
      const next = [...prev]
      const j = pos + delta
      const tmp = next[pos]!
      next[pos] = next[j]!
      next[j] = tmp
      return next
    })

  return (
    <section>
      <p className="question">{prompt}</p>
      <ol className="order-list">
        {order.map((orig, pos) => (
          <li key={orig}>
            <span className="grow">{steps[orig]}</span>
            <button type="button" className="icon" aria-label={`${steps[orig]} nach oben`} disabled={pos === 0} onClick={() => move(pos, -1)}>
              ▲
            </button>
            <button
              type="button"
              className="icon"
              aria-label={`${steps[orig]} nach unten`}
              disabled={pos === order.length - 1}
              onClick={() => move(pos, 1)}
            >
              ▼
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="primary" onClick={() => onAnswer(checkOrder(order, card.payload), { kind: 'order', order })}>
        Prüfen
      </button>
    </section>
  )
}
