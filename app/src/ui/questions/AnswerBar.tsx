/** Feste Leiste unten mit dem großen „Prüfen“-Knopf (wie in gängigen Lern-Apps). */
export function AnswerBar({
  label = 'Prüfen',
  disabled,
  onClick,
  submit,
}: {
  label?: string
  disabled?: boolean
  onClick?: () => void
  /** Als Absenden-Knopf eines Formulars (Lückentext: Enter prüft). */
  submit?: boolean
}) {
  return (
    <div className="answer-bar">
      <button type={submit ? 'submit' : 'button'} className="primary cta" disabled={disabled} onClick={onClick}>
        {label}
      </button>
    </div>
  )
}
