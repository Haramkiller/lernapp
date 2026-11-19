import { useState } from 'react'
import type { Outcome } from '../../srs/grading'
import type { QuestionProps } from '../types'

export function Free({ card, onAnswer }: QuestionProps<'free'>) {
  const { question, modelAnswer, keyPoints } = card.payload
  const [text, setText] = useState('')
  const [revealed, setRevealed] = useState(false)
  const rate = (o: Outcome) => onAnswer(o, { kind: 'free' })

  return (
    <section>
      <p className="question">{question}</p>
      <textarea aria-label="Deine Antwort" rows={4} value={text} onChange={(e) => setText(e.target.value)} disabled={revealed} />
      {!revealed ? (
        <button type="button" className="primary" onClick={() => setRevealed(true)}>
          Lösung zeigen
        </button>
      ) : (
        <>
          <div className="solution">
            <h3>Musterantwort</h3>
            <p>{modelAnswer}</p>
            <h3>Kernpunkte</h3>
            <ul>
              {keyPoints.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          </div>
          <div className="row">
            <button type="button" className="right" onClick={() => rate('right')}>
              Gewusst
            </button>
            <button type="button" className="partial" onClick={() => rate('partial')}>
              Teilweise
            </button>
            <button type="button" className="wrong" onClick={() => rate('wrong')}>
              Nicht gewusst
            </button>
          </div>
        </>
      )}
    </section>
  )
}
