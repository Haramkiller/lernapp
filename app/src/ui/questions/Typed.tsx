import { useState, type FormEvent } from 'react'
import { typedAnswers } from '@lernapp/shared'
import { checkTyped } from '../../answers/check'
import type { Confidence } from '../../srs/grading'
import type { QuestionProps } from '../types'
import { ConfidenceBar } from './ConfidenceBar'

/** Auswahlkarte, die sitzt: Antwort selbst eintippen. Kein Treffer → erst Lösung, dann „Doch richtig“ oder „Weiter“. */
export function Typed({ card, onAnswer }: QuestionProps<'choice'>) {
  const { question, options } = card.payload
  const answers = typedAnswers(card.payload) ?? []
  const correct = options.find((o) => o.correct)
  const [text, setText] = useState('')
  // Gesetzt, sobald eine nicht erkannte Eingabe geprüft wurde: die vorher gewählte Einschätzung.
  const [missed, setMissed] = useState<Confidence | null>(null)

  // Enter schickt nicht ab: man soll sich bewusst für „Sicher“ oder „Unsicher“ entscheiden.
  // Die Handy-Taste „Fertig“ schließt nur die Tastatur.
  const noSubmit = (e: FormEvent) => {
    e.preventDefault()
    ;(document.activeElement as HTMLElement | null)?.blur()
  }
  const check = (c: Confidence) => {
    if (missed || !text.trim()) return
    if (checkTyped(text, answers)) onAnswer('right', { kind: 'typed', text, matched: true, overridden: false }, c)
    else setMissed(c)
  }
  const settle = (overridden: boolean) =>
    missed && onAnswer(overridden ? 'right' : 'wrong', { kind: 'typed', text, matched: false, overridden }, missed)

  return (
    <form className="ask" onSubmit={noSubmit}>
      <span className="ask-kind">Eintippen</span>
      <p className="question">{question}</p>
      <div className="text-field">
        <input
          className="typed-input"
          aria-label="Deine Antwort"
          placeholder="Antwort eintippen …"
          value={text}
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="done"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          disabled={missed !== null}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {missed && (
        <div className="solution">
          <p>
            <strong>Lösung: {answers[0]}</strong>
          </p>
          <p>Deine Antwort: {text}</p>
          {correct && <p className="why">{correct.why}</p>}
        </div>
      )}
      {missed ? (
        <div className="answer-bar">
          <button type="button" className="cta" onClick={() => settle(true)}>
            Doch richtig
          </button>
          <button type="button" className="primary cta" onClick={() => settle(false)}>
            Weiter
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="link dont-know"
            onClick={() => onAnswer('wrong', { kind: 'typed', text: '', matched: false, overridden: false }, 'unsure')}
          >
            Weiß nicht
          </button>
          <ConfidenceBar disabled={!text.trim()} onPick={check} />
        </>
      )}
    </form>
  )
}
