export type SupabaseConfig = { url: string; key: string }

/** Override (Einrichtungsbildschirm) gewinnt, wenn beide Felder gesetzt sind; sonst Env; sonst null. */
export function resolveSupabaseConfig(
  env: { url?: string; key?: string },
  override: SupabaseConfig | null,
): SupabaseConfig | null {
  if (override?.url && override.key) return { url: override.url, key: override.key }
  if (env.url && env.key) return { url: env.url, key: env.key }
  return null
}
