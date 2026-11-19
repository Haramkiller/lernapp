const DAY_START_HOUR = 4

/** Lerntag als 'YYYY-MM-DD' in Ortszeit; der Tag wechselt um 04:00. */
export function studyDay(date: Date): string {
  const shifted = new Date(date.getTime())
  shifted.setHours(shifted.getHours() - DAY_START_HOUR)
  const y = shifted.getFullYear()
  const m = String(shifted.getMonth() + 1).padStart(2, '0')
  const d = String(shifted.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
