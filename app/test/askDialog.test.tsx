// @vitest-environment jsdom
import './ui/setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { invalidateAskMode } from '../src/ask/askMode'
import { AskDialog } from '../src/ui/AskDialog'
import { choiceCard } from './ui/fixtures'

const card = choiceCard('c1')
const getToken = async () => 'tok'
const answer = { kind: 'choice', index: 0 } as const

afterEach(() => {
  vi.unstubAllGlobals()
  invalidateAskMode()
})

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const werkstattFetch = (ask: () => unknown) =>
  vi.fn((url: string) => (url.endsWith('/api/health') ? Promise.resolve({ ok: true }) : Promise.resolve(ask())))

describe('AskDialog Zwischenablage-Modus', () => {
  it('kopiert per Knopf und öffnet claude.ai ohne Inhalt in der URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const open = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('open', open)
    render(<AskDialog card={card} answer={answer} getToken={getToken} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Text kopieren' }))
    expect(await screen.findByText('Text kopiert – in Claude einfügen')).toBeInTheDocument()
    expect(writeText.mock.calls[0]![0]).toContain('Falsch A')
    await userEvent.click(screen.getByRole('button', { name: 'Claude öffnen' }))
    expect(open).toHaveBeenCalledWith('https://claude.ai/new', '_blank', 'noopener')
  })

  it('zeigt den Text zum Markieren, wenn die Zwischenablage nicht geht', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    vi.stubGlobal('navigator', {})
    render(<AskDialog card={card} answer={answer} getToken={getToken} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Text kopieren' }))
    const area = (await screen.findByLabelText('Text zum Kopieren')) as HTMLTextAreaElement
    expect(area).toHaveAttribute('readonly')
    expect(area.value).toContain('Frage c1?')
    expect(screen.getByText(/Text markieren und kopieren/)).toBeInTheDocument()
  })
})

describe('AskDialog Werkstatt-Modus', () => {
  it('Frage senden, Antwort erscheint, Verlauf wächst', async () => {
    const fetchMock = werkstattFetch(() => res(200, { answer: 'Weil B stimmt.' }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AskDialog card={card} answer={answer} getToken={getToken} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Erklärung anfordern' }))
    expect(await screen.findByText(/Weil B stimmt\./)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Deine Nachfrage'), 'Und warum nicht A?')
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }))
    expect(await screen.findAllByText(/Weil B stimmt\./)).toHaveLength(2)
    const calls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/ask'))
    expect(calls).toHaveLength(2)
    const init = (calls[1] as unknown as [string, RequestInit])[1]
    const second = JSON.parse(init.body as string)
    expect(second.history.map((h: { role: string }) => h.role)).toEqual(['user', 'assistant', 'user'])
    expect(second.userAnswer).toBe('Falsch A')
    expect(screen.getByText(/Und warum nicht A\?/)).toBeInTheDocument()
  })

  it('4xx zeigt den Fehler, kein Fallback', async () => {
    vi.stubGlobal('fetch', werkstattFetch(() => res(401, { error: 'Ungültige oder abgelaufene Sitzung.' })))
    render(<AskDialog card={card} answer={answer} getToken={getToken} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Erklärung anfordern' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ungültige oder abgelaufene Sitzung.')
    expect(screen.queryByRole('button', { name: 'Text kopieren' })).not.toBeInTheDocument()
  })

  it('Netzwerkfehler -> Zwischenablage-Ansicht', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.endsWith('/api/health') ? Promise.resolve({ ok: true }) : Promise.reject(new TypeError('x')))))
    render(<AskDialog card={card} answer={answer} getToken={getToken} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Erklärung anfordern' }))
    expect(await screen.findByRole('button', { name: 'Text kopieren' })).toBeInTheDocument()
  })

  it('5xx -> Zwischenablage-Ansicht mit Werkstatt-Fehler', async () => {
    vi.stubGlobal('fetch', werkstattFetch(() => res(500, { error: 'Claude nicht erreichbar.' })))
    render(<AskDialog card={card} answer={answer} getToken={getToken} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Erklärung anfordern' }))
    expect(await screen.findByText('Werkstatt-Fehler: Claude nicht erreichbar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Text kopieren' })).toBeInTheDocument()
  })
})
