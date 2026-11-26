import type { Card } from './card'

/**
 * Zeilen-Mapper zwischen Supabase-Spalten (snake_case) und App-Typen (camelCase).
 * `user_id` fehlt beim Schreiben bewusst: die DB füllt es per `default auth.uid()`.
 */

export type Module = {
  id: string
  name: string
  examDate: string | null
  styleProfile: string | null
  updatedAt: string
}

export type Topic = {
  id: string
  moduleId: string
  name: string
  updatedAt: string
}

/** Zustand einer Karte, generisch über das SRS-Format (liegt in der App). */
export type StateEntry<S = unknown> = { cardId: string; state: S; updatedAt: string }

export type LogInput = {
  id: string
  cardId: string
  rating: 1 | 2 | 3 | 4
  reviewedAt: string
  studyDay: string
  elapsedDays: number
  confidence?: 'sure' | 'unsure'
  outcome?: 'right' | 'partial' | 'wrong'
}

export type ModuleRow = {
  id: string
  name: string
  exam_date: string | null
  style_profile: string | null
  updated_at: string
}
export type TopicRow = { id: string; module_id: string; name: string; updated_at: string }
export type CardRow = {
  id: string
  module_id: string
  topic_id: string
  type: Card['type']
  payload: Card['payload']
  explanation: string
  source: Card['source']
  exam_relevant: boolean
  from_exam: boolean
  difficulty: Card['difficulty']
  created_at: string
  updated_at: string
  deleted: boolean
}
export type StateDbRow<S = unknown> = { card_id: string; state: S; updated_at: string }
export type LogRow = {
  id: string
  card_id: string
  rating: 1 | 2 | 3 | 4
  reviewed_at: string
  study_day: string
  elapsed_days: number
  confidence?: 'sure' | 'unsure' | null
  outcome?: 'right' | 'partial' | 'wrong' | null
}

/** Normalisiert Postgres-Zeitstempel (+00:00, +01:00, Mikrosekunden) auf ISO-UTC mit Millisekunden. */
export const isoUtc = (s: string): string => new Date(s).toISOString()

export const moduleToRow = (m: Module): ModuleRow => ({
  id: m.id,
  name: m.name,
  exam_date: m.examDate,
  style_profile: m.styleProfile,
  updated_at: m.updatedAt,
})
export const rowToModule = (r: ModuleRow): Module => ({
  id: r.id,
  name: r.name,
  examDate: r.exam_date,
  styleProfile: r.style_profile,
  updatedAt: isoUtc(r.updated_at),
})

export const topicToRow = (t: Topic): TopicRow => ({
  id: t.id,
  module_id: t.moduleId,
  name: t.name,
  updated_at: t.updatedAt,
})
export const rowToTopic = (r: TopicRow): Topic => ({
  id: r.id,
  moduleId: r.module_id,
  name: r.name,
  updatedAt: isoUtc(r.updated_at),
})

export const cardToRow = (c: Card): CardRow => ({
  id: c.id,
  module_id: c.moduleId,
  topic_id: c.topicId,
  type: c.type,
  payload: c.payload,
  explanation: c.explanation,
  source: c.source,
  exam_relevant: c.examRelevant,
  from_exam: c.fromExam,
  difficulty: c.difficulty,
  created_at: c.createdAt,
  updated_at: c.updatedAt,
  deleted: c.deleted,
})
export const rowToCard = (r: CardRow): Card =>
  ({
    id: r.id,
    moduleId: r.module_id,
    topicId: r.topic_id,
    type: r.type,
    payload: r.payload,
    explanation: r.explanation,
    source: r.source,
    examRelevant: r.exam_relevant,
    fromExam: r.from_exam,
    difficulty: r.difficulty,
    createdAt: isoUtc(r.created_at),
    updatedAt: isoUtc(r.updated_at),
    deleted: r.deleted,
  }) as Card

export const stateToRow = <S>(s: StateEntry<S>): StateDbRow<S> => ({
  card_id: s.cardId,
  state: s.state,
  updated_at: s.updatedAt,
})
export const rowToState = <S>(r: StateDbRow<S>): StateEntry<S> => ({
  cardId: r.card_id,
  state: r.state,
  updatedAt: isoUtc(r.updated_at),
})

export const logToRow = (l: LogInput): LogRow => ({
  id: l.id,
  card_id: l.cardId,
  rating: l.rating,
  reviewed_at: l.reviewedAt,
  study_day: l.studyDay,
  elapsed_days: l.elapsedDays,
  // Nur mitschicken, wenn vorhanden: Logs ohne Einschätzung funktionieren auch ohne die neuen Spalten.
  ...(l.confidence ? { confidence: l.confidence } : {}),
  ...(l.outcome ? { outcome: l.outcome } : {}),
})
