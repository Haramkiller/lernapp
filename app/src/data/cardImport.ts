import type { SupabaseClient } from '@supabase/supabase-js'
import { cardToRow, moduleToRow, topicToRow, type Module } from '@lernapp/shared'
import type { ModuleContent, Prepared } from '../cards/prepare'
import { db } from './db'

const BATCH = 200

/** Lokale Module, nach Name sortiert. */
export async function loadModules(): Promise<Module[]> {
  const all = await db.modules.toArray()
  return all.sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

/** Lokale Themen und nicht gelöschte Karten eines Moduls (Grundlage der Doppel-Prüfung). */
export async function loadModuleContent(moduleId: string): Promise<ModuleContent> {
  const [topics, cards] = await Promise.all([
    db.topics.where('moduleId').equals(moduleId).toArray(),
    db.cards.where('moduleId').equals(moduleId).toArray(),
  ])
  return { topics, cards: cards.filter((c) => !c.deleted) }
}

async function upsert(client: SupabaseClient, table: string, rows: unknown[]): Promise<void> {
  const { error } = await client.from(table).upsert(rows)
  if (error) throw new Error(error.message)
}

/**
 * Schreibt Modul (nur wenn neu) → Themen → Karten per Upsert. Die IDs stehen schon im Prepared fest,
 * daher erzeugt ein zweiter Versuch nach einem Fehler keine Doppel.
 */
export async function saveImport(client: SupabaseClient, p: Prepared): Promise<void> {
  if (p.isNewModule) await upsert(client, 'modules', [moduleToRow(p.module)])
  if (p.topics.length) await upsert(client, 'topics', p.topics.map(topicToRow))
  for (let i = 0; i < p.cards.length; i += BATCH) await upsert(client, 'cards', p.cards.slice(i, i + BATCH).map(cardToRow))
}
