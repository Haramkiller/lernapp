// @vitest-environment jsdom
import './setup'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Choice } from '../../src/ui/questions/Choice'
import { Cloze } from '../../src/ui/questions/Cloze'
import { Matching } from '../../src/ui/questions/Matching'
import { Order, moveItem } from '../../src/ui/questions/Order'
import { Free } from '../../src/ui/questions/Free'
import { seededRng } from '../../src/ui/random'
import { choiceCard, clozeCard, freeCard, matchingCard, orderCard } from './fixtures'

describe('Choice', () => {
  const check = () => userEvent.click(screen.getByRole('button', { name: 'Sicher' }))

  it('meldet die Wahl einer falschen Option mit Originalindex', async () => {
    const onAnswer = vi.fn()
    render(<Choice card={choiceCard('c1')} rng={seededRng(1)} onAnswer={onAnswer} />)
    await userEvent.click(screen.getByRole('button', { name: /Falsch C/ }))
    await check()
    expect(onAnswer).toHaveBeenCalledWith('wrong', { kind: 'choice', index: 2 }, 'sure')
  })

  it('richtige Option → right', async () => {
    const onAnswer = vi.fn()
    render(<Choice card={choiceCard('c1')} rng={seededRng(7)} onAnswer={onAnswer} />)
    await userEvent.click(screen.getByRole('button', { name: /Richtig B/ }))
    await check()
    expect(onAnswer).toHaveBeenCalledWith('right', { kind: 'choice', index: 1 }, 'sure')
  })

  it('Antippen wählt nur aus; erst „Prüfen“ wertet, eine neue Wahl ersetzt die alte', async () => {
    const onAnswer = vi.fn()
    render(<Choice card={choiceCard('c1')} rng={seededRng(7)} onAnswer={onAnswer} />)
    expect(screen.getByRole('button', { name: 'Sicher' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /Falsch A/ }))
    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Falsch A/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /Richtig B/ }))
    expect(screen.getByRole('button', { name: /Falsch A/ })).toHaveAttribute('aria-pressed', 'false')
    await check()
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer).toHaveBeenCalledWith('right', { kind: 'choice', index: 1 }, 'sure')
  })

  it('Optionen tragen Buchstaben A–D', () => {
    render(<Choice card={choiceCard('c1')} rng={seededRng(7)} onAnswer={vi.fn()} />)
    const letters = screen.getAllByRole('button', { name: /^[A-D] / }).map((b) => b.textContent![0])
    expect(letters).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('Cloze', () => {
  it('Tippfehler zählt als richtig', async () => {
    const onAnswer = vi.fn()
    render(<Cloze card={clozeCard('z1')} onAnswer={onAnswer} />)
    await userEvent.type(screen.getByLabelText('Lücke 1'), 'Mitochondrein')
    await userEvent.click(screen.getByRole('button', { name: 'Sicher' }))
    expect(onAnswer).toHaveBeenCalledWith('right', { kind: 'cloze', inputs: ['Mitochondrein'], perGap: [true] }, 'sure')
  })

  it('falsche Eingabe → wrong', async () => {
    const onAnswer = vi.fn()
    render(<Cloze card={clozeCard('z1')} onAnswer={onAnswer} />)
    await userEvent.type(screen.getByLabelText('Lücke 1'), 'Ribosom')
    await userEvent.click(screen.getByRole('button', { name: 'Sicher' }))
    expect(onAnswer.mock.calls[0]?.[0]).toBe('wrong')
  })
})

describe('Cloze: Lücken', () => {
  it('Lücke wächst mit der Eingabe und gilt dann als ausgefüllt', async () => {
    render(<Cloze card={clozeCard('z1')} onAnswer={vi.fn()} />)
    const gap = screen.getByLabelText('Lücke 1')
    expect(gap).not.toHaveClass('filled')
    const before = Number(gap.getAttribute('size'))
    await userEvent.type(gap, 'Mitochondrien')
    expect(gap).toHaveClass('filled')
    expect(Number(gap.getAttribute('size'))).toBeGreaterThan(before)
  })
})

describe('Matching', () => {
  const tap = (name: string) => userEvent.click(screen.getByRole('button', { name }))

  it('Kacheln: links antippen, dann rechts – bildet auf Originalindizes ab', async () => {
    const onAnswer = vi.fn()
    render(<Matching card={matchingCard('m1')} rng={seededRng(3)} onAnswer={onAnswer} />)
    await tap('Herz')
    await tap('Pumpe')
    await tap('Lunge')
    await tap('Gasaustausch')
    await tap('Niere')
    await tap('Filter')
    await userEvent.click(screen.getByRole('button', { name: 'Sicher' }))
    expect(onAnswer).toHaveBeenCalledWith('right', { kind: 'matching', mapping: [0, 1, 2] }, 'sure')
  })

  it('Prüfen erst nach vollständiger Zuordnung', async () => {
    render(<Matching card={matchingCard('m1')} rng={seededRng(3)} onAnswer={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Sicher' })).toBeDisabled()
    await tap('Herz')
    expect(screen.getByRole('button', { name: 'Herz' })).toHaveAttribute('aria-pressed', 'true')
    await tap('Pumpe')
    expect(screen.getByRole('button', { name: 'Sicher' })).toBeDisabled()
  })

  it('eine schon vergebene rechte Kachel wechselt zum neuen Partner', async () => {
    const onAnswer = vi.fn()
    render(<Matching card={matchingCard('m1')} rng={seededRng(3)} onAnswer={onAnswer} />)
    await tap('Herz')
    await tap('Filter')
    await tap('Lunge')
    await tap('Filter') // Filter wandert von Herz zu Lunge
    await tap('Herz')
    await tap('Pumpe')
    await tap('Niere')
    await tap('Gasaustausch')
    await userEvent.click(screen.getByRole('button', { name: 'Sicher' }))
    expect(onAnswer).toHaveBeenCalledWith('wrong', { kind: 'matching', mapping: [0, 2, 1] }, 'sure')
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
    await userEvent.click(screen.getByRole('button', { name: 'Sicher' }))
    expect(onAnswer).toHaveBeenCalledWith('right', { kind: 'order', order: [0, 1, 2] }, 'sure')
  })
})

describe('Order: Hilfen', () => {
  it('moveItem verschiebt ein Element an eine neue Position', () => {
    expect(moveItem([0, 1, 2, 3], 0, 2)).toEqual([1, 2, 0, 3])
    expect(moveItem([0, 1, 2, 3], 3, 0)).toEqual([3, 0, 1, 2])
    expect(moveItem([0, 1, 2], 1, 1)).toEqual([0, 1, 2])
  })

  it('zeigt Positionsnummern und einen Griff zum Ziehen', () => {
    render(<Order card={orderCard('o1')} rng={seededRng(5)} onAnswer={vi.fn()} />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('.num')?.textContent)).toEqual(['1', '2', '3'])
    expect(screen.getAllByLabelText(/ziehen$/)).toHaveLength(3)
  })
})

describe('Free', () => {
  it('Zeichenzähler unter dem Textfeld', async () => {
    render(<Free card={freeCard('f1')} onAnswer={vi.fn()} />)
    expect(screen.getByText('0 Zeichen')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox'), 'Osmose')
    expect(screen.getByText('6 Zeichen')).toBeInTheDocument()
  })

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
    expect(onAnswer).toHaveBeenCalledWith('partial', { kind: 'free', text: 'Wasser geht durch Membran' }, null)
  })
})
