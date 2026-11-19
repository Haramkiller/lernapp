// @vitest-environment jsdom
import './ui/setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AskDialog } from '../src/ui/AskDialog'
import { choiceCard } from './ui/fixtures'

const card = choiceCard('c1')
const getToken = async () => 'tok'

afterEach(() => vi.unstubAllGlobals())

describe('AskDialog', () => {
  it('Zwischenablage-Modus: kopiert Text und öffnet claude.ai ohne Inhalt in der URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const open = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('open', open)
    render(<AskDialog card={card} answer={{ kind: 'choice', index: 0 }} getToken={getToken} onClose={vi.fn()} />)
    expect(await screen.findByText('Text kopiert – in Claude einfügen')).toBeInTheDocument()
    expect(writeText.mock.calls[0]![0]).toContain('Falsch A')
    await userEvent.click(screen.getByRole('button', { name: 'Claude öffnen' }))
    expect(open).toHaveBeenCalledWith('https://claude.ai/new', '_blank', 'noopener')
  })

  it('zeigt den Text zum Markieren, wenn die Zwischenablage nicht geht', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    vi.stubGlobal('navigator', {})
    render(<AskDialog card={card} answer={{ kind: 'choice', index: 0 }} getToken={getToken} onClose={vi.fn()} />)
    const area = (await screen.findByLabelText('Text zum Kopieren')) as HTMLTextAreaElement
    expect(area).toHaveAttribute('readonly')
    expect(area.value).toContain('Frage c1?')
    expect(screen.getByText(/Text markieren und kopieren/)).toBeInTheDocument()
  })
})
