import Dexie, { type Table } from 'dexie'
import type { Card, Module, Topic } from '@lernapp/shared'
import type { ReviewLog, SrsState } from '../srs/scheduler'

export type StateRow = { cardId: string; state: SrsState; updatedAt: string }
/** Log mit clientseitig erzeugter ID, damit Wiederholungen beim Sync idempotent sind. */
export type LogEntry = ReviewLog & { id: string }
/** Echte Spielentscheidungen und Funde (Stufe 1b). IDs z. B. `area:<moduleId>`, `rest`. */
export type GameItem = { id: string; data: Record<string, unknown>; updatedAt: string }
export type OutboxEntry =
  | { id?: number; kind: 'state'; payload: StateRow }
  | { id?: number; kind: 'log'; payload: LogEntry }
  | { id?: number; kind: 'game'; payload: GameItem }
/** Dauerhaft abgelehnte Outbox-Einträge (4xx): Quarantäne, damit der Rest weiter synchronisiert. */
export type DeadEntry = { id?: number; kind: 'state' | 'log' | 'game'; payload: StateRow | LogEntry | GameItem; error: string }
/** Schlüssel: `lastPull:<tabelle>`, `settings`, `supabaseOverride`, `newDone:<studyDay>`, `owner`, `signedIn` (siehe account.ts). */
export type MetaEntry = { key: string; value: unknown }

export class LernDb extends Dexie {
  modules!: Table<Module, string>
  topics!: Table<Topic, string>
  cards!: Table<Card, string>
  states!: Table<StateRow, string>
  outbox!: Table<OutboxEntry, number>
  meta!: Table<MetaEntry, string>
  dead!: Table<DeadEntry, number>
  game!: Table<GameItem, string>

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
    this.version(3).stores({ game: 'id' })
  }
}

export const db = new LernDb()
