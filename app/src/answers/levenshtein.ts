/** Klassischer Levenshtein-Abstand (Einfügen, Löschen, Ersetzen je 1). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i]
    for (let j = 1; j <= b.length; j++) {
      const sub = (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)
      cur.push(Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, sub))
    }
    prev = cur
  }
  return prev[b.length] ?? 0
}
