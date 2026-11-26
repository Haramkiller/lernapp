// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { State } from 'ts-fsrs'
import { db } from '../../src/data/db'
import { BattleScreen } from '../../src/ui/BattleScreen'
import { choiceCard } from './fixtures'
import { newSrsState, review, type SrsState } from '../../src/srs/scheduler'

const NOW = new Date('2026-03-10T10:00:00.000Z')
const DAY = 86_400_000
const NO_LUCK = () => 0.99

const typedCard = () => {
  const c = choiceCard('t')
  return { ...c, payload: { ...c.payload, typed: { answers: ['Mitochondrien'] } } }
}
const dueState = (stability: number): SrsState => {
  const past = new Date(NOW.getTime() - 40 * DAY)
  return {
    ...review(newSrsState(past), 4, past, { cardId: 't' }).state,
    state: State.Review,
    stability,
    last_review: new Date(NOW.getTime() - 31 * DAY).toISOString(),
    due: new Date(NOW.getTime() - DAY).toISOString(),
  }
}

async function setup(stability: number) {
  await db.cards.put(typedCard())
  const state = dueState(stability)
  await db.states.put({ cardId: 't', state, updatedAt: state.last_review! })
  render(<BattleScreen now={() => NOW} rng={NO_LUCK} onExit={vi.fn()} />)
  return state
}
const field = () => screen.findByRole('textbox', { name: 'Deine Antwort' })

beforeEach(async () => {
  await Promise.all([db.cards.clear(), db.states.clear(), db.outbox.clear(), db.meta.clear(), db.modules.clear(), db.topics.clear(), db.game.clear()])
})

describe('Eintippen im Kampf', () => {
  it('sichere Karte wird eingetippt und gespeichert', async () => {
    const before = await setup(30)
    await userEvent.type(await field(), 'Mitochondrien')
    await userEvent.click(screen.getByRole('button', { name: 'Sicher' }))
    expect(await screen.findByText('Richtig!')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Richtig B/ })).not.toBeInTheDocument()
    await vi.waitFor(async () => expect((await db.states.get('t'))!.state.reps).toBe(before.reps + 1))
  })

  it('wenig stabile Karte bleibt Auswahl', async () => {
    await setup(2)
    expect(await screen.findByRole('button', { name: /Richtig B/ })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Deine Antwort' })).not.toBeInTheDocument()
  })

  it('falsche Eingabe speichert nichts, auch nicht beim Beenden', async () => {
    const before = await setup(30)
    const outbox = await db.outbox.count()
    await userEvent.type(await field(), 'Ribosomen')
    await userEvent.click(screen.getByRole('button', { name: 'Sicher' }))
    expect(await screen.findByText('Lösung: Mitochondrien')).toBeInTheDocument()
    expect(await db.outbox.count()).toBe(outbox)
    expect((await db.states.get('t'))!.state).toEqual(before)
    await userEvent.click(screen.getByRole('button', { name: 'Beenden' }))
    expect(await screen.findByText(/0 richtig, 0 teilweise, 0 falsch/)).toBeInTheDocument()
    expect((await db.states.get('t'))!.state).toEqual(before)
  })

  it('„Doch richtig“ speichert als richtig', async () => {
    const before = await setup(30)
    await userEvent.type(await field(), 'Ribosomen')
    await userEvent.click(screen.getByRole('button', { name: 'Sicher' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Doch richtig' }))
    expect(await screen.findByText('Richtig!')).toBeInTheDocument()
    await vi.waitFor(async () => expect((await db.states.get('t'))!.state.reps).toBe(before.reps + 1))
  })
})
