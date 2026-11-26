import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { checkOrder } from '../../answers/check'
import { shuffledIndices } from '../random'
import type { ShuffledQuestionProps } from '../types'
import { ConfidenceBar } from './ConfidenceBar'

/** Verschiebt das Element an Position `from` nach `to` (die übrigen rücken nach). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

export function Order({ card, rng, onAnswer }: ShuffledQuestionProps<'order'>) {
  const { prompt, steps } = card.payload
  const initial = useMemo(() => shuffledIndices(steps.length, rng), [card.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // order[pos] = Originalindex des Schritts, der an Position pos steht
  const [order, setOrder] = useState<number[]>(initial)
  const list = useRef<HTMLOListElement>(null)
  const drag = useRef<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  const move = (pos: number, delta: -1 | 1) => setOrder((prev) => moveItem(prev, pos, pos + delta))

  // Ziehen am Griff (Maus und Finger): über die Mitte des Nachbarn hinaus → Platz tauschen.
  const startDrag = (pos: number) => (e: PointerEvent<HTMLSpanElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = pos
    setDragging(pos)
  }
  const onDrag = (e: PointerEvent<HTMLSpanElement>) => {
    const from = drag.current
    const items = list.current?.children
    if (from === null || !items) return
    let to = 0
    for (let i = 0; i < items.length; i++) {
      const r = items[i]!.getBoundingClientRect()
      if (e.clientY > r.top + r.height / 2) to = i
    }
    if (e.clientY < items[0]!.getBoundingClientRect().top) to = 0
    if (to !== from) {
      setOrder((prev) => moveItem(prev, from, to))
      drag.current = to
      setDragging(to)
    }
  }
  const endDrag = () => {
    drag.current = null
    setDragging(null)
  }

  return (
    <section className="ask">
      <span className="ask-kind">Sortiere</span>
      <p className="question">{prompt}</p>
      <ol className="order-list" ref={list}>
        {order.map((orig, pos) => (
          <li key={orig} className={dragging === pos ? 'dragging' : undefined}>
            <span className="num">{pos + 1}</span>
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
            <span
              className="grip"
              role="img"
              aria-label={`${steps[orig]} ziehen`}
              onPointerDown={startDrag(pos)}
              onPointerMove={onDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              ⋮⋮
            </span>
          </li>
        ))}
      </ol>
      <ConfidenceBar onPick={(c) => onAnswer(checkOrder(order, card.payload), { kind: 'order', order }, c)} />
    </section>
  )
}
