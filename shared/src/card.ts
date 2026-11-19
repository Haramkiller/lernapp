import { z } from 'zod'

export const QuestionTypeSchema = z.enum(['choice', 'cloze', 'matching', 'order', 'free'])
export type QuestionType = z.infer<typeof QuestionTypeSchema>

export const SourceSchema = z.object({
  file: z.string().min(1),
  page: z.number().int().min(1),
  quote: z.string(),
})
export type Source = z.infer<typeof SourceSchema>

const text = z.string().min(1)

export const ChoicePayloadSchema = z.object({
  question: text,
  options: z
    .array(z.object({ text, correct: z.boolean(), why: text }))
    .length(4)
    .refine((o) => o.filter((x) => x.correct).length === 1, { message: 'Genau eine Option muss richtig sein' }),
})
export type ChoicePayload = z.infer<typeof ChoicePayloadSchema>

export const ClozePayloadSchema = z
  .object({
    text,
    gaps: z.array(z.object({ answers: z.array(text).min(1) })).min(1),
  })
  .refine(
    (p) => {
      const found = [...p.text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))
      if (found.length !== p.gaps.length) return false
      const sorted = [...found].sort((a, b) => a - b)
      return sorted.every((n, i) => n === i + 1)
    },
    { message: 'Platzhalter {{1}}…{{n}} müssen genau einmal je Lücke vorkommen' },
  )
export type ClozePayload = z.infer<typeof ClozePayloadSchema>

export const MatchingPayloadSchema = z.object({
  prompt: text,
  pairs: z.array(z.object({ left: text, right: text })).min(3).max(6),
})
export type MatchingPayload = z.infer<typeof MatchingPayloadSchema>

export const OrderPayloadSchema = z.object({
  prompt: text,
  steps: z.array(text).min(3).max(8),
})
export type OrderPayload = z.infer<typeof OrderPayloadSchema>

export const FreePayloadSchema = z.object({
  question: text,
  modelAnswer: text,
  keyPoints: z.array(text).min(1),
})
export type FreePayload = z.infer<typeof FreePayloadSchema>

const difficulty = z.union([z.literal(1), z.literal(2), z.literal(3)])

const cardFields = {
  explanation: z.string(),
  source: SourceSchema.nullable(),
  examRelevant: z.boolean(),
  fromExam: z.boolean(),
  difficulty,
}

const variant = <T extends QuestionType, P extends z.ZodTypeAny>(type: T, payload: P) =>
  z.object({ type: z.literal(type), payload, topic: text, ...cardFields })

export const CardDraftSchema = z.discriminatedUnion('type', [
  variant('choice', ChoicePayloadSchema),
  variant('cloze', ClozePayloadSchema),
  variant('matching', MatchingPayloadSchema),
  variant('order', OrderPayloadSchema),
  variant('free', FreePayloadSchema),
])
export type CardDraft = z.infer<typeof CardDraftSchema>

export const GenerationResultSchema = z.object({
  cards: z.array(CardDraftSchema),
  styleProfile: z.string().optional(),
  examTopics: z.array(z.string()).optional(),
})
export type GenerationResult = z.infer<typeof GenerationResultSchema>

export type CardPayload = CardDraft['payload']

/** Persistierte Karte: Entwurf ohne `topic`, dafür mit Identität, Zuordnung und Zeitstempeln. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type Card = DistributiveOmit<CardDraft, 'topic'> & {
  id: string
  moduleId: string
  topicId: string
  createdAt: string
  updatedAt: string
  deleted: boolean
}
