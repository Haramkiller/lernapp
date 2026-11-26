// @vitest-environment jsdom
import './setup'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Choice } from '../../src/ui/questions/Choice'
import { Cloze } from '../../src/ui/questions/Cloze'
import { Matching } from '../../src/ui/questions/Matching'
import { Order } from '../../src/ui/questions/Order'
import { Free } from '../../src/ui/questions/Free'
import { Typed } from '../../src/ui/questions/Typed'
import { seededRng } from '../../src/ui/random'
import { choiceCard, clozeCard, freeCard, matchingCard, orderCard } from './fixtures'

const btn = (name: string) => screen.getByRole('button', { name })
const typedCard = () => {
  const c = choiceCard('t1')
  return { ...c, payload: { ...c.payload, typed: { answers: ['Mitochondrien'] } } }
}

describe('Sicher / Unsicher', () => {
  it('Auswahl: erst nach der Wahl aktiv, übergibt die Einschätzung', async () => {
    const onAnswer = vi.fn()
    render(<Choice card={choiceCard('c1')} rng={seededRng(1)} onAnswer={onAnswer} />)
    expect(btn('Sicher')).toBeDisabled()
    expect(btn('Unsicher')).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /Richtig B/ }))
    await userEvent.click(btn('Unsicher'))
    expect(onAnswer).toHaveBeenCalledWith('right', { kind: 'choice', index: 1 }, 'unsure')
  })

  it('Lückentext: Enter schickt nicht ab, „Sicher“ schon', async () => {
    const onAnswer = vi.fn()
    render(<Cloze card={clozeCard('z1')} onAnswer={onAnswer} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Lücke 1' }), 'Mitochondrien{Enter}')
    expect(onAnswer).not.toHaveBeenCalled()
    await userEvent.click(btn('Sicher'))
    expect(onAnswer).toHaveBeenCalledWith('right', expect.objectContaining({ kind: 'cloze' }), 'sure')
  })

  it('Eintippen: Einschätzung gilt auch für „Doch richtig“; Enter schickt nicht ab', async () => {
    const onAnswer = vi.fn()
    render(<Typed card={typedCard()} onAnswer={onAnswer} />)
    const field = screen.getByRole('textbox', { name: 'Deine Antwort' })
    await userEvent.type(field, 'Ribosomen{Enter}')
    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.queryByText(/Lösung:/)).not.toBeInTheDocument()
    await userEvent.click(btn('Sicher'))
    expect(onAnswer).not.toHaveBeenCalled()
    await userEvent.click(btn('Doch richtig'))
    expect(onAnswer).toHaveBeenCalledWith('right', { kind: 'typed', text: 'Ribosomen', matched: false, overridden: true }, 'sure')
  })

  it('Eintippen: „Weiß nicht“ ist falsch und unsicher', async () => {
    const onAnswer = vi.fn()
    render(<Typed card={typedCard()} onAnswer={onAnswer} />)
    expect(btn('Sicher')).toBeDisabled()
    await userEvent.click(btn('Weiß nicht'))
    expect(onAnswer).toHaveBeenCalledWith('wrong', { kind: 'typed', text: '', matched: false, overridden: false }, 'unsure')
  })

  it('Reihenfolge und Zuordnen übergeben „unsicher“', async () => {
    const onOrder = vi.fn()
    const { unmount } = render(<Order card={orderCard('o1')} rng={seededRng(1)} onAnswer={onOrder} />)
    await userEvent.click(btn('Unsicher'))
    expect(onOrder).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ kind: 'order' }), 'unsure')
    unmount()
    const onMatch = vi.fn()
    render(<Matching card={matchingCard('m1')} rng={seededRng(1)} onAnswer={onMatch} />)
    for (const [l, r] of [['Herz', 'Pumpe'], ['Lunge', 'Gasaustausch'], ['Niere', 'Filter']]) {
      await userEvent.click(screen.getByRole('button', { name: l }))
      await userEvent.click(screen.getByRole('button', { name: r }))
    }
    await userEvent.click(btn('Unsicher'))
    expect(onMatch).toHaveBeenCalledWith('right', expect.objectContaining({ kind: 'matching' }), 'unsure')
  })

  it('Freie Antwort: keine Einschätzung', async () => {
    const onAnswer = vi.fn()
    render(<Free card={freeCard('f1')} onAnswer={onAnswer} />)
    await userEvent.click(btn('Lösung zeigen'))
    await userEvent.click(screen.getByRole('button', { name: /Gewusst/ }))
    expect(onAnswer).toHaveBeenCalledWith('right', expect.objectContaining({ kind: 'free' }), null)
  })
})
