import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import multer from 'multer'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CardDraftSchema, TypedSchema, normalize, type Card, type CardDraft, type Topic } from '@lernapp/shared'
import { markExamRelevant } from './examRelevance'
import { parseGeneration } from './parse'
import { askPrompt, examPrompt, scriptPrompt, typedPrompt } from './prompts'
import { SCANNED_NOTICE, type PdfChunk } from './pdf'
import type { runClaude as RunClaude } from './claude'
import type { Gateway } from './supabase'

export const DEFAULT_APP_ORIGIN = 'https://placeholder.github.io'
const BATCH = 200
const TYPED_BATCH = 25
const MAX_UPLOAD = 100 * 1024 * 1024
const SESSION_COOKIE = 'werkstatt_sitzung'

const HERE = dirname(fileURLToPath(import.meta.url))

export interface ServerDeps {
  /** null = Supabase nicht konfiguriert (UI zeigt Einrichtungshinweis). */
  gateway: Gateway | null
  runClaude: typeof RunClaude
  splitPdf: (path: string) => Promise<PdfChunk[]>
  /** false = gescannt (keine Textebene); wird dann trotzdem verarbeitet, Claude liest die Seiten als Bild. */
  hasText: (path: string) => Promise<boolean>
  appOrigin?: string
  port?: number
  uploadDir?: string
  publicDir?: string
  /** Löscht Dateien (Tests können das beobachten). */
  removeFile?: (path: string) => Promise<void>
  /** Leeres Arbeitsverzeichnis für /api/ask (Standard: <uploadDir>/ask-empty). */
  askDir?: string
}

export interface RejectedCard {
  pages: string
  index: number
  reason: string
}

interface Job {
  status: 'running' | 'done' | 'error'
  progress: { done: number; total: number }
  cards?: CardDraft[]
  rejected?: RejectedCard[]
  styleProfile?: string
  examTopics?: string[]
  error?: string
  /** Hinweis ohne Fehler, z. B. bei gescannten PDFs. */
  notice?: string
  /** Kernantworten-Lauf: Anzahl geschriebener Karten. */
  updated?: number
  /** Abbrechen angefordert: Lauf stoppt vor dem nächsten Stapel. */
  cancelled?: boolean
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

function batches<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export function createServer(deps: ServerDeps) {
  const port = deps.port ?? 5174
  const appOrigin = deps.appOrigin ?? DEFAULT_APP_ORIGIN
  const allowed = new Set([appOrigin, 'http://localhost:5173', `http://127.0.0.1:${port}`, `http://localhost:${port}`])
  const uploadDir = deps.uploadDir ?? join(HERE, '..', 'tmp')
  const publicDir = deps.publicDir ?? join(HERE, '..', 'public')
  const removeFile = deps.removeFile ?? ((p: string) => rm(p, { force: true }))
  const askDir = deps.askDir ?? join(uploadDir, 'ask-empty')
  mkdirSync(uploadDir, { recursive: true })
  mkdirSync(askDir, { recursive: true })

  const jobs = new Map<string, Job>()
  const app = express()
  app.disable('x-powered-by')

  // DNS-Rebinding-Schutz: nur Aufrufe mit lokalem Host; Cross-Site nur von erlaubter Origin.
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
  app.use((req, res, next) => {
    if (!hosts.has(String(req.headers.host ?? '').toLowerCase())) return void res.status(403).json({ error: 'Host nicht erlaubt.' })
    const origin = req.headers.origin
    if (req.headers['sec-fetch-site'] === 'cross-site' && !(origin !== undefined && allowed.has(origin))) {
      return void res.status(403).json({ error: 'Cross-Site-Anfrage nicht erlaubt.' })
    }
    next()
  })

  // CORS: nur die konfigurierte App-Origin, die lokale Entwicklungs-Origin und die Werkstatt selbst.
  // Fremde Origins werden abgewiesen (schützt auch vor Fremdseiten, die die lokale Werkstatt ansprechen).
  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin === undefined) return next()
    if (!allowed.has(origin)) return void res.status(403).json({ error: 'Origin nicht erlaubt.' })
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? 'Content-Type')
      res.setHeader('Access-Control-Allow-Private-Network', 'true')
      res.setHeader('Access-Control-Max-Age', '600')
      return void res.status(204).end()
    }
    next()
  })

  app.use('/api/ask', express.json({ limit: '200kb' }))
  app.use(express.json({ limit: '20mb' }))

  const upload = multer({
    dest: uploadDir,
    limits: { fileSize: MAX_UPLOAD, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ok = extname(file.originalname).toLowerCase() === '.pdf'
      if (ok) cb(null, true)
      else cb(new Error('Nur PDF-Dateien sind erlaubt.'))
    },
  })

  // Sitzungen: Jeder erfolgreiche Login bekommt ein zufälliges Geheimnis als HttpOnly-Cookie.
  // Nur wer es mitschickt, gilt als angemeldet – sonst könnte jedes andere Programm bzw.
  // Benutzerkonto auf dem PC die angemeldete Werkstatt mitbenutzen. Alle Geheimnisse bleiben
  // gültig, solange die Werkstatt läuft (zweiter Browser, localhost vs. 127.0.0.1); nur im Speicher.
  const sessions: Buffer[] = []
  const MAX_SESSIONS = 50
  const sessionFrom = (req: Request): Buffer | null => {
    for (const part of (req.headers.cookie ?? '').split(';')) {
      const [k, ...v] = part.trim().split('=')
      if (k === SESSION_COOKIE) {
        const val = v.join('=')
        return /^[A-Za-z0-9_-]{43}$/.test(val) ? Buffer.from(val) : null
      }
    }
    return null
  }
  const hasSession = (req: Request): boolean => {
    if (!deps.gateway?.isLoggedIn()) return false
    const got = sessionFrom(req)
    if (!got) return false
    let ok = false
    for (const s of sessions) if (timingSafeEqual(s, got)) ok = true
    return ok
  }

  app.get('/api/health', (_req, res) => void res.json({ ok: true }))
  app.get('/api/config', (req, res) => void res.json({ configured: deps.gateway !== null, loggedIn: hasSession(req) }))

  const needGateway = (_req: Request, res: Response, next: NextFunction) => {
    if (!deps.gateway) return void res.status(503).json({ error: 'Supabase ist nicht eingerichtet (werkstatt/.env fehlt).' })
    next()
  }
  const needLogin = (req: Request, res: Response, next: NextFunction) => {
    if (!hasSession(req)) return void res.status(401).json({ error: 'Nicht angemeldet.' })
    next()
  }
  const guard: RequestHandler[] = [needGateway, needLogin]
  const gw = () => deps.gateway!

  const wrap =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response) =>
      void fn(req, res).catch((e) => res.status(500).json({ error: errMsg(e) }))

  app.post(
    '/api/login',
    needGateway,
    wrap(async (req, res) => {
      const { email, password } = req.body ?? {}
      if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
        res.status(400).json({ error: 'E-Mail und Passwort angeben.' })
        return
      }
      try {
        await gw().login(email, password)
      } catch (e) {
        res.status(401).json({ error: errMsg(e) })
        return
      }
      const secret = randomBytes(32).toString('base64url')
      sessions.push(Buffer.from(secret))
      if (sessions.length > MAX_SESSIONS) sessions.shift()
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${secret}; HttpOnly; SameSite=Strict; Path=/`)
      res.json({ ok: true })
    }),
  )

  app.get(
    '/api/modules',
    guard,
    wrap(async (_req, res) => {
      const modules = await gw().listModules()
      const withTopics = await Promise.all(modules.map(async (m) => ({ ...m, topics: await gw().listTopics(m.id) })))
      res.json({ modules: withTopics })
    }),
  )

  app.post(
    '/api/modules',
    guard,
    wrap(async (req, res) => {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
      if (!name) {
        res.status(400).json({ error: 'Modulname fehlt.' })
        return
      }
      const module = { id: randomUUID(), name, examDate: null, styleProfile: null, updatedAt: new Date().toISOString() }
      await gw().upsertModule(module)
      res.json({ module })
    }),
  )

  // --- Generierung -------------------------------------------------------------------------------

  async function runJob(
    job: Job,
    opts: { chunks: PdfChunk[]; kind: 'script' | 'exam'; moduleName: string; styleProfile: string | null; topics: string[]; fileName: string },
  ) {
    const cards: CardDraft[] = []
    const rejected: RejectedCard[] = []
    const failures: string[] = []
    const examTopics = new Set<string>()
    let styleProfile: string | undefined
    for (const chunk of opts.chunks) {
      const pages = `S. ${chunk.firstPage}–${chunk.lastPage}`
      try {
        const ctx = { moduleName: opts.moduleName, existingTopics: opts.topics, fileName: opts.fileName }
        const prompt =
          opts.kind === 'exam' ? examPrompt(chunk, ctx) : scriptPrompt(chunk, { ...ctx, styleProfile: opts.styleProfile })
        const raw = await deps.runClaude(prompt, { addDir: dirname(chunk.path) })
        const { result, rejected: rej } = parseGeneration(raw)
        cards.push(...result.cards)
        rej.forEach((r) => rejected.push({ pages, ...r }))
        if (result.styleProfile) styleProfile = result.styleProfile
        result.examTopics?.forEach((t) => examTopics.add(t))
        // neue Themen den folgenden Abschnitten bekannt machen
        for (const c of result.cards) if (!opts.topics.some((t) => normalize(t) === normalize(c.topic))) opts.topics.push(c.topic)
      } catch (e) {
        failures.push(`${pages}: ${errMsg(e)}`)
      }
      job.progress.done++
    }
    if (failures.length === opts.chunks.length) {
      job.status = 'error'
      job.error = `Alle Abschnitte sind fehlgeschlagen.\n${failures.join('\n')}`
      return
    }
    job.cards = cards
    job.rejected = rejected
    if (styleProfile) job.styleProfile = styleProfile
    if (examTopics.size) job.examTopics = [...examTopics]
    if (failures.length) job.error = `Einige Abschnitte sind fehlgeschlagen (Seiten fehlen in der Vorschau):\n${failures.join('\n')}`
    job.status = 'done'
  }

  app.post(
    '/api/generate',
    guard,
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('file')(req, res, (err) => {
        if (err) {
          const tooBig = (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
          return void res.status(400).json({ error: tooBig ? 'Die Datei ist größer als 100 MB.' : errMsg(err) })
        }
        next()
      })
    },
    wrap(async (req, res) => {
      const file = req.file
      const cleanup = async (paths: string[]) => {
        await Promise.all(paths.map((p) => removeFile(p).catch(() => {})))
      }
      if (!file) {
        res.status(400).json({ error: 'Keine PDF-Datei übergeben.' })
        return
      }
      const { moduleId, kind } = req.body ?? {}
      if (typeof moduleId !== 'string' || (kind !== 'script' && kind !== 'exam')) {
        await cleanup([file.path])
        res.status(400).json({ error: 'moduleId und kind ("script" oder "exam") angeben.' })
        return
      }
      let pdfChunks: PdfChunk[] = []
      try {
        const module = (await gw().listModules()).find((m) => m.id === moduleId)
        if (!module) throw new HttpError(404, 'Modul nicht gefunden.')
        let scanned: boolean
        try {
          scanned = !(await deps.hasText(file.path))
        } catch (e) {
          throw new HttpError(422, `PDF konnte nicht gelesen werden: ${errMsg(e)}`)
        }
        const topics = (await gw().listTopics(moduleId)).map((t) => t.name)
        try {
          pdfChunks = await deps.splitPdf(file.path)
        } catch (e) {
          throw new HttpError(422, `PDF konnte nicht gelesen werden: ${errMsg(e)}`)
        }
        const fileName = (file.originalname.replace(/[^\w.\- äöüÄÖÜß]+/g, '_') || 'datei.pdf').slice(0, 120)
        const jobId = randomUUID()
        const job: Job = { status: 'running', progress: { done: 0, total: pdfChunks.length } }
        if (scanned) job.notice = SCANNED_NOTICE
        jobs.set(jobId, job)
        const toDelete = [file.path, ...pdfChunks.map((c) => c.path)]
        void runJob(job, { chunks: pdfChunks, kind, moduleName: module.name, styleProfile: module.styleProfile, topics, fileName })
          .catch((e) => {
            job.status = 'error'
            job.error = errMsg(e)
          })
          .finally(() => cleanup(toDelete))
        res.json({ jobId })
      } catch (e) {
        await cleanup([file.path, ...pdfChunks.map((c) => c.path)])
        if (e instanceof HttpError) res.status(e.status).json({ error: e.message })
        else throw e
      }
    }),
  )

  app.get('/api/jobs/:id', guard, (req: Request, res: Response) => {
    const job = jobs.get(String(req.params.id))
    if (!job) return void res.status(404).json({ error: 'Auftrag nicht gefunden.' })
    res.json(job)
  })

  app.post('/api/jobs/:id/cancel', guard, (req: Request, res: Response) => {
    const job = jobs.get(String(req.params.id))
    if (!job) return void res.status(404).json({ error: 'Auftrag nicht gefunden.' })
    job.cancelled = true
    res.json({ ok: true })
  })

  // --- Kernantworten ergänzen --------------------------------------------------------------------

  type ChoiceCard = Extract<Card, { type: 'choice' }>

  /** Ein Stapel: Claude fragen, Antwort prüfen, nur „typed“ (+ updatedAt) zurückschreiben. Gibt die Zahl geschriebener Karten zurück. */
  async function typedBatch(batch: ChoiceCard[]): Promise<number> {
    const input = batch.map((c) => {
      const right = c.payload.options.find((o) => o.correct)
      return { id: c.id, question: c.payload.question, answer: right?.text ?? '', why: right?.why ?? '' }
    })
    const raw = await deps.runClaude(typedPrompt(input), { addDir: askDir })
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end < start) throw new Error('Antwort enthielt kein JSON.')
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { items?: unknown }
    if (!Array.isArray(parsed.items)) throw new Error('Antwort ohne "items".')
    const inBatch = new Set(batch.map((c) => c.id))
    // Frisch lesen: Während Claude arbeitet, kann „Übernehmen“ oder ein Import die Karte geändert haben.
    // Geschrieben wird auf die aktuelle Fassung, nur wenn sie noch eine Auswahlkarte ohne Kernantwort ist.
    const byId = new Map<string, ChoiceCard>()
    for (const moduleId of new Set(batch.map((c) => c.moduleId))) {
      for (const c of await gw().listCards(moduleId)) {
        if (inBatch.has(c.id) && !c.deleted && c.type === 'choice' && c.payload.typed === undefined) byId.set(c.id, c)
      }
    }
    const now = new Date().toISOString()
    const out = new Map<string, Card>()
    for (const item of parsed.items as { id?: unknown; typed?: unknown }[]) {
      const card = typeof item?.id === 'string' ? byId.get(item.id) : undefined
      if (!card || !('typed' in item)) continue
      const typed = item.typed === null ? null : TypedSchema.safeParse(item.typed)
      if (typed !== null && !typed.success) continue
      out.set(card.id, { ...card, payload: { ...card.payload, typed: typed === null ? null : typed.data }, updatedAt: now })
    }
    if (out.size) await gw().upsertCards([...out.values()])
    return out.size
  }

  async function runTyped(job: Job) {
    const modules = await gw().listModules()
    const todo: ChoiceCard[] = []
    for (const m of modules) {
      for (const c of await gw().listCards(m.id)) {
        if (!c.deleted && c.type === 'choice' && c.payload.typed === undefined) todo.push(c)
      }
    }
    job.progress = { done: 0, total: todo.length }
    const errors: string[] = []
    for (const batch of batches(todo, TYPED_BATCH)) {
      if (job.cancelled) break
      try {
        job.updated = (job.updated ?? 0) + (await typedBatch(batch))
      } catch (e) {
        errors.push(errMsg(e))
        job.error = `${errors.length} Stapel übersprungen: ${errors.join('; ')}`
      }
      job.progress.done += batch.length
    }
    job.status = 'done'
  }

  app.post('/api/typed', guard, (_req: Request, res: Response) => {
    const jobId = randomUUID()
    const job: Job = { status: 'running', progress: { done: 0, total: 0 }, updated: 0 }
    jobs.set(jobId, job)
    void runTyped(job).catch((e) => {
      job.status = 'error'
      job.error = errMsg(e)
    })
    res.json({ jobId })
  })

  // --- Übernehmen --------------------------------------------------------------------------------

  app.post(
    '/api/commit',
    guard,
    wrap(async (req, res) => {
      const { moduleId, cards: rawCards, styleProfile, examTopics } = req.body ?? {}
      if (typeof moduleId !== 'string' || !Array.isArray(rawCards)) {
        res.status(400).json({ error: 'moduleId und cards angeben.' })
        return
      }
      const drafts: CardDraft[] = []
      const invalid: { index: number; reason: string }[] = []
      rawCards.forEach((c, index) => {
        const r = CardDraftSchema.safeParse(c)
        if (r.success) drafts.push(r.data)
        else
          invalid.push({
            index,
            reason: r.error.issues
              .slice(0, 3)
              .map((i) => `${i.path.join('.') || '(Karte)'}: ${i.message}`)
              .join('; '),
          })
      })
      if (invalid.length) {
        res.status(400).json({ error: 'Einige Karten sind ungültig.', invalid })
        return
      }
      const module = (await gw().listModules()).find((m) => m.id === moduleId)
      if (!module) {
        res.status(404).json({ error: 'Modul nicht gefunden.' })
        return
      }
      const now = new Date().toISOString()

      // Themen: fehlende anlegen (Namensvergleich ohne Groß-/Kleinschreibung und Leerraum)
      const topics: Topic[] = await gw().listTopics(moduleId)
      const byName = new Map(topics.map((t) => [normalize(t.name), t]))
      const newTopics: Topic[] = []
      for (const d of drafts) {
        const key = normalize(d.topic)
        if (!byName.has(key)) {
          const t: Topic = { id: randomUUID(), moduleId, name: d.topic.trim(), updatedAt: now }
          byName.set(key, t)
          newTopics.push(t)
        }
      }
      const examList: string[] = Array.isArray(examTopics) ? examTopics.filter((t: unknown): t is string => typeof t === 'string') : []
      // Bestehende Karten vor dem Einfügen lesen (nur für die Klausurrelevanz-Markierung)
      const existing = examList.length ? await gw().listCards(moduleId) : []
      await gw().upsertTopics(newTopics)

      const newCards: Card[] = drafts.map((d) => {
        const { topic, ...rest } = d
        return { ...rest, id: randomUUID(), moduleId, topicId: byName.get(normalize(topic))!.id, createdAt: now, updatedAt: now, deleted: false } as Card
      })
      for (const part of batches(newCards, BATCH)) await gw().upsertCards(part)

      let marked = 0
      if (existing.length) {
        const updated = markExamRelevant(existing, [...topics, ...newTopics], examList)
        const changed = updated.filter((c, i) => c !== existing[i])
        for (const part of batches(changed, BATCH)) await gw().upsertCards(part)
        marked = changed.length
      }
      if (typeof styleProfile === 'string' && styleProfile.trim()) {
        await gw().upsertModule({ ...module, styleProfile, updatedAt: new Date().toISOString() })
      }
      res.json({ added: newCards.length, topicsCreated: newTopics.length, markedExamRelevant: marked })
    }),
  )

  // --- Nachfragen am PC --------------------------------------------------------------------------

  // Die App schickt kein Zugriffstoken mehr, sondern ein Einmal-Ticket (siehe ask_tickets in schema.sql):
  // Wer sich als Werkstatt ausgibt, erhält so nichts, womit er auf Daten zugreifen könnte.
  const askAuth = (req: Request, res: Response, next: NextFunction) => {
    const g = deps.gateway
    if (hasSession(req)) return next()
    const nonce = req.headers['x-ask-ticket']
    if (!g || typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) {
      return void res.status(401).json({ error: 'Nicht angemeldet (Werkstatt-Login oder Ticket der App nötig).' })
    }
    g.redeemTicket(nonce).then(
      (ok) => (ok ? next() : void res.status(401).json({ error: 'Ungültiges oder abgelaufenes Ticket.' })),
      () => void res.status(401).json({ error: 'Ticket konnte nicht geprüft werden.' }),
    )
  }

  app.post(
    '/api/ask',
    askAuth,
    wrap(async (req, res) => {
      const { card, userAnswer, history } = req.body ?? {}
      if (!card || typeof card !== 'object' || typeof userAnswer !== 'string') {
        res.status(400).json({ error: 'card und userAnswer angeben.' })
        return
      }
      if (userAnswer.length > 2000) return void res.status(413).json({ error: 'Die Antwort ist zu lang (max. 2000 Zeichen).' })
      if (JSON.stringify(card).length > 20000) return void res.status(413).json({ error: 'Die Karte ist zu groß.' })
      if (history !== undefined && !Array.isArray(history)) return void res.status(400).json({ error: 'history muss eine Liste sein.' })
      const entries: unknown[] = history ?? []
      if (entries.length > 20) return void res.status(413).json({ error: 'Der Verlauf ist zu lang (max. 20 Einträge).' })
      const hist: { role: string; text: string }[] = []
      for (const h of entries as { role?: unknown; text?: unknown }[]) {
        if (!h || typeof h.role !== 'string' || typeof h.text !== 'string') continue
        if (h.text.length > 4000) return void res.status(413).json({ error: 'Ein Verlaufseintrag ist zu lang (max. 4000 Zeichen).' })
        hist.push({ role: h.role, text: h.text })
      }
      const answer = await deps.runClaude(askPrompt(card as Card, userAnswer, hist), { addDir: askDir })
      res.json({ answer })
    }),
  )

  app.use(express.static(publicDir))
  app.use((err: { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.too.large') return void res.status(413).json({ error: 'Anfrage ist zu groß.' })
    res.status(err.status && err.status < 500 ? err.status : 500).json({ error: 'Ungültige Anfrage.' })
  })
  return app
}
