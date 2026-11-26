import { useMemo, useState } from 'react'
import { checkMatching } from '../../answers/check'
import { shuffledIndices } from '../random'
import type { ShuffledQuestionProps } from '../types'
import { ConfidenceBar } from './ConfidenceBar'

/** Kacheln statt Auswahllisten: links antippen, dann rechts. Jedes Paar bekommt eine eigene Farbe. */
export function Matching({ card, rng, onAnswer }: ShuffledQuestionProps<'matching'>) {
  const { prompt, pairs } = card.payload
  // rightOrder[pos] = Originalindex des rechten Elements an Anzeigeposition pos
  const rightOrder = useMemo(() => shuffledIndices(pairs.length, rng), [card.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // choice[i] = gewählter Originalindex des rechten Elements für links i (-1 = noch keiner)
  const [choice, setChoice] = useState<number[]>(() => pairs.map(() => -1))
  const [active, setActive] = useState<number | null>(null)
  const complete = choice.every((c) => c >= 0)

  const tapLeft = (i: number) => {
    if (choice[i]! >= 0) {
      // Ein Paar antippen löst es und wählt die linke Kachel neu aus.
      setChoice((prev) => prev.map((v, k) => (k === i ? -1 : v)))
      setActive(i)
      return
    }
    setActive((a) => (a === i ? null : i))
  }
  const tapRight = (r: number) => {
    if (active === null) return
    setChoice((prev) => prev.map((v, k) => (k === active ? r : v === r ? -1 : v)))
    setActive(null)
  }
  const pairOf = (r: number) => choice.indexOf(r)

  return (
    <section className="ask">
      <span className="ask-kind">Ordne zu</span>
      <p className="question">{prompt}</p>
      <div className="match-grid">
        <div className="stack">
          {pairs.map((p, i) => (
            <button
              key={i}
              type="button"
              className={`tile${active === i ? ' selected' : ''}${choice[i]! >= 0 ? ` pair-${i % 6}` : ''}`}
              aria-pressed={active === i}
              onClick={() => tapLeft(i)}
            >
              {p.left}
            </button>
          ))}
        </div>
        <div className="stack">
          {rightOrder.map((r) => {
            const j = pairOf(r)
            return (
              <button
                key={r}
                type="button"
                className={`tile${j >= 0 ? ` pair-${j % 6}` : ''}`}
                disabled={active === null && j < 0}
                onClick={() => tapRight(r)}
              >
                {pairs[r]!.right}
              </button>
            )
          })}
        </div>
      </div>
      <ConfidenceBar
        disabled={!complete}
        onPick={(c) => onAnswer(checkMatching(choice, card.payload), { kind: 'matching', mapping: choice }, c)}
      />
    </section>
  )
}
