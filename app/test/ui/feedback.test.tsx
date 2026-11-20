// @vitest-environment jsdom
import './setup'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Feedback } from '../../src/ui/Feedback'
import { choiceCard, clozeCard, freeCard, matchingCard, orderCard } from './fixtures'

describe('Feedback', () => {
  it('zeigt bei falscher Wahl das why der gewählten und der richtigen Option', () => {
    render(<Feedback card={choiceCard('c1')} outcome="wrong" answer={{ kind: 'choice', index: 2 }} onNext={vi.fn()} />)
    expect(screen.getByText('C ist falsch, weil C.')).toBeInTheDocument()
    expect(screen.getByText('B stimmt, weil B.')).toBeInTheDocument()
    expect(screen.getByText('Weil es so ist.')).toBeInTheDocument()
  })

  it('formatiert die Quelle', () => {
    const card = choiceCard('c1', { source: { file: 'Skript_Botanik.pdf', page: 12, quote: 'Zitat hier' } })
    render(<Feedback card={card} outcome="right" answer={{ kind: 'choice', index: 1 }} onNext={vi.fn()} />)
    expect(screen.getByText('Skript_Botanik.pdf, S. 12: „Zitat hier“')).toBeInTheDocument()
  })

  it('Nachfragen nur mit onAsk; Weiter ruft onNext', async () => {
    const onNext = vi.fn()
    const card = choiceCard('c1')
    const answer = { kind: 'choice', index: 1 } as const
    const { rerender } = render(<Feedback card={card} outcome="right" answer={answer} onNext={onNext} />)
    expect(screen.queryByRole('button', { name: 'Nachfragen' })).not.toBeInTheDocument()
    const onAsk = vi.fn()
    rerender(<Feedback card={card} outcome="right" answer={answer} onNext={onNext} onAsk={onAsk} />)
    await userEvent.click(screen.getByRole('button', { name: 'Nachfragen' }))
    expect(onAsk).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(onNext).toHaveBeenCalled()
  })

  it('zeigt die Frage, damit man sie mit der Antwort vergleichen kann', () => {
    render(<Feedback card={clozeCard('z')} outcome="wrong" answer={{ kind: 'cloze', inputs: ['Ribosomen'], perGap: [false] }} onNext={vi.fn()} />)
    expect(screen.getByText('Die [Lücke 1] sind das Kraftwerk der Zelle.')).toBeInTheDocument()
    expect(screen.getByText(/du: Ribosomen/)).toBeInTheDocument()
    expect(screen.getByText(/richtig: Mitochondrien/)).toBeInTheDocument()
  })

  it('Reihenfolge: eigene und richtige Reihenfolge nebeneinander', () => {
    render(<Feedback card={orderCard('o')} outcome="wrong" answer={{ kind: 'order', order: [1, 0, 2] }} onNext={vi.fn()} />)
    const [mine, correct] = screen.getAllByRole('list')
    expect(screen.getByRole('heading', { name: 'Deine Reihenfolge' })).toBeInTheDocument()
    expect(mine!.textContent).toBe('✗ Dann✗ Erst✓ Zuletzt')
    expect(correct!.textContent).toBe('ErstDannZuletzt')
  })

  it('Zuordnung: zeigt je Begriff deine Zuordnung und bei Fehlern die richtige', () => {
    render(<Feedback card={matchingCard('m')} outcome="wrong" answer={{ kind: 'matching', mapping: [1, 0, 2] }} onNext={vi.fn()} />)
    expect(screen.getByText(/✗ Herz → du: Gasaustausch/)).toBeInTheDocument()
    expect(screen.getByText(/✓ Niere → du: Filter/)).toBeInTheDocument()
    expect(screen.getAllByText(/richtig:/)).toHaveLength(2)
  })

  it('Freitext: zeigt deine Antwort neben der Musterantwort', () => {
    render(<Feedback card={freeCard('f')} outcome="partial" answer={{ kind: 'free', text: 'Wasser geht durch.' }} onNext={vi.fn()} />)
    expect(screen.getByText('Wasser geht durch.')).toBeInTheDocument()
    expect(screen.getByText('Wasser wandert durch die Membran.')).toBeInTheDocument()
  })
})
