import { normalize, parseGeneration, type Card, type CardDraft, type Module, type Topic } from '@lernapp/shared'

export type ImportTarget = { kind: 'existing'; module: Module } | { kind: 'new'; name: string }
export type ModuleContent = { topics: Topic[]; cards: Card[] }
export type Prepared = {
  /** Bei 'new' frisch angelegt. */
  module: Module
  isNewModule: boolean
  /** Nur neu anzulegende Themen. */
  topics: Topic[]
  /** Nur neue Karten, ohne Doppel. */
  cards: Card[]
  /** Erkannte gültige Karten (vor der Doppel-Prüfung). */
  found: number
  rejected: number
  duplicates: number
}

function questionText(d: Pick<CardDraft, 'type' | 'payload'>): string {
  switch (d.type) {
    case 'choice':
    case 'free':
      return (d.payload as { question: string }).question
    case 'cloze':
      return (d.payload as { text: string }).text
    case 'matching':
    case 'order':
      return (d.payload as { prompt: string }).prompt
  }
}

/** Doppel-Schlüssel: Typ und normalisierter Fragetext. */
export const questionKey = (d: Pick<CardDraft, 'type' | 'payload'>): string => `${d.type}|${normalize(questionText(d))}`

/** Wertet eine eingefügte Antwort aus; wirft ParseError, wenn sie kein JSON mit Karten enthält. */
export function prepareImport(
  raw: string,
  target: ImportTarget,
  existing: ModuleContent,
  now: Date,
  newId: () => string = () => crypto.randomUUID(),
): Prepared {
  const { result, rejected } = parseGeneration(raw)
  const stamp = now.toISOString()
  const module: Module =
    target.kind === 'existing' ? target.module : { id: newId(), name: target.name.trim(), examDate: null, styleProfile: null, updatedAt: stamp }

  const seen = new Set(existing.cards.filter((c) => !c.deleted).map(questionKey))
  const byName = new Map(existing.topics.map((t) => [normalize(t.name), t]))
  const topics: Topic[] = []
  const cards: Card[] = []
  let duplicates = 0
  for (const d of result.cards) {
    const key = questionKey(d)
    if (seen.has(key)) {
      duplicates++
      continue
    }
    seen.add(key)
    const name = normalize(d.topic)
    let topic = byName.get(name)
    if (!topic) {
      topic = { id: newId(), moduleId: module.id, name: d.topic.trim(), updatedAt: stamp }
      byName.set(name, topic)
      topics.push(topic)
    }
    const { topic: _t, ...rest } = d
    cards.push({ ...rest, id: newId(), moduleId: module.id, topicId: topic.id, createdAt: stamp, updatedAt: stamp, deleted: false } as Card)
  }
  return { module, isNewModule: target.kind === 'new', topics, cards, found: result.cards.length, rejected: rejected.length, duplicates }
}
