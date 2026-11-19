// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PUBLIC = join(__dirname, '..', 'public')

/** Lädt index.html + app.js in jsdom; `fetch` beantwortet die API mit festen Antworten. */
async function loadWerkstatt(responses: Record<string, unknown>) {
  const html = readFileSync(join(PUBLIC, 'index.html'), 'utf8')
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)![1]!.replace(/<script[\s\S]*?<\/script>/g, '')
  const posted: { path: string; body: unknown }[] = []
  const fetchMock = vi.fn(async (path: string, opts?: { body?: unknown }) => {
    if (typeof opts?.body === 'string') posted.push({ path, body: JSON.parse(opts.body) })
    const key = Object.keys(responses).find((k) => path.startsWith(k))
    return { ok: true, status: 200, json: async () => (key ? responses[key] : {}) }
  })
  vi.stubGlobal('fetch', fetchMock)
  new Function(readFileSync(join(PUBLIC, 'app.js'), 'utf8') + '\ninit()')()
  await vi.waitFor(() => expect((document.getElementById('module') as HTMLSelectElement).options.length).toBe(2))
  return { posted }
}

describe('Werkstatt-Oberfläche', () => {
  it('übernimmt Karten in das Modul, für das sie erzeugt wurden, auch nach Modulwechsel', async () => {
    const { posted } = await loadWerkstatt({
      '/api/config': { configured: true, loggedIn: true },
      '/api/modules': {
        modules: [
          { id: 'm1', name: 'Eins', topics: [] },
          { id: 'm2', name: 'Zwei', topics: [] },
        ],
      },
      '/api/generate': { jobId: 'j1' },
      '/api/jobs/j1': { status: 'done', progress: { done: 1, total: 1 }, cards: [], examTopics: ['Thema A'] },
      '/api/commit': { added: 0, topicsCreated: 0, markedExamRelevant: 0 },
    })
    const select = document.getElementById('module') as HTMLSelectElement
    select.value = 'm1'
    select.dispatchEvent(new Event('change'))
    const drop = document.getElementById('drop')!
    const ev = new Event('drop') as Event & { dataTransfer?: unknown }
    ev.dataTransfer = { files: [new File(['x'], 'skript.pdf', { type: 'application/pdf' })] }
    drop.dispatchEvent(ev)
    ;(document.getElementById('generate') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(document.getElementById('preview')!.hidden).toBe(false))

    select.value = 'm2'
    select.dispatchEvent(new Event('change'))
    ;(document.getElementById('commit') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(posted.some((p) => p.path === '/api/commit')).toBe(true))
    const commit = posted.find((p) => p.path === '/api/commit')!.body as { moduleId: string; examTopics: string[] }
    expect(commit.moduleId).toBe('m1')
    expect(commit.examTopics).toEqual(['Thema A'])
    vi.unstubAllGlobals()
  })
})
