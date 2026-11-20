import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runClaude } from './claude'
import { hasText, splitPdf } from './pdf'
import { createServer, DEFAULT_APP_ORIGIN } from './server'
import { createSupabaseGateway } from './supabase'

const envFile = join(dirname(fileURLToPath(import.meta.url)), '..', '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY
const port = Number(process.env.PORT) || 5174
const gateway = url && key ? createSupabaseGateway({ url, anonKey: key }) : null
if (!gateway) console.warn('Hinweis: werkstatt/.env fehlt oder ist unvollständig (SUPABASE_URL, SUPABASE_ANON_KEY).')

const app = createServer({
  gateway,
  runClaude,
  splitPdf,
  hasText,
  appOrigin: process.env.APP_ORIGIN || DEFAULT_APP_ORIGIN,
  port,
})
app.listen(port, '127.0.0.1', () => {
  console.log(`Werkstatt läuft: http://127.0.0.1:${port}`)
  if (url && key) void checkSupabase(url, key)
})

/** Verbindungstest beim Start: zeigt im Fenster die genaue Ursache, falls Supabase nicht erreichbar ist. */
async function checkSupabase(base: string, apikey: string): Promise<void> {
  try {
    const r = await fetch(`${base.replace(/\/+$/, '')}/auth/v1/health`, { headers: { apikey } })
    console.log(r.ok ? 'Supabase erreichbar.' : `Supabase antwortet mit Status ${r.status}.`)
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause
    console.warn(`Supabase NICHT erreichbar: ${(e as Error).message}${cause ? ` – ${cause.code ?? ''} ${cause.message ?? ''}` : ''}`)
  }
}
