import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAskText, describeAnswer } from '../src/ask/askPrompt'
import { detectAskMode } from '../src/ask/askMode'
import { choiceCard, clozeCard, freeCard, matchingCard, orderCard } from './ui/fixtures'

describe('buildAskText', () => {
  it('enthält Frage, Nutzerantwort, richtige Antwort, Erklärung, Quelle und Bitte', () => {
    const card = choiceCard('c1', { source: { file: 'Skript.pdf', page: 3, quote: 'Zitat' } })
    const text = buildAskText(card, 'Falsch A')
    expect(text).toContain('Frage c1?')
    expect(text).toContain('Falsch A')
    expect(text).toContain('Richtig B')
    expect(text).toContain('Weil es so ist.')
    expect(text).toContain('Skript.pdf, S. 3')
    expect(text).toContain('Erkläre mir genauer, warum meine Antwort falsch ist und wo mein Denkfehler liegt.')
  })
})

describe('describeAnswer', () => {
  it('bildet Auswahl auf den Optionstext ab', () => {
    expect(describeAnswer(choiceCard('c1'), { kind: 'choice', index: 2 })).toBe('Falsch C')
  })
  it('verbindet Lückeneingaben', () => {
    expect(describeAnswer(clozeCard('c2'), { kind: 'cloze', inputs: ['Plastiden'], perGap: [false] })).toContain('Plastiden')
  })
  it('rendert Zuordnung und Reihenfolge als Text', () => {
    const m = matchingCard('m')
    const t = describeAnswer(m, { kind: 'matching', mapping: m.payload.pairs.map((_, i) => (i + 1) % m.payload.pairs.length) })
    expect(t).toContain(m.payload.pairs[0]!.left)
    expect(t).toContain(m.payload.pairs[1]!.right)
    const o = orderCard('o')
    const rev = o.payload.steps.map((_, i) => o.payload.steps.length - 1 - i)
    expect(describeAnswer(o, { kind: 'order', order: rev }).startsWith(`1. ${o.payload.steps[rev[0]!]}`)).toBe(true)
  })
  it('nimmt freien Text wie getippt', () => {
    expect(describeAnswer(freeCard('f'), { kind: 'free', text: 'mein Text' })).toBe('mein Text')
  })
})

describe('detectAskMode', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  it('werkstatt, wenn health ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    expect(await detectAskMode()).toBe('werkstatt')
  })
  it('clipboard bei Fehler', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    expect(await detectAskMode()).toBe('clipboard')
  })
  it('clipboard bei Timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('abort'))))),
    )
    const p = detectAskMode()
    await vi.advanceTimersByTimeAsync(900)
    expect(await p).toBe('clipboard')
    vi.useRealTimers()
  })
})
