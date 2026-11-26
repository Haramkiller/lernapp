import { useLayoutEffect, useRef, useState } from 'react'
import type { Outcome } from '../../srs/grading'
import type { QuestionProps } from '../types'
import { AnswerBar } from './AnswerBar'

/** Selbstbewertung wie bei Anki: drei große Farbknöpfe mit kurzem Hinweis, wann die Karte wiederkommt. */
const RATINGS: { outcome: Outcome; label: string; hint: string }[] = [
  { outcome: 'wrong', label: 'Nicht gewusst', hint: 'bald wieder' },
  { outcome: 'partial', label: 'Teilweise', hint: 'etwas später' },
  { outcome: 'right', label: 'Gewusst', hint: 'viel später' },
]

export function Free({ card, onAnswer }: QuestionProps<'free'>) {
  const { question, modelAnswer, keyPoints } = card.payload
  const [text, setText] = useState('')
  const [revealed, setRevealed] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const rate = (o: Outcome) => onAnswer(o, { kind: 'free', text }, null)

  // Das Feld wächst mit dem Text, statt innen zu scrollen.
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 4}px`
  }, [text])

  return (
    <section className="ask">
      <span className="ask-kind">Erkläre</span>
      <p className="question">{question}</p>
      <div className="text-field">
        <textarea
          ref={area}
          aria-label="Deine Antwort"
          rows={4}
          placeholder="Schreib deine Antwort in eigenen Worten …"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={revealed}
        />
        <span className="count" aria-hidden={revealed}>{`${text.length} Zeichen`}</span>
      </div>
      {revealed && (
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
      )}
      {!revealed ? (
        <AnswerBar label="Lösung zeigen" onClick={() => setRevealed(true)} />
      ) : (
        <div className="answer-bar rate-bar">
          {RATINGS.map((r) => (
            <button key={r.outcome} type="button" className={`rate ${r.outcome}`} aria-label={r.label} onClick={() => rate(r.outcome)}>
              {r.label}
              <small>{r.hint}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
