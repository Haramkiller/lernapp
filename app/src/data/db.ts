import Dexie, { type Table } from 'dexie'
import type { Card, Module, Topic } from '@lernapp/shared'
import type { ReviewLog, SrsState } from '../srs/scheduler'

export type StateRow = { cardId: string; state: SrsState; updatedAt: string }
/** Log mit clientseitig erzeugter ID, damit Wiederholungen beim Sync idempotent sind. */
export type LogEntry = ReviewLog & { id: string }
export type OutboxEntry =
  | { id?: number; kind: 'state'; payload: StateRow }
  | { id?: number; kind: 'log'; payload: LogEntry }
/** Dauerhaft abgelehnte Outbox-Einträge (4xx): Quarantäne, damit der Rest weiter synchronisiert. */
export type DeadEntry = { id?: number; kind: 'state' | 'log'; payload: StateRow | LogEntry; error: string }
/** Schlüssel: `lastPull:<tabelle>`, `settings`, `supabaseOverride`, `newDone:<studyDay>`. */
export type MetaEntry = { key: string; value: unknown }

export class LernDb extends Dexie {
  modules!: Table<Module, string>
  topics!: Table<Topic, string>
  cards!: Table<Card, string>
  states!: Table<StateRow, string>
  outbox!: Table<OutboxEntry, number>
  meta!: Table<MetaEntry, string>
  dead!: Table<DeadEntry, number>

  constructor() {
    super('lernapp')
    this.version(1).stores({
      modules: 'id',
      topics: 'id, moduleId',
      cards: 'id, moduleId, topicId',
      states: 'cardId',
      outbox: '++id',
      meta: 'key',
    })
    this.version(2).stores({ dead: '++id' })
  }
}

export const db = new LernDb()
