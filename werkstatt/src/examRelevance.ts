import { normalize, type Card } from '@lernapp/shared'

/** Markiert Karten als prüfungsrelevant, deren Thema (normalisiert) in `examTopics` vorkommt. */
export function markExamRelevant(
  cards: Card[],
  topics: { id: string; name: string }[],
  examTopics: string[],
): Card[] {
  const wanted = new Set(examTopics.map(normalize))
  const relevantTopicIds = new Set(topics.filter((t) => wanted.has(normalize(t.name))).map((t) => t.id))
  const now = new Date().toISOString()
  return cards.map((c) =>
    !c.examRelevant && relevantTopicIds.has(c.topicId) ? { ...c, examRelevant: true, updatedAt: now } : c,
  )
}
