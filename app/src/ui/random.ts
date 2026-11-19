export type Rng = () => number

/** Deterministischer Zufallsgenerator (mulberry32) für Tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates; liefert die Permutation 0..n-1 (perm[pos] = Originalindex). */
export function shuffledIndices(n: number, rng: Rng): number[] {
  const p = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = p[i]!
    p[i] = p[j]!
    p[j] = tmp
  }
  return p
}
