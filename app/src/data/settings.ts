import { db } from './db'
import { DEFAULT_RETENTION } from '../srs/scheduler'
import type { Settings } from '../session/queue'
import type { SupabaseConfig } from './config'

export const DEFAULT_SETTINGS: Settings = { retention: DEFAULT_RETENTION, newPerDay: 20 }

export async function loadSettings(): Promise<Settings> {
  const stored = (await db.meta.get('settings'))?.value as Partial<Settings> | undefined
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function saveSettings(s: Settings): Promise<void> {
  await db.meta.put({ key: 'settings', value: s })
}

export async function loadOverride(): Promise<SupabaseConfig | null> {
  return ((await db.meta.get('supabaseOverride'))?.value as SupabaseConfig | null | undefined) ?? null
}

export async function saveOverride(o: SupabaseConfig | null): Promise<void> {
  if (o) await db.meta.put({ key: 'supabaseOverride', value: o })
  else await db.meta.delete('supabaseOverride')
}
