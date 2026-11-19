import type { SupabaseClient } from '@supabase/supabase-js'
import {
  logToRow,
  rowToCard,
  rowToModule,
  rowToState,
  rowToTopic,
  stateToRow,
  type Card,
  type CardRow,
  type Module,
  type ModuleRow,
  type StateDbRow,
  type Topic,
  type TopicRow,
} from '@lernapp/shared'
import type { SrsState } from '../srs/scheduler'
import type { LogEntry, StateRow } from './db'

export interface Remote {
  /** Zeilen mit `updated_at > iso`. */
  pullSince(iso: string): Promise<{ modules: Module[]; topics: Topic[]; cards: Card[]; states: StateRow[] }>
  /** Upsert auf `card_id`. */
  pushStates(s: StateRow[]): Promise<void>
  /** Upsert auf `id` (append-only, idempotent). */
  pushLogs(l: LogEntry[]): Promise<void>
}

const PAGE = 1000

export function createSupabaseRemote(client: SupabaseClient): Remote {
  async function fetchAll<R>(table: string, since: string): Promise<R[]> {
    const out: R[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from(table)
        .select('*')
        .gt('updated_at', since)
        .order('updated_at', { ascending: true })
        .order(table === 'card_states' ? 'card_id' : 'id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as R[]
      out.push(...rows)
      if (rows.length < PAGE) return out
    }
  }

  async function upsert(table: string, rows: object[], onConflict: string): Promise<void> {
    if (rows.length === 0) return
    const { error } = await client.from(table).upsert(rows, { onConflict })
    if (error) throw new Error(error.message)
  }

  return {
    async pullSince(iso) {
      const [modules, topics, cards, states] = await Promise.all([
        fetchAll<ModuleRow>('modules', iso),
        fetchAll<TopicRow>('topics', iso),
        fetchAll<CardRow>('cards', iso),
        fetchAll<StateDbRow<SrsState>>('card_states', iso),
      ])
      return {
        modules: modules.map(rowToModule),
        topics: topics.map(rowToTopic),
        cards: cards.map(rowToCard),
        states: states.map(rowToState),
      }
    },
    pushStates: (s) => upsert('card_states', s.map(stateToRow), 'card_id'),
    pushLogs: (l) => upsert('review_logs', l.map(logToRow), 'id'),
  }
}
