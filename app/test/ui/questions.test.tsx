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
import { seededRng } from '../../src/ui/random'
import { choiceCard, clozeCard, freeCard, matchingCard, orderCard } from './fixtures'

describe('Choice', () => {
  it('meldet die Wahl einer falschen Option mit Originalindex', async () => {
    const onAnswer = vi.fn()
    render(<Choice card={choiceCard('c1')} rng={seededRng(1)} onAnswer={onAnswer} />)
    await userEvent.click(screen.getByRole('button', { name: /Falsch C/ }))
    expect(onAnswer).toHaveBeenCalledWith('wrong', { kind: 'choice', index: 2 })
  })

  it('richtige Option → right', async () => {
    const onAnswer = vi.fn()
    render(<Choice card={choiceCard('c1')} rng={seededRng(7)} onAnswer={onAnswer} />)
    await userEvent.click(screen.getByRole('button', { name: /Richtig B/ }))
    expect(onAnswer).toHaveBeenCalledWith('right', { kind: 'choice', index: 1 })
  })
})

describe('Cloze', () => {
  it('Tippfehler zählt als richtig', async () => {
    const onAnswer = vi.fn()
    render(<Cloze card={clozeCard('z1')} onAnswer={onAnswer} />)
    await userEvent.type(screen.getByLabelText('Lücke 1'), 'Mitochondrein')
    await userEvent.click(screen.getByRole('button', { name: 'Prüfen' }))
    expect(onAnswer).toHaveBeenCalledWith('right', { kind: 'cloze', inputs: ['Mitochondrein'], perGap: [true] })
  })

  it('falsche Eingabe → wrong', async () => {
    const onAnswer = vi.fn()
    render(<Cloze card={clozeCard('z1')} onAnswer={onAnswer} />)
    await userEvent.type(screen.getByLabelText('Lücke 1'), 'Ribosom')
    await userEvent.click(screen.getByRole('button', { name: 'Prüfen' }))
    expect(onAnswer.mock.calls[0]?.[0]).toBe('wrong')
  })
})

describe('Matching', () => {
  it('bildet gemischte Anzeige auf Originalindizes ab', async () => {
    const onAnswer = vi.fn()
    render(<Matching card={matchingCard('m1')} rng={seededRng(3)} onAnswer={onAnswer} />)
    await userEvent.selectOptions(screen.getByLabelText('Herz'), 'Pumpe')
    await userEvent.selectOptions(screen.getByLabelText('Lunge'), 'Gasaustausch')
    await userEvent.selectOptions(screen.getByLabelText('Niere'), 'Filter')
    await userEvent.click(screen.getByRole('button', { name: 'Prüfen' }))
    expect(onAnswer).toHaveBeenCalledWith('right', { kind: 'matching', mapping: [0, 1, 2] })
  })

  it('Prüfen erst nach vollständiger Zuordnung', () => {
    render(<Matching card={matchingCard('m1')} rng={seededRng(3)} onAnswer={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Prüfen' })).toBeDisabled()
  })
})

describe('Order', () => {
  it('meldet Reihenfolge als Originalindizes; Verschieben ändert sie', async () => {
    const onAnswer = vi.fn()
    render(<Order card={orderCard('o1')} rng={seededRng(5)} onAnswer={onAnswer} />)
    const names = ['Erst', 'Dann', 'Zuletzt']
    for (let target = 0; target < names.length; target++) {
      for (;;) {
        const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
        const pos = items.findIndex((t) => t.includes(names[target]!))
        if (pos <= target) break
        await userEvent.click(screen.getByRole('button', { name: `${names[target]} nach oben` }))
      }
    }
    await userEvent.click(screen.getByRole('button', { name: 'Prüfen' }))
    expect(onAnswer).toHaveBeenCalledWith('right', { kind: 'order', order: [0, 1, 2] })
  })
})

describe('Free', () => {
  it('Selbsteinschätzung erst nach „Lösung zeigen“', async () => {
    const onAnswer = vi.fn()
    render(<Free card={freeCard('f1')} onAnswer={onAnswer} />)
    expect(screen.queryByRole('button', { name: 'Gewusst' })).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox'), 'Wasser geht durch Membran')
    await userEvent.click(screen.getByRole('button', { name: 'Lösung zeigen' }))
    expect(screen.getByText('Wasser wandert durch die Membran.')).toBeInTheDocument()
    expect(screen.getByText('Konzentrationsgefälle')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nicht gewusst' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Teilweise' }))
    expect(onAnswer).toHaveBeenCalledWith('partial', { kind: 'free', text: 'Wasser geht durch Membran' })
  })
})
