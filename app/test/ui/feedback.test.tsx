// @vitest-environment jsdom
import './setup'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Feedback } from '../../src/ui/Feedback'
import { choiceCard } from './fixtures'

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
})
