import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  cardToRow,
  moduleToRow,
  rowToCard,
  rowToModule,
  rowToTopic,
  topicToRow,
  type Card,
  type CardRow,
  type Module,
  type ModuleRow,
  type Topic,
  type TopicRow,
} from '@lernapp/shared'

/** Schmale Schnittstelle zu Supabase; in Tests durch eine Fälschung ersetzbar. */
export interface Gateway {
  isLoggedIn(): boolean
  login(email: string, password: string): Promise<void>
  /** Löst ein Einmal-Ticket der App ein (redeem_ask_ticket): true nur beim ersten Mal und innerhalb von 60 s. */
  redeemTicket(nonce: string): Promise<boolean>
  listModules(): Promise<Module[]>
  listTopics(moduleId: string): Promise<Topic[]>
  listCards(moduleId: string): Promise<Card[]>
  /** Legt ein Modul an bzw. aktualisiert es (Upsert). */
  upsertModule(m: Module): Promise<void>
  upsertTopics(topics: Topic[]): Promise<void>
  upsertCards(cards: Card[]): Promise<void>
}

export interface SupabaseConfig {
  url: string
  anonKey: string
}

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`Supabase: ${what} fehlgeschlagen (${error.message}).`)
}

/** Echte Anbindung. Die Sitzung liegt nur im Arbeitsspeicher (persistSession: false), user_id setzt die DB per Default. */
export function createSupabaseGateway(cfg: SupabaseConfig): Gateway {
  const client: SupabaseClient = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  })
  let loggedIn = false
  const authed = () => {
    if (!loggedIn) throw new Error('Nicht angemeldet.')
    return client
  }
  return {
    isLoggedIn: () => loggedIn,
    async login(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (error) throw new Error('Anmeldung fehlgeschlagen: E-Mail oder Passwort stimmen nicht (oder keine Verbindung).')
      loggedIn = true
    },
    async redeemTicket(nonce) {
      const { data, error } = await client.rpc('redeem_ask_ticket', { p_nonce: nonce })
      if (error) throw new Error(`Supabase: Ticket prüfen fehlgeschlagen (${error.message}).`)
      return data === true
    },
    async listModules() {
      const { data, error } = await authed().from('modules').select('*').order('name')
      fail('Module laden', error)
      return (data as ModuleRow[]).map(rowToModule)
    },
    async listTopics(moduleId) {
      const { data, error } = await authed().from('topics').select('*').eq('module_id', moduleId).order('name')
      fail('Themen laden', error)
      return (data as TopicRow[]).map(rowToTopic)
    },
    async listCards(moduleId) {
      const out: Card[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await authed()
          .from('cards')
          .select('*')
          .eq('module_id', moduleId)
          .eq('deleted', false)
          .order('id')
          .range(from, from + 999)
        fail('Karten laden', error)
        const rows = data as CardRow[]
        out.push(...rows.map(rowToCard))
        if (rows.length < 1000) break
      }
      return out
    },
    async upsertModule(m) {
      const { error } = await authed().from('modules').upsert(moduleToRow(m))
      fail('Modul speichern', error)
    },
    async upsertTopics(topics) {
      if (!topics.length) return
      const { error } = await authed().from('topics').upsert(topics.map(topicToRow))
      fail('Themen speichern', error)
    },
    async upsertCards(cards) {
      if (!cards.length) return
      const { error } = await authed().from('cards').upsert(cards.map(cardToRow))
      fail('Karten speichern', error)
    },
  }
}
