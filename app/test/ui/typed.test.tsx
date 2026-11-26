// @vitest-environment jsdom
import './setup'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Typed } from '../../src/ui/questions/Typed'
import { Feedback } from '../../src/ui/Feedback'
import { describeAnswer } from '../../src/ask/askPrompt'
import { choiceCard } from './fixtures'

const card = () => {
  const c = choiceCard('t1')
  return { ...c, payload: { ...c.payload, typed: { answers: ['Mitochondrien', 'Mitochondrium'] } } }
}
const input = () => screen.getByRole('textbox', { name: 'Deine Antwort' })

describe('Typed', () => {
  it('richtige Eingabe + „Sicher“ → sofort richtig', async () => {
    const onAnswer = vi.fn()
    render(<Typed card={card()} onAnswer={onAnswer} />)
    expect(screen.getByText('Eintippen')).toBeInTheDocument()
    await userEvent.type(input(), 'mitochondrium')
    await userEvent.click(screen.getByRole('button', { name: 'Sicher' }))
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer).toHaveBeenCalledWith('right', { kind: 'typed', text: 'mitochondrium', matched: true, overridden: false }, 'sure')
  })

  it('Feld ohne Autokorrektur', () => {
    render(<Typed card={card()} onAnswer={vi.fn()} />)
    expect(input()).toHaveAttribute('autocorrect', 'off')
  })

  it('„Sicher“ ist bei leerem Feld deaktiviert', async () => {
    render(<Typed card={card()} onAnswer={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Sicher' })).toBeDisabled()
    await userEvent.type(input(), '   ')
    expect(screen.getByRole('button', { name: 'Sicher' })).toBeDisabled()
  })

  it('falsche Eingabe zeigt die Lösung und speichert erst nach „Doch richtig“', async () => {
    const onAnswer = vi.fn()
    render(<Typed card={card()} onAnswer={onAnswer} />)
    await userEvent.type(input(), 'Ribosomen')
    await userEvent.click(screen.getByRole('button', { name: 'Sicher' }))
    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.getByText('Lösung: Mitochondrien')).toBeInTheDocument()
    expect(screen.getByText('B stimmt, weil B.')).toBeInTheDocument()
    expect(input()).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Doch richtig' }))
    expect(onAnswer).toHaveBeenCalledWith('right', { kind: 'typed', text: 'Ribosomen', matched: false, overridden: true }, 'sure')
  })

  it('falsche Eingabe + „Weiter“ → falsch', async () => {
    const onAnswer = vi.fn()
    render(<Typed card={card()} onAnswer={onAnswer} />)
    await userEvent.type(input(), 'Ribosomen')
    await userEvent.click(screen.getByRole('button', { name: 'Sicher' }))
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer).toHaveBeenCalledWith('wrong', { kind: 'typed', text: 'Ribosomen', matched: false, overridden: false }, 'sure')
  })

  it('„Weiß nicht“ → sofort falsch mit leerem Text', async () => {
    const onAnswer = vi.fn()
    render(<Typed card={card()} onAnswer={onAnswer} />)
    await userEvent.click(screen.getByRole('button', { name: 'Weiß nicht' }))
    expect(onAnswer).toHaveBeenCalledWith('wrong', { kind: 'typed', text: '', matched: false, overridden: false }, 'unsure')
  })
})

describe('Feedback und Nachfragen für typed', () => {
  it('zeigt Eingabe und richtige Lösung', () => {
    render(<Feedback card={card()} outcome="wrong" answer={{ kind: 'typed', text: 'Ribosomen', matched: false, overridden: false }} onNext={vi.fn()} />)
    expect(screen.getByText(/Deine Antwort: Ribosomen/)).toBeInTheDocument()
    expect(screen.getByText('Richtig: Mitochondrien')).toBeInTheDocument()
    expect(screen.getByText('B stimmt, weil B.')).toBeInTheDocument()
  })

  it('markiert selbst gewertete Antworten', () => {
    render(<Feedback card={card()} outcome="right" answer={{ kind: 'typed', text: 'Ribosomen', matched: false, overridden: true }} onNext={vi.fn()} />)
    expect(screen.getByText(/selbst als richtig gewertet/)).toBeInTheDocument()
  })

  it('beschreibt die Antwort für Nachfragen', () => {
    expect(describeAnswer(card(), { kind: 'typed', text: ' ', matched: false, overridden: false })).toBe('(weiß nicht)')
    expect(describeAnswer(card(), { kind: 'typed', text: 'Ribo', matched: false, overridden: true })).toBe('Ribo (selbst als richtig gewertet)')
  })
})
