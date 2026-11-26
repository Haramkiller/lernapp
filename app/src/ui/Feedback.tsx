import { typedAnswers, type Card } from '@lernapp/shared'
import type { Confidence, Outcome } from '../srs/grading'
import type { Answer } from './types'

const TITLE: Record<Outcome, string> = {
  right: 'Richtig!',
  partial: 'Teilweise richtig',
  wrong: 'Leider falsch',
}

export type FeedbackProps = {
  card: Card
  outcome: Outcome
  answer: Answer
  /** Einschätzung vor dem Aufdecken (null/fehlt: keine). */
  confidence?: Confidence | null
  onNext: () => void
  /** Task 9: „Nachfragen“-Knopf. Ohne diese Funktion wird nichts angezeigt. */
  onAsk?: () => void
}

/** Fragetext oben in der Rückmeldung, damit man Antwort und Frage vergleichen kann. */
function questionOf(card: Card): string {
  switch (card.type) {
    case 'choice':
    case 'free':
      return card.payload.question
    case 'matching':
    case 'order':
      return card.payload.prompt
    case 'cloze':
      return card.payload.text.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => `[Lücke ${n}]`)
  }
}

const ICON: Record<Outcome, string> = { right: '✓', partial: '~', wrong: '✕' }

const mark = (ok: boolean) => (ok ? '✓' : '✗')
const empty = (s: string | undefined) => (s && s.trim() ? s : '(leer)')

function Details({ card, answer }: { card: Card; answer: Answer }) {
  if (card.type === 'choice' && answer.kind === 'choice') {
    const { options } = card.payload
    const chosen = options[answer.index]
    const correct = options.find((o) => o.correct)
    return (
      <>
        {chosen && (
          <p className={`why ${chosen.correct ? 'right' : 'wrong'}`}>
            <strong>
              {mark(chosen.correct)} Deine Wahl: {chosen.text}
            </strong>
            <br />
            {chosen.why}
          </p>
        )}
        {correct && !chosen?.correct && (
          <p className="why right">
            <strong>Richtig: {correct.text}</strong>
            <br />
            {correct.why}
          </p>
        )}
      </>
    )
  }
  if (card.type === 'choice' && answer.kind === 'typed') {
    const correct = card.payload.options.find((o) => o.correct)
    const solution = typedAnswers(card.payload)?.[0] ?? correct?.text
    const ok = answer.matched || answer.overridden
    return (
      <>
        <p className={`why ${ok ? 'right' : 'wrong'}`}>
          <strong>
            {mark(ok)} Deine Antwort: {answer.text.trim() || '(weiß nicht)'}
            {answer.overridden && ' (selbst als richtig gewertet)'}
          </strong>
        </p>
        {!answer.matched && (
          <p className="why right">
            <strong>Richtig: {solution}</strong>
            {correct && (
              <>
                <br />
                {correct.why}
              </>
            )}
          </p>
        )}
      </>
    )
  }
  if (card.type === 'cloze' && answer.kind === 'cloze') {
    return (
      <ul className="compare">
        {card.payload.gaps.map((g, i) => {
          const ok = Boolean(answer.perGap[i])
          return (
            <li key={i} className={ok ? 'right' : 'wrong'}>
              {mark(ok)} Lücke {i + 1}: du: {empty(answer.inputs[i])}
              {!ok && <span className="correct"> – richtig: {g.answers.join(' / ')}</span>}
            </li>
          )
        })}
      </ul>
    )
  }
  if (card.type === 'matching' && answer.kind === 'matching') {
    const { pairs } = card.payload
    return (
      <ul className="compare">
        {pairs.map((p, i) => {
          const ok = answer.mapping[i] === i
          return (
            <li key={i} className={ok ? 'right' : 'wrong'}>
              {mark(ok)} {p.left} → du: {empty(pairs[answer.mapping[i] ?? -1]?.right)}
              {!ok && <span className="correct"> – richtig: {p.right}</span>}
            </li>
          )
        })}
      </ul>
    )
  }
  if (card.type === 'order' && answer.kind === 'order') {
    const { steps } = card.payload
    return (
      <div className="compare-cols">
        <div>
          <h3>Deine Reihenfolge</h3>
          <ol className="compare">
            {answer.order.map((orig, pos) => (
              <li key={pos} className={orig === pos ? 'right' : 'wrong'}>
                {mark(orig === pos)} {steps[orig]}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3>Richtige Reihenfolge</h3>
          <ol className="compare">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      </div>
    )
  }
  if (card.type === 'free' && answer.kind === 'free') {
    return (
      <>
        <div className="why">
          <strong>Deine Antwort:</strong>
          <p className="own">{empty(answer.text)}</p>
        </div>
        <div className="why right">
          <strong>Musterantwort:</strong>
          <p>{card.payload.modelAnswer}</p>
          <strong>Kernpunkte:</strong>
          <ul>
            {card.payload.keyPoints.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>
      </>
    )
  }
  return null
}

/** Hinweis zur Einschätzung: Überraschung bei „sicher, aber falsch“ hervorheben (bleibt besser hängen). */
function ConfidenceHint({ outcome, confidence }: { outcome: Outcome; confidence?: Confidence | null }) {
  if (confidence === 'sure' && outcome === 'wrong') return <p className="surprise">Du warst dir sicher – genau diese Stelle merken.</p>
  if (confidence === 'sure' && outcome === 'partial') return <p className="surprise soft">Du warst dir sicher, aber es fehlt noch etwas.</p>
  if (confidence === 'unsure' && outcome === 'right') return <p className="muted">Richtig, aber unsicher – kommt etwas früher wieder.</p>
  return null
}

export function Feedback({ card, outcome, answer, confidence, onNext, onAsk }: FeedbackProps) {
  return (
    <section className={`feedback ${outcome}`} aria-live="polite">
      <h2 className="pixel feedback-title">
        <span className="feedback-icon" aria-hidden="true">
          {ICON[outcome]}
        </span>
        {TITLE[outcome]}
      </h2>
      <ConfidenceHint outcome={outcome} confidence={confidence} />
      <p className="question">{questionOf(card)}</p>
      <Details card={card} answer={answer} />
      {card.explanation && <p className="explanation">{card.explanation}</p>}
      {card.source && (
        <p className="source">{`${card.source.file}, S. ${card.source.page}: „${card.source.quote}“`}</p>
      )}
      <div className="answer-bar feedback-bar">
        {onAsk && (
          <button type="button" onClick={onAsk}>
            Nachfragen
          </button>
        )}
        <button type="button" className="primary cta" onClick={onNext} autoFocus>
          Weiter
        </button>
      </div>
    </section>
  )
}
