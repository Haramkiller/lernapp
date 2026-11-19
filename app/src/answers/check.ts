import { normalize } from '@lernapp/shared'
import type { ChoicePayload, ClozePayload, MatchingPayload, OrderPayload } from '@lernapp/shared'
import type { Outcome } from '../srs/grading'
import { levenshtein } from './levenshtein'

function tolerance(normalizedAnswer: string): number {
  const n = normalizedAnswer.length
  return n >= 10 ? 2 : n >= 5 ? 1 : 0
}

function gapMatches(input: string, answers: string[]): boolean {
  const given = normalize(input)
  return answers.some((answer) => {
    const expected = normalize(answer)
    return given === expected || levenshtein(given, expected) <= tolerance(expected)
  })
}

function ratio(correct: number, total: number): Outcome {
  if (correct === total) return 'right'
  return correct * 2 >= total ? 'partial' : 'wrong'
}

export function checkCloze(inputs: string[], payload: ClozePayload): { perGap: boolean[]; outcome: Outcome } {
  const perGap = payload.gaps.map((g, i) => gapMatches(inputs[i] ?? '', g.answers))
  return { perGap, outcome: ratio(perGap.filter(Boolean).length, perGap.length) }
}

export function checkChoice(index: number, p: ChoicePayload): Outcome {
  return p.options[index]?.correct ? 'right' : 'wrong'
}

/** mapping[i] = Index des rechten Elements, das der Linken i zugeordnet wurde; richtig bei mapping[i] === i. */
export function checkMatching(mapping: number[], p: MatchingPayload): Outcome {
  const correct = p.pairs.filter((_, i) => mapping[i] === i).length
  return ratio(correct, p.pairs.length)
}

/** order[pos] = Index des Schritts, den der Nutzer an Position pos gesetzt hat; richtig bei order[pos] === pos. */
export function checkOrder(order: number[], p: OrderPayload): Outcome {
  const wrong = p.steps.map((_, i) => i).filter((i) => order[i] !== i)
  if (wrong.length === 0) return 'right'
  const [a, b] = wrong
  const adjacentSwap = wrong.length === 2 && a !== undefined && b !== undefined && b === a + 1 && order[a] === b && order[b] === a
  return adjacentSwap ? 'partial' : 'wrong'
}
