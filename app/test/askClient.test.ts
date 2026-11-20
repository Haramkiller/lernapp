import { afterEach, describe, expect, it, vi } from 'vitest'
import { askWerkstatt, trimHistory, WerkstattError, type HistoryEntry } from '../src/ask/askClient'
import { choiceCard } from './ui/fixtures'

const card = choiceCard('c1')
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })

afterEach(() => vi.unstubAllGlobals())

describe('trimHistory', () => {
  it('behält die letzten 20 Einträge und kürzt Texte auf 4000 Zeichen', () => {
    const h: HistoryEntry[] = Array.from({ length: 25 }, (_, i) => ({ role: 'user', text: `${i}`.padEnd(5000, 'x') }))
    const t = trimHistory(h)
    expect(t).toHaveLength(20)
    expect(t[0]!.text.startsWith('5x')).toBe(true)
    expect(t.every((e) => e.text.length === 4000)).toBe(true)
  })
})

describe('askWerkstatt', () => {
  it('ruft genau /api/ask mit Einmal-Ticket statt Zugriffstoken auf und kürzt Antwort und Verlauf', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { answer: 'Antwort' }))
    vi.stubGlobal('fetch', fetchMock)
    const history: HistoryEntry[] = Array.from({ length: 22 }, () => ({ role: 'user', text: 'y'.repeat(4500) }))
    expect(await askWerkstatt(card, 'a'.repeat(2500), history, 'ticket123')).toBe('Antwort')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://127.0.0.1:5174/api/ask')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'X-Ask-Ticket': 'ticket123' })
    const body = JSON.parse(init.body)
    expect(body.userAnswer).toHaveLength(2000)
    expect(body.history).toHaveLength(20)
    expect(body.history[0].text).toHaveLength(4000)
    expect(body.card.id).toBe('c1')
  })

  it('Netzwerkfehler -> unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')))
    await expect(askWerkstatt(card, 'x', [], 't')).rejects.toMatchObject({ unreachable: true })
  })

  it('5xx -> unreachable mit Werkstatt-Text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(500, { error: 'Claude nicht erreichbar.' })))
    await expect(askWerkstatt(card, 'x', [], 't')).rejects.toMatchObject({ unreachable: true, serverMessage: 'Claude nicht erreichbar.' })
  })

  it('4xx -> Fehler mit Text, kein Fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { error: 'Ungültige oder abgelaufene Sitzung.' })))
    const err = await askWerkstatt(card, 'x', [], 't').catch((e) => e)
    expect(err).toBeInstanceOf(WerkstattError)
    expect(err.unreachable).toBe(false)
    expect(err.message).toBe('Ungültige oder abgelaufene Sitzung.')
  })
})
