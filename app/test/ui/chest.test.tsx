// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../src/data/db'
import { loadFinds, saveFind } from '../../src/data/finds'
import { itemById, type FindStatus } from '../../src/game/finds'
import { BattleScreen } from '../../src/ui/BattleScreen'
import { Chest, rarest, type ChestItem } from '../../src/ui/game/Chest'
import { seededRng } from '../../src/ui/random'
import { choiceCard, pick } from './fixtures'

const NOW = new Date('2026-03-10T10:00:00.000Z')

const item = (id: string, duplicate: boolean): ChestItem => {
  const it = itemById(id)!
  const find: FindStatus = {
    id: `f-${id}-${duplicate}`,
    item: id,
    rarity: it.rarity,
    region: it.region,
    cardId: 'c',
    topicId: 't1',
    moduleId: 'm1',
    foundAt: NOW.toISOString(),
    foundDay: '2026-03-10',
    opened: false,
    researchedAt: null,
    told: false,
  }
  return { find, item: it, duplicate }
}

async function answerRight(n: number) {
  for (let i = 0; i < n; i++) {
    await pick(await screen.findByRole('button', { name: /Richtig B/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Weiter' }))
  }
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.meta.put({ key: 'settings', value: { retention: 0.9, newPerDay: 40 } })
})

describe('Truhe', () => {
  it('Truhe leuchtet in der Farbe des seltensten Funds und zeigt die Funde nacheinander', async () => {
    const onDone = vi.fn()
    render(<Chest items={[item('moosstein', false), item('waldteich', false)]} onDone={onDone} />)
    expect(screen.getByRole('heading', { name: 'Eine Truhe!' })).toBeInTheDocument()
    expect(document.querySelector('.chest .glow')).toHaveClass('rarity-legendary')
    await userEvent.click(screen.getByRole('button', { name: 'Truhe öffnen' }))
    expect(screen.getByText('Moosstein')).toBeInTheDocument()
    expect(screen.queryByText('Waldteich')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Fund' }))
    expect(screen.getByText('Waldteich')).toBeInTheDocument()
    expect(screen.getByText('Legendär')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Zum Ergebnis' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('Überspringen zeigt alles auf einmal; doppelt → +1 Dünger', async () => {
    render(<Chest items={[item('moosstein', true), item('farn', false)]} onDone={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Überspringen' }))
    expect(screen.getByText('Moosstein')).toBeInTheDocument()
    expect(screen.getByText('Farnbüschel')).toBeInTheDocument()
    expect(screen.getByText('doppelt → +1 Dünger')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zum Ergebnis' })).toBeInTheDocument()
  })

  it('rarest', () => {
    expect(rarest(['common', 'rare'])).toBe('rare')
    expect(rarest(['common'])).toBe('common')
    expect(rarest(['legendary', 'common'])).toBe('legendary')
  })

  it('BattleScreen: Truhe vor dem Ergebnis, danach Funde als geöffnet gespeichert', async () => {
    await db.cards.bulkPut(['a', 'b', 'c'].map((id) => choiceCard(id)))
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    await answerRight(3)
    expect(await screen.findByRole('heading', { name: 'Eine Truhe!' })).toBeInTheDocument()
    expect(screen.queryByText(/3 richtig/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Überspringen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Zum Ergebnis' }))
    expect(await screen.findByText(/3 richtig, /)).toBeInTheDocument()
    await vi.waitFor(async () => expect((await loadFinds()).every((f) => f.opened)).toBe(true))
    expect(await loadFinds()).toHaveLength(1)
  })

  it('BattleScreen: ungeöffneter Fund aus einem abgebrochenen Kampf erscheint in der nächsten Truhe', async () => {
    await saveFind({ id: 'alt', item: 'eulenstatue', rarity: 'rare', region: 'wald', cardId: 'x', topicId: 't1', moduleId: 'm1', foundAt: '2026-03-10T08:00:00.000Z', foundDay: '2026-03-10' })
    await db.cards.bulkPut([choiceCard('a')])
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    await answerRight(1)
    expect(await screen.findByRole('heading', { name: 'Eine Truhe!' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Truhe öffnen' }))
    expect(screen.getByText('Eulenstatue')).toBeInTheDocument()
  })

  it('BattleScreen: ohne Funde direkt das Ergebnis', async () => {
    await db.cards.bulkPut([choiceCard('a')])
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    await answerRight(1)
    expect(await screen.findByText(/1 richtig, /)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Eine Truhe!' })).toBeNull()
  })
})
