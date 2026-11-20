import { describe, expect, it, vi } from 'vitest'
import st from 'supertest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Card, Module, Topic } from '@lernapp/shared'
import { createServer, type ServerDeps } from '../src/server'
import type { Gateway } from '../src/supabase'

// Wie ein Browser: das Sitzungscookie aus dem letzten Login je Server wird mitgeschickt.
const jar = new WeakMap<object, string>()

// Supertest nutzt einen zufälligen Port; die Werkstatt erwartet Host 127.0.0.1:<port> (Standard 5174).
// cookie: undefined = Cookie aus dem Login dieses Servers, null = gar keins (fremder Aufrufer).
const request = (app: Parameters<typeof st>[0], cookie?: string | null) => {
  const t = st(app)
  const c = cookie === undefined ? jar.get(app as object) : (cookie ?? undefined)
  const prep = <T extends { set: (k: string, v: string) => T }>(r: T): T => {
    r = r.set('Host', '127.0.0.1:5174')
    return c ? r.set('Cookie', c) : r
  }
  return {
    get: (u: string) => prep(t.get(u)),
    post: (u: string) => prep(t.post(u)),
    options: (u: string) => prep(t.options(u)),
  }
}

const sessionCookie = (r: { headers: Record<string, unknown> }): string | undefined => {
  const raw = r.headers['set-cookie'] as string[] | string | undefined
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  const hit = list.find((c) => c.startsWith('werkstatt_sitzung='))
  return hit?.split(';')[0]
}

const APP = 'https://me.github.io'

// Einmal-Tickets der App (43 Zeichen base64url); die Fälschung akzeptiert jedes „ok…“-Ticket genau einmal.
let ticketNo = 0
const ticket = (prefix = 'ok') => (prefix + String(++ticketNo)).padEnd(43, 'x')

const choiceDraft = (topic: string, extra: object = {}) => ({
  topic,
  type: 'free',
  payload: { question: 'Was ist X?', modelAnswer: 'Y', keyPoints: ['Y'] },
  explanation: 'Weil.',
  source: { file: 'a.pdf', page: 3, quote: 'q' },
  examRelevant: false,
  fromExam: false,
  difficulty: 2,
  ...extra,
})

function fakeGateway(init: { modules?: Module[]; topics?: Topic[]; cards?: Card[] } = {}) {
  let loggedIn = false
  const used = new Set<string>()
  const state = {
    modules: init.modules ?? [{ id: 'm1', name: 'Botanik', examDate: null, styleProfile: null, updatedAt: '2020-01-01T00:00:00.000Z' }],
    topics: init.topics ?? [],
    cards: init.cards ?? [],
  }
  const calls = { upsertCards: [] as Card[][], upsertTopics: [] as Topic[][], upsertModule: [] as Module[] }
  const gateway: Gateway = {
    isLoggedIn: () => loggedIn,
    redeemTicket: vi.fn(async (nonce: string) => {
      if (!nonce.startsWith('ok') || used.has(nonce)) return false
      used.add(nonce)
      return true
    }),
    login: vi.fn(async (_e: string, p: string) => {
      if (p !== 'richtig') throw new Error('Anmeldung fehlgeschlagen')
      loggedIn = true
    }),
    listModules: async () => state.modules,
    listTopics: async (id) => state.topics.filter((t) => t.moduleId === id),
    listCards: async (id) => state.cards.filter((c) => c.moduleId === id),
    upsertModule: async (m) => {
      calls.upsertModule.push(m)
      state.modules = [...state.modules.filter((x) => x.id !== m.id), m]
    },
    upsertTopics: async (t) => {
      calls.upsertTopics.push(t)
      state.topics.push(...t)
    },
    upsertCards: async (c) => {
      calls.upsertCards.push(c)
    },
  }
  return { gateway, calls, state }
}

function setup(over: Partial<ServerDeps> = {}, init?: Parameters<typeof fakeGateway>[0]) {
  const fg = fakeGateway(init)
  const removed: string[] = []
  const dir = mkdtempSync(join(tmpdir(), 'werkstatt-test-'))
  const runClaude = vi.fn(async () => JSON.stringify({ cards: [choiceDraft('Zellen')] }))
  const deps: ServerDeps = {
    gateway: fg.gateway,
    runClaude,
    splitPdf: vi.fn(async () => {
      const a = join(dir, 'c1.pdf')
      const b = join(dir, 'c2.pdf')
      writeFileSync(a, 'x')
      writeFileSync(b, 'x')
      return [
        { path: a, firstPage: 1, lastPage: 15 },
        { path: b, firstPage: 16, lastPage: 20 },
      ]
    }),
    hasText: vi.fn(async () => true),
    appOrigin: APP,
    uploadDir: dir,
    removeFile: async (p) => void removed.push(p),
    ...over,
  }
  const app = createServer(deps)
  return { app, ...fg, runClaude, deps, removed }
}

async function login(app: ReturnType<typeof createServer>): Promise<string> {
  const r = await request(app, null).post('/api/login').send({ email: 'a@b.de', password: 'richtig' }).expect(200)
  const c = sessionCookie(r)
  if (!c) throw new Error('kein Sitzungscookie')
  jar.set(app, c)
  return c
}

async function waitJob(app: ReturnType<typeof createServer>, id: string) {
  for (let i = 0; i < 100; i++) {
    const r = await request(app).get(`/api/jobs/${id}`)
    if (r.body.status !== 'running') return r.body
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('Job endet nicht')
}

const generate = (app: ReturnType<typeof createServer>, kind = 'script') =>
  request(app).post('/api/generate').field('moduleId', 'm1').field('kind', kind).attach('file', Buffer.from('%PDF-1.4'), 'skript.pdf')

describe('Werkstatt-Server', () => {
  it('health ist erreichbar und CORS-fähig', async () => {
    const { app } = setup()
    const r = await request(app).get('/api/health').set('Origin', APP)
    expect(r.body).toEqual({ ok: true })
    expect(r.headers['access-control-allow-origin']).toBe(APP)
  })

  it('verlangt Login', async () => {
    const { app } = setup()
    await request(app).get('/api/modules').expect(401)
    await request(app).post('/api/login').send({ email: 'a@b.de', password: 'falsch' }).expect(401)
  })

  it('zeigt Einrichtungshinweis ohne Supabase-Konfiguration', async () => {
    const { app } = setup({ gateway: null })
    expect((await request(app).get('/api/config')).body).toEqual({ configured: false, loggedIn: false })
    const r = await request(app).get('/api/modules').expect(503)
    expect(r.body.error).toContain('.env')
  })

  it('listet Module mit Themen und legt Module an', async () => {
    const { app, calls } = setup()
    await login(app)
    const r = await request(app).post('/api/modules').send({ name: ' Zoologie ' }).expect(200)
    expect(r.body.module.name).toBe('Zoologie')
    expect(calls.upsertModule).toHaveLength(1)
    const list = await request(app).get('/api/modules').expect(200)
    expect(list.body.modules.map((m: Module) => m.name).sort()).toEqual(['Botanik', 'Zoologie'])
  })

  it('generate → jobs liefert Karten aus gemocktem Claude und räumt auf', async () => {
    const { app, runClaude, removed } = setup()
    await login(app)
    const g = await generate(app).expect(200)
    const job = await waitJob(app, g.body.jobId)
    expect(job.status).toBe('done')
    expect(job.progress).toEqual({ done: 2, total: 2 })
    expect(job.cards).toHaveLength(2)
    expect(job.cards[0].topic).toBe('Zellen')
    expect(runClaude).toHaveBeenCalledTimes(2)
    // Upload + beide Abschnitte gelöscht
    await vi.waitFor(() => expect(removed).toHaveLength(3))
  })

  it('Abschnittsfehler werden vermerkt, Job läuft weiter; alle fehlgeschlagen → error', async () => {
    let n = 0
    const partial = setup({
      runClaude: vi.fn(async () => {
        if (n++ === 0) throw new Error('Zeitüberschreitung')
        return JSON.stringify({ cards: [choiceDraft('Zellen'), { type: 'kaputt' }] })
      }),
    })
    await login(partial.app)
    const job = await waitJob(partial.app, (await generate(partial.app)).body.jobId)
    expect(job.status).toBe('done')
    expect(job.cards).toHaveLength(1)
    expect(job.rejected).toHaveLength(1)
    expect(job.rejected[0].pages).toBe('S. 16–20')
    expect(job.error).toContain('S. 1–15')

    const allFail = setup({ runClaude: vi.fn(async () => { throw new Error('Limit') }) })
    await login(allFail.app)
    const j2 = await waitJob(allFail.app, (await generate(allFail.app)).body.jobId)
    expect(j2.status).toBe('error')
    expect(j2.error).toContain('Limit')
  })

  it('lehnt Nicht-PDF ab; unlesbare PDFs → 422 und Upload gelöscht', async () => {
    const { app } = setup()
    await login(app)
    await request(app).post('/api/generate').field('moduleId', 'm1').field('kind', 'script').attach('file', Buffer.from('x'), 'a.txt').expect(400)

    const broken = setup({ hasText: vi.fn(async () => { throw new Error('Invalid PDF structure') }) })
    await login(broken.app)
    const r = await generate(broken.app).expect(422)
    expect(r.body.error).toContain('PDF konnte nicht gelesen werden')
    expect(broken.removed).toHaveLength(1)
  })

  it('gescannte PDFs werden verarbeitet und bekommen einen Hinweis', async () => {
    const scanned = setup({ hasText: vi.fn(async () => false) })
    await login(scanned.app)
    const { body } = await generate(scanned.app).expect(200)
    const job = await waitJob(scanned.app, body.jobId)
    expect(job.status).toBe('done')
    expect(job.notice).toMatch(/gescannt/)
    expect(scanned.runClaude).toHaveBeenCalled()
  })

  it('commit schreibt user_id-lose Karten, legt Themen an und markiert Klausurrelevanz', async () => {
    const existingTopic: Topic = { id: 't1', moduleId: 'm1', name: 'Photosynthese', updatedAt: '2020-01-01T00:00:00.000Z' }
    const old: Card = {
      id: 'c-old', moduleId: 'm1', topicId: 't1', type: 'free',
      payload: { question: 'q', modelAnswer: 'a', keyPoints: ['a'] },
      explanation: '', source: null, examRelevant: false, fromExam: false, difficulty: 1,
      createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z', deleted: false,
    }
    const { app, calls } = setup({}, { topics: [existingTopic], cards: [old] })
    await login(app)
    const r = await request(app)
      .post('/api/commit')
      .send({
        moduleId: 'm1',
        cards: [choiceDraft('  photosynthese '), choiceDraft('Zellen', { fromExam: true, examRelevant: true })],
        styleProfile: 'Viele Freitextfragen.',
        examTopics: ['PHOTOSYNTHESE'],
      })
      .expect(200)
    expect(r.body).toEqual({ added: 2, topicsCreated: 1, markedExamRelevant: 1 })
    // Neues Thema nur für "Zellen"
    expect(calls.upsertTopics.flat().map((t) => t.name)).toEqual(['Zellen'])
    const written = calls.upsertCards[0]!
    expect(written).toHaveLength(2)
    expect(written[0]!.topicId).toBe('t1')
    expect(written[1]!.topicId).toBe(calls.upsertTopics[0]![0]!.id)
    for (const c of written) {
      expect(c).not.toHaveProperty('user_id')
      expect(c).not.toHaveProperty('topic')
      expect(c.deleted).toBe(false)
      expect(c.createdAt).toBe(c.updatedAt)
      expect(c.id).toMatch(/^[0-9a-f-]{36}$/)
    }
    // Bestehende Karte als prüfungsrelevant neu eingereicht (frischer updatedAt)
    const marked = calls.upsertCards[1]!
    expect(marked).toHaveLength(1)
    expect(marked[0]).toMatchObject({ id: 'c-old', examRelevant: true })
    expect(marked[0]!.updatedAt > old.updatedAt).toBe(true)
    // Stilprofil am Modul
    expect(calls.upsertModule[0]).toMatchObject({ id: 'm1', styleProfile: 'Viele Freitextfragen.' })
    expect(calls.upsertModule[0]!.updatedAt > '2020-01-01T00:00:00.000Z').toBe(true)
  })

  it('commit fügt in Paketen zu 200 ein und weist ungültige Karten ab', async () => {
    const { app, calls } = setup()
    await login(app)
    const cards = Array.from({ length: 450 }, () => choiceDraft('T'))
    await request(app).post('/api/commit').send({ moduleId: 'm1', cards }).expect(200)
    expect(calls.upsertCards.map((b) => b.length)).toEqual([200, 200, 50])

    const bad = await request(app).post('/api/commit').send({ moduleId: 'm1', cards: [{ type: 'free' }] }).expect(400)
    expect(bad.body.invalid).toHaveLength(1)
    expect(calls.upsertCards).toHaveLength(3)
  })

  const askBody = { card: { type: 'free', payload: { question: 'q', modelAnswer: 'a', keyPoints: ['a'] }, explanation: '', source: null }, userAnswer: 'b', history: [] }

  it('ask: 401 ohne Login und ohne gültiges Ticket, auch unkonfiguriert', async () => {
    const runClaude = vi.fn(async () => 'x')
    const { app } = setup({ runClaude })
    await request(app).post('/api/ask').send(askBody).expect(401)
    await request(app).post('/api/ask').set('X-Ask-Ticket', ticket('no')).send(askBody).expect(401)
    await request(app).post('/api/ask').set('X-Ask-Ticket', 'zu-kurz').send(askBody).expect(401)
    const none = setup({ gateway: null, runClaude })
    await request(none.app).post('/api/ask').set('X-Ask-Ticket', ticket()).send(askBody).expect(401)
    expect(runClaude).not.toHaveBeenCalled()
  })

  it('ask: Bearer-Token wird nicht mehr akzeptiert', async () => {
    const runClaude = vi.fn(async () => 'x')
    const { app } = setup({ runClaude })
    await request(app).post('/api/ask').set('Authorization', 'Bearer gueltig').send(askBody).expect(401)
    expect(runClaude).not.toHaveBeenCalled()
  })

  it('ask: 200 mit gültigem Einmal-Ticket oder Werkstatt-Login, Claude läuft im leeren Ordner', async () => {
    const runClaude = vi.fn(async () => 'Weil Chlorophyll …')
    const { app, deps } = setup({ runClaude })
    const t = ticket()
    const r = await request(app).post('/api/ask').set('X-Ask-Ticket', t).send(askBody).expect(200)
    expect(r.body).toEqual({ answer: 'Weil Chlorophyll …' })
    expect(runClaude).toHaveBeenCalledWith(expect.any(String), { addDir: join(deps.uploadDir!, 'ask-empty') })
    // Dasselbe Ticket ein zweites Mal: abgelehnt.
    await request(app).post('/api/ask').set('X-Ask-Ticket', t).send(askBody).expect(401)
    await login(app)
    await request(app).post('/api/ask').send(askBody).expect(200)
  })

  it('ask: Ticketprüfung schlägt fehl → 401', async () => {
    const runClaude = vi.fn(async () => 'x')
    const { app, gateway } = setup({ runClaude })
    vi.mocked(gateway.redeemTicket).mockRejectedValueOnce(new Error('offline'))
    await request(app).post('/api/ask').set('X-Ask-Ticket', ticket()).send(askBody).expect(401)
    expect(runClaude).not.toHaveBeenCalled()
  })

  it('ask: begrenzt Eingaben', async () => {
    const runClaude = vi.fn(async () => 'x')
    const { app } = setup({ runClaude })
    const post = (b: object) => request(app).post('/api/ask').set('X-Ask-Ticket', ticket()).send(b)
    await post({ ...askBody, userAnswer: 'a'.repeat(2001) }).expect(413)
    await post({ ...askBody, history: Array.from({ length: 21 }, () => ({ role: 'user', text: 'x' })) }).expect(413)
    await post({ ...askBody, history: [{ role: 'user', text: 'x'.repeat(4001) }] }).expect(413)
    await post({ ...askBody, card: { ...askBody.card, explanation: 'x'.repeat(20001) } }).expect(413)
    await post({ ...askBody, userAnswer: 'a'.repeat(300_000) }).expect(413)
    expect(runClaude).not.toHaveBeenCalled()
  })
})

describe('Sitzungscookie der Werkstatt', () => {
  it('Login setzt ein HttpOnly-, SameSite=Strict-Cookie mit zufälligem Wert', async () => {
    const { app } = setup()
    const r = await request(app, null).post('/api/login').send({ email: 'a@b.de', password: 'richtig' }).expect(200)
    const raw = ([] as string[]).concat(r.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('werkstatt_sitzung='))!
    expect(raw).toMatch(/^werkstatt_sitzung=[A-Za-z0-9_-]{43};/)
    expect(raw).toMatch(/HttpOnly/i)
    expect(raw).toMatch(/SameSite=Strict/i)
    expect(raw).toMatch(/Path=\//i)
  })

  it('nach dem Login gilt nur, wer das Cookie mitschickt', async () => {
    const runClaude = vi.fn(async () => JSON.stringify({ cards: [choiceDraft('Zellen')] }))
    const { app, calls } = setup({ runClaude })
    const good = await login(app)
    const forged = `werkstatt_sitzung=${'A'.repeat(43)}`
    for (const c of [null, forged, 'werkstatt_sitzung=', 'anderes=1']) {
      await request(app, c).get('/api/modules').expect(401)
      await request(app, c).post('/api/modules').send({ name: 'X' }).expect(401)
      await request(app, c).get('/api/jobs/irgendwas').expect(401)
      await request(app, c).post('/api/commit').send({ moduleId: 'm1', cards: [] }).expect(401)
      await request(app, c)
        .post('/api/generate')
        .field('moduleId', 'm1')
        .field('kind', 'script')
        .attach('file', Buffer.from('%PDF-1.4'), 'skript.pdf')
        .expect(401)
      await request(app, c).post('/api/ask').send(askBodyForCookies).expect(401)
      expect((await request(app, c).get('/api/config')).body).toEqual({ configured: true, loggedIn: false })
    }
    expect(runClaude).not.toHaveBeenCalled()
    expect(calls.upsertModule).toHaveLength(0)
    await request(app, `anderes=1; ${good}`).get('/api/modules').expect(200)
    expect((await request(app, good).get('/api/config')).body).toEqual({ configured: true, loggedIn: true })
  })

  it('eine zweite Anmeldung (zweiter Browser) meldet die erste nicht ab', async () => {
    const runClaude = vi.fn(async () => 'x')
    const { app } = setup({ runClaude })
    const first = await login(app)
    const second = await login(app)
    expect(second).not.toBe(first)
    await request(app, first).get('/api/modules').expect(200)
    await request(app, second).get('/api/modules').expect(200)
    await request(app, first).post('/api/ask').send(askBodyForCookies).expect(200)
    await request(app, second).post('/api/ask').send(askBodyForCookies).expect(200)
  })

  it('fehlgeschlagener Login setzt kein Cookie und lässt bestehende Sitzungen gültig', async () => {
    const { app } = setup()
    const good = await login(app)
    const r = await request(app, null).post('/api/login').send({ email: 'a@b.de', password: 'falsch' }).expect(401)
    expect(sessionCookie(r)).toBeUndefined()
    await request(app, good).get('/api/modules').expect(200)
  })

  it('Einmal-Ticket der App funktioniert ohne Cookie', async () => {
    const runClaude = vi.fn(async () => 'x')
    const { app } = setup({ runClaude })
    await login(app)
    await request(app, null).post('/api/ask').set('X-Ask-Ticket', ticket()).send(askBodyForCookies).expect(200)
  })
})

const askBodyForCookies = {
  card: { type: 'free', payload: { question: 'q', modelAnswer: 'a', keyPoints: ['a'] }, explanation: '', source: null },
  userAnswer: 'b',
  history: [],
}

describe('Host-Schutz', () => {
  it('lehnt fremden Host ab, erlaubt lokalen', async () => {
    const { app } = setup()
    expect((await st(app).get('/api/health').set('Host', 'evil.example:5174')).status).toBe(403)
    expect((await st(app).get('/api/modules').set('Host', 'rebind.example')).status).toBe(403)
    expect((await st(app).get('/api/health').set('Host', 'localhost:5174')).status).toBe(200)
    expect((await request(app).get('/api/health')).status).toBe(200)
  })

  it('Sec-Fetch-Site cross-site nur von erlaubter Origin', async () => {
    const { app } = setup()
    expect((await request(app).get('/api/health').set('Sec-Fetch-Site', 'cross-site')).status).toBe(403)
    expect((await request(app).get('/api/health').set('Sec-Fetch-Site', 'cross-site').set('Origin', 'https://evil.example')).status).toBe(403)
    expect((await request(app).get('/api/health').set('Sec-Fetch-Site', 'cross-site').set('Origin', APP)).status).toBe(200)
  })
})

describe('CORS', () => {
  it('erlaubt App-Origin und localhost:5173, lehnt fremde Origin ab', async () => {
    const { app } = setup()
    for (const o of [APP, 'http://localhost:5173']) {
      const r = await request(app).get('/api/health').set('Origin', o)
      expect(r.status).toBe(200)
      expect(r.headers['access-control-allow-origin']).toBe(o)
    }
    const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example')
    expect(evil.status).toBe(403)
    expect(evil.headers['access-control-allow-origin']).toBeUndefined()
    const post = await request(app).post('/api/login').set('Origin', 'https://evil.example').send({})
    expect(post.status).toBe(403)
  })

  it('Preflight enthält Private-Network-Header', async () => {
    const { app } = setup()
    const r = await request(app)
      .options('/api/commit')
      .set('Origin', APP)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
    expect(r.status).toBe(204)
    expect(r.headers['access-control-allow-private-network']).toBe('true')
    expect(r.headers['access-control-allow-origin']).toBe(APP)
    const bad = await request(app).options('/api/commit').set('Origin', 'https://evil.example')
    expect(bad.status).toBe(403)
  })
})
