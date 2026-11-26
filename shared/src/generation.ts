import { CardDraftSchema, type CardDraft, type GenerationResult } from './card'
import type { ZodError } from 'zod'

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

export interface ParseOutcome {
  result: GenerationResult
  rejected: { index: number; reason: string }[]
}

function stripFence(raw: string): string {
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i)
  return m && m[1] && m[1].includes('{') ? m[1] : raw
}

/** Liefert die vollständigen Objekte eines (evtl. abgeschnittenen) Arrays, beginnend bei `start` (Index von '['). */
function completeObjects(text: string, start: number): string[] {
  const out: string[] = []
  let depth = 0
  let inString = false
  let escaped = false
  let objStart = -1
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') {
      if (depth === 1 && ch === '{') objStart = i
      depth++
    } else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 1 && ch === '}' && objStart >= 0) {
        out.push(text.slice(objStart, i + 1))
        objStart = -1
      }
      if (depth === 0) break
    }
  }
  return out
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

/** Zieht rohe Karten (unvalidiert) und optionale Metadaten aus Claudes Antwort. */
function extract(raw: string): { cards: unknown[]; styleProfile?: unknown; examTopics?: unknown } {
  const text = stripFence(raw)
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const whole = tryParse(text.slice(firstBrace, lastBrace + 1))
    if (whole && typeof whole === 'object' && Array.isArray((whole as { cards?: unknown }).cards)) {
      return whole as { cards: unknown[] }
    }
  }
  const firstBracket = text.indexOf('[')
  if (firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace)) {
    const arr = tryParse(text.slice(firstBracket, text.lastIndexOf(']') + 1))
    if (Array.isArray(arr)) return { cards: arr }
  }
  // Rettung: Array hinter "cards" ggf. abgeschnitten
  const m = /"cards"\s*:\s*\[/.exec(text)
  const arrStart = m ? m.index + m[0].length - 1 : firstBracket
  if (arrStart >= 0) {
    const cards = completeObjects(text, arrStart)
      .map(tryParse)
      .filter((x) => x !== undefined)
    if (cards.length > 0) return { cards }
  }
  throw new ParseError('Die Antwort von Claude enthielt kein auswertbares JSON mit Karten.')
}

function reasonOf(err: ZodError): string {
  return err.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(Karte)'}: ${i.message}`)
    .join('; ')
}

export function parseGeneration(raw: string): ParseOutcome {
  const { cards: rawCards, styleProfile, examTopics } = extract(raw)
  const cards: CardDraft[] = []
  const rejected: ParseOutcome['rejected'] = []
  rawCards.forEach((c, index) => {
    const r = CardDraftSchema.safeParse(c)
    if (r.success) cards.push(r.data)
    else rejected.push({ index, reason: reasonOf(r.error) })
  })
  const result: GenerationResult = { cards }
  if (typeof styleProfile === 'string' && styleProfile.trim()) result.styleProfile = styleProfile
  if (Array.isArray(examTopics)) result.examTopics = examTopics.filter((t): t is string => typeof t === 'string')
  return { result, rejected }
}

/** Beispiel einer Antwort im erwarteten JSON-Format (für Aufträge an Claude). */
export const CARD_EXAMPLE = `{
  "cards": [
    {
      "topic": "Name des Themas",
      "type": "choice",
      "payload": {
        "question": "…?",
        "options": [
          { "text": "…", "correct": true,  "why": "Warum richtig" },
          { "text": "…", "correct": false, "why": "Warum falsch" },
          { "text": "…", "correct": false, "why": "Warum falsch" },
          { "text": "…", "correct": false, "why": "Warum falsch" }
        ]
      },
      "explanation": "Kurze Erklärung (1–2 Sätze).",
      "source": { "file": "dateiname.pdf", "page": 17, "quote": "Kurzes wörtliches Zitat" },
      "examRelevant": false,
      "fromExam": false,
      "difficulty": 2
    }
  ]
}`

/** Regeln für Fragetypen und ihr payload (für Aufträge an Claude). */
export const PAYLOAD_RULES = `Frage-Typen und ihr "payload" (genau so, keine weiteren Felder nötig):
- "choice": { "question", "options": [genau 4 × { "text", "correct", "why" }] } – genau EINE Option mit correct=true; "why" bei JEDER Option (auch bei der richtigen) begründet kurz, warum sie stimmt bzw. falsch ist.
- "cloze": { "text": "Satz mit Platzhaltern {{1}}, {{2}} …", "gaps": [{ "answers": ["Lösung", "Alternativschreibweise"] }, …] } – Platzhalter {{1}}..{{n}} kommen im Text genau einmal je Lücke vor, gaps[0] gehört zu {{1}} usw.
- "matching": { "prompt", "pairs": [3 bis 6 × { "left", "right" }] }
- "order": { "prompt", "steps": [3 bis 8 Schritte in der KORREKTEN Reihenfolge] }
- "free": { "question", "modelAnswer", "keyPoints": [mindestens 1 Stichpunkt] }
Weitere Felder je Karte: "topic" (Thema), "explanation" (kurz!), "source" ({file, page, quote} oder null), "examRelevant" (bool), "fromExam" (bool), "difficulty" (1, 2 oder 3).`
