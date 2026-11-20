import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isoUtc,
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
import type { GameItem, LogEntry, StateRow } from './db'

export type SyncTable = 'modules' | 'topics' | 'cards' | 'states' | 'game'
/** Pro Tabelle ein ISO-Zeitstempel (Serverzeit `synced_at`). */
export type Cursors = Record<SyncTable, string>

export type Pulled = {
  modules: Module[]
  topics: Topic[]
  cards: Card[]
  states: StateRow[]
  game: GameItem[]
  /** Höchstes gesehenes `synced_at` je Tabelle; fehlt, wenn die Tabelle keine Zeilen lieferte. */
  cursors: Partial<Cursors>
  /** Spieldaten ließen sich nicht lesen (z. B. Tabelle fehlt, Schema nicht ausgeführt); der Rest gilt trotzdem. */
  gameError?: string
}

export interface Remote {
  /** Zeilen mit `synced_at >= since[tabelle]` (der Aufrufer zieht das Überlappungsfenster ab). */
  pullSince(since: Cursors): Promise<Pulled>
  /** Bedingter Upsert auf `card_id`: der Server ignoriert ältere `updated_at`. */
  pushStates(s: StateRow[]): Promise<void>
  /** Upsert auf `id` (append-only, idempotent). */
  pushLogs(l: LogEntry[]): Promise<void>
  /** Bedingter Upsert auf (user_id, id). */
  pushGame(g: GameItem[]): Promise<void>
}

type GameRow = { id: string; data: Record<string, unknown>; updated_at: string }
const gameToRow = (g: GameItem): GameRow => ({ id: g.id, data: g.data, updated_at: g.updatedAt })
const rowToGame = (r: GameRow): GameItem => ({ id: r.id, data: r.data, updatedAt: isoUtc(r.updated_at) })

/** Fehler des Servers; `permanent` = zeilenbezogener Datenfehler (400/409/422, Postgres 23xxx): Wiederholen hilft nicht. */
export class RemoteError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message)
  }
}

export const isPermanentError = (e: unknown): boolean => e instanceof RemoteError && e.permanent

/**
 * Nur zeilenbezogene Datenfehler sind dauerhaft. Alles andere (401/403 abgelaufenes JWT/RLS, 404
 * fehlende Tabelle, 408/429, 5xx, Status 0/Netz) ist vorübergehend: die Outbox bleibt erhalten.
 */
function toError(error: { message: string; code?: string }, status: number): RemoteError {
  const dataError = status === 400 || status === 409 || status === 422 || /^23/.test(error.code ?? '')
  const authError = status === 401 || status === 403
  return new RemoteError(error.message, dataError && !authError)
}

const PAGE = 1000
const maxIso = (a: string | undefined, b: string): string => (a === undefined || Date.parse(b) > Date.parse(a) ? b : a)

export function createSupabaseRemote(client: SupabaseClient): Remote {
  /**
   * Keyset-Paginierung über (synced_at, key). Stoppt erst bei einer leeren Seite: der Server darf
   * weniger Zeilen liefern als angefragt (max_rows). Der Roh-Zeitstempel (Mikrosekunden) bleibt
   * für den Keyset erhalten, der gespeicherte Cursor wird auf Millisekunden normalisiert.
   */
  async function fetchAll<R extends { synced_at: string }>(
    table: string,
    key: string,
    since: string,
  ): Promise<{ rows: R[]; cursor?: string }> {
    const rows: R[] = []
    let cursor: string | undefined
    let last: { synced_at: string; key: string } | undefined
    for (;;) {
      let q = client.from(table).select('*')
      // Zeitstempel in Anführungszeichen: `+` und `:` sind in PostgREST-Filtern reservierte Zeichen.
      q = last
        ? q.or(`synced_at.gt."${last.synced_at}",and(synced_at.eq."${last.synced_at}",${key}.gt.${last.key})`)
        : q.gte('synced_at', since)
      const { data, error, status } = await q
        .order('synced_at', { ascending: true })
        .order(key, { ascending: true })
        .limit(PAGE)
      if (error) throw toError(error, status)
      const page = (data ?? []) as unknown as R[]
      if (page.length === 0) return { rows, cursor }
      rows.push(...page)
      const tail = page[page.length - 1] as R & Record<string, string>
      last = { synced_at: tail.synced_at, key: tail[key] as string }
      for (const r of page) cursor = maxIso(cursor, isoUtc(r.synced_at))
    }
  }

  async function upsert(table: string, rows: object[], onConflict: string): Promise<void> {
    if (rows.length === 0) return
    const { error, status } = await client.from(table).upsert(rows, { onConflict })
    if (error) throw toError(error, status)
  }

  type Synced<T> = T & { synced_at: string }
  return {
    async pullSince(since) {
      const [modules, topics, cards, states, game] = await Promise.all([
        fetchAll<Synced<ModuleRow>>('modules', 'id', since.modules),
        fetchAll<Synced<TopicRow>>('topics', 'id', since.topics),
        fetchAll<Synced<CardRow>>('cards', 'id', since.cards),
        fetchAll<Synced<StateDbRow<SrsState>>>('card_states', 'card_id', since.states),
        // Spieldaten sind Nebensache: ein Fehler dort darf Karten und Lernstände nicht aufhalten.
        fetchAll<Synced<GameRow>>('game_items', 'id', since.game).catch((e: unknown) => ({
          rows: [] as Synced<GameRow>[],
          cursor: undefined,
          error: e instanceof Error ? e.message : String(e),
        })),
      ])
      const cursors: Partial<Cursors> = {}
      if (modules.cursor) cursors.modules = modules.cursor
      if (topics.cursor) cursors.topics = topics.cursor
      if (cards.cursor) cursors.cards = cards.cursor
      if (states.cursor) cursors.states = states.cursor
      if (game.cursor) cursors.game = game.cursor
      return {
        modules: modules.rows.map(rowToModule),
        topics: topics.rows.map(rowToTopic),
        cards: cards.rows.map(rowToCard),
        states: states.rows.map(rowToState),
        game: game.rows.map(rowToGame),
        cursors,
        ...('error' in game ? { gameError: game.error } : {}),
      }
    },
    pushStates: (s) => upsert('card_states', s.map(stateToRow), 'card_id'),
    pushLogs: (l) => upsert('review_logs', l.map(logToRow), 'id'),
    pushGame: (g) => upsert('game_items', g.map(gameToRow), 'user_id,id'),
  }
}
