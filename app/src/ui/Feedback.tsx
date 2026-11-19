import type { Card } from '@lernapp/shared'
import type { Outcome } from '../srs/grading'
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
  onNext: () => void
  /** Task 9: „Nachfragen“-Knopf. Ohne diese Funktion wird nichts angezeigt. */
  onAsk?: () => void
}

function Details({ card, answer }: { card: Card; answer: Answer }) {
  if (card.type === 'choice' && answer.kind === 'choice') {
    const { options } = card.payload
    const chosen = options[answer.index]
    const correct = options.find((o) => o.correct)
    return (
      <>
        {chosen && !chosen.correct && (
          <p className="why wrong">
            <strong>Deine Wahl: {chosen.text}</strong>
            <br />
            {chosen.why}
          </p>
        )}
        {correct && (
          <p className="why right">
            <strong>Richtig: {correct.text}</strong>
            <br />
            {correct.why}
          </p>
        )}
      </>
    )
  }
  if (card.type === 'cloze' && answer.kind === 'cloze') {
    return (
      <ul className="answers">
        {card.payload.gaps.map((g, i) => (
          <li key={i} className={answer.perGap[i] ? 'right' : 'wrong'}>
            Lücke {i + 1}: {g.answers.join(' / ')}
            {!answer.perGap[i] && answer.inputs[i] ? ` (du: ${answer.inputs[i]})` : ''}
          </li>
        ))}
      </ul>
    )
  }
  if (card.type === 'matching' && answer.kind === 'matching') {
    return (
      <ul className="answers">
        {card.payload.pairs.map((p, i) => (
          <li key={i} className={answer.mapping[i] === i ? 'right' : 'wrong'}>
            {p.left} → {p.right}
          </li>
        ))}
      </ul>
    )
  }
  if (card.type === 'order') {
    return (
      <ol className="answers">
        {card.payload.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    )
  }
  return null
}

export function Feedback({ card, outcome, answer, onNext, onAsk }: FeedbackProps) {
  return (
    <section className={`feedback ${outcome}`} aria-live="polite">
      <h2 className="pixel">{TITLE[outcome]}</h2>
      <Details card={card} answer={answer} />
      {card.explanation && <p className="explanation">{card.explanation}</p>}
      {card.source && (
        <p className="source">{`${card.source.file}, S. ${card.source.page}: „${card.source.quote}“`}</p>
      )}
      <div className="row">
        {onAsk && (
          <button type="button" onClick={onAsk}>
            Nachfragen
          </button>
        )}
        <button type="button" className="primary" onClick={onNext} autoFocus>
          Weiter
        </button>
      </div>
    </section>
  )
}
