import type { Confidence } from '../../srs/grading'

/** Feste Leiste unten: statt „Prüfen“ sagt man gleich, wie sicher man ist (kein Extra-Tippen). */
export function ConfidenceBar({ disabled, onPick }: { disabled?: boolean; onPick: (c: Confidence) => void }) {
  return (
    <div className="answer-bar confidence-bar">
      <button type="button" className="cta unsure" disabled={disabled} onClick={() => onPick('unsure')}>
        Unsicher
      </button>
      <button type="button" className="primary cta sure" disabled={disabled} onClick={() => onPick('sure')}>
        Sicher
      </button>
    </div>
  )
}
