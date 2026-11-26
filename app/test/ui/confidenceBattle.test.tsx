// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, type LogEntry } from '../../src/data/db'
import { BattleScreen } from '../../src/ui/BattleScreen'
import { choiceCard, freeCard } from './fixtures'

const NOW = new Date('2026-03-10T10:00:00.000Z')
const NO_LUCK = () => 0.99
const logs = async () => (await db.outbox.toArray()).filter((e) => e.kind === 'log').map((e) => e.payload as LogEntry)

beforeEach(async () => {
  await Promise.all([db.cards.clear(), db.states.clear(), db.outbox.clear(), db.meta.clear(), db.modules.clear(), db.topics.clear(), db.game.clear()])
})

const start = () => render(<BattleScreen now={() => NOW} rng={NO_LUCK} onExit={vi.fn()} />)
async function answer(option: RegExp, conf: 'Sicher' | 'Unsicher') {
  await userEvent.click(await screen.findByRole('button', { name: option }))
  await userEvent.click(screen.getByRole('button', { name: conf }))
}

describe('Einschätzung im Kampf', () => {
  it('richtig + unsicher → Schwer, Einschätzung im Log, Hinweis', async () => {
    await db.cards.put(choiceCard('a'))
    start()
    await answer(/Richtig B/, 'Unsicher')
    expect(await screen.findByText(/Richtig, aber unsicher/)).toBeInTheDocument()
    await vi.waitFor(async () => expect(await logs()).toHaveLength(1))
    expect((await logs())[0]).toMatchObject({ rating: 2, confidence: 'unsure', outcome: 'right' })
  })

  it('richtig + sicher → Gut', async () => {
    await db.cards.put(choiceCard('a'))
    start()
    await answer(/Richtig B/, 'Sicher')
    await vi.waitFor(async () => expect(await logs()).toHaveLength(1))
    expect((await logs())[0]).toMatchObject({ rating: 3, confidence: 'sure', outcome: 'right' })
    expect(screen.queryByText(/Richtig, aber unsicher/)).not.toBeInTheDocument()
  })

  it('freie Antwort: Log ohne Einschätzung', async () => {
    await db.cards.put(freeCard('f'))
    start()
    await userEvent.click(await screen.findByRole('button', { name: 'Lösung zeigen' }))
    await userEvent.click(screen.getByRole('button', { name: /Gewusst/ }))
    await vi.waitFor(async () => expect(await logs()).toHaveLength(1))
    expect('confidence' in (await logs())[0]!).toBe(false)
  })

  it('Ergebnis zeigt die Treffsicherheit', async () => {
    await db.cards.bulkPut([choiceCard('a'), choiceCard('b')])
    start()
    await answer(/Richtig B/, 'Sicher')
    expect(await screen.findByText(/Du warst dir sicher/, {}, { timeout: 100 }).catch(() => null)).toBeNull()
    await userEvent.click(await screen.findByRole('button', { name: 'Weiter' }))
    await answer(/Falsch A/, 'Sicher')
    expect(await screen.findByText(/Du warst dir sicher – genau diese Stelle merken/)).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Weiter' }))
    expect(await screen.findByText('Sicher: 1 von 2 richtig')).toBeInTheDocument()
    expect(screen.queryByText(/^Unsicher:/)).not.toBeInTheDocument()
  })
})
