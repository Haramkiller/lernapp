import { useState, type FormEvent } from 'react'
import { typedAnswers } from '@lernapp/shared'
import { checkTyped } from '../../answers/check'
import type { QuestionProps } from '../types'

/** Auswahlkarte, die sitzt: Antwort selbst eintippen. Kein Treffer → erst Lösung, dann „Doch richtig“ oder „Weiter“. */
export function Typed({ card, onAnswer }: QuestionProps<'choice'>) {
  const { question, options } = card.payload
  const answers = typedAnswers(card.payload) ?? []
  const correct = options.find((o) => o.correct)
  const [text, setText] = useState('')
  const [missed, setMissed] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (missed || !text.trim()) return
    if (checkTyped(text, answers)) onAnswer('right', { kind: 'typed', text, matched: true, overridden: false })
    else setMissed(true)
  }
  const settle = (overridden: boolean) =>
    onAnswer(overridden ? 'right' : 'wrong', { kind: 'typed', text, matched: false, overridden })

  return (
    <form className="ask" onSubmit={submit}>
      <span className="ask-kind">Eintippen</span>
      <p className="question">{question}</p>
      <div className="text-field">
        <input
          className="typed-input"
          aria-label="Deine Antwort"
          placeholder="Antwort eintippen …"
          value={text}
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          disabled={missed}
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
      <div className="answer-bar">
        {missed ? (
          <>
            <button type="button" className="cta" onClick={() => settle(true)}>
              Doch richtig
            </button>
            <button type="button" className="primary cta" onClick={() => settle(false)}>
              Weiter
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="cta"
              onClick={() => onAnswer('wrong', { kind: 'typed', text: '', matched: false, overridden: false })}
            >
              Weiß nicht
            </button>
            <button type="submit" className="primary cta" disabled={!text.trim()}>
              Prüfen
            </button>
          </>
        )}
      </div>
    </form>
  )
}
