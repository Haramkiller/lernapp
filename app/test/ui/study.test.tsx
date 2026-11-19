// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../src/data/db'
import { StudyScreen } from '../../src/ui/StudyScreen'
import { seededRng } from '../../src/ui/random'
import { choiceCard } from './fixtures'
import { newDoneKey } from '../../src/session/queue'
import { newSrsState, review } from '../../src/srs/scheduler'

const NOW = new Date('2026-03-10T10:00:00.000Z')

beforeEach(async () => {
  await Promise.all([db.cards.clear(), db.states.clear(), db.outbox.clear(), db.meta.clear(), db.modules.clear(), db.topics.clear()])
})

describe('StudyScreen', () => {
  it('speichert jede Antwort und endet nach 25 Karten mit Zusammenfassung', async () => {
    await db.meta.put({ key: 'settings', value: { retention: 0.9, newPerDay: 40 } })
    await db.cards.bulkPut(Array.from({ length: 30 }, (_, i) => choiceCard(`c${String(i).padStart(2, '0')}`)))
    const onFinished = vi.fn()
    render(<StudyScreen now={() => NOW} rng={seededRng(1)} onFinished={onFinished} onExit={vi.fn()} />)

    for (let i = 0; i < 25; i++) {
      const right = i % 5 !== 4 // 20 richtig, 5 falsch
      await userEvent.click(await screen.findByRole('button', { name: right ? /Richtig B/ : /Falsch A/ }))
      expect(await db.states.count()).toBe(i + 1)
      await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    }
    expect(await screen.findByText(/20 richtig/)).toBeInTheDocument()
    expect(screen.getByText(/5 falsch/)).toBeInTheDocument()
    expect(screen.getByText(/Pause/)).toBeInTheDocument()
    expect(await db.states.count()).toBe(25)
    expect(await db.outbox.count()).toBe(50)
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('zeigt bei leerer Warteschlange einen Hinweis', async () => {
    render(<StudyScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    expect(await screen.findByText(/Nichts zu lernen/)).toBeInTheDocument()
  })

  it('berechnet den neuen State aus dem aktuellen DB-Stand, nicht aus dem Stand beim Öffnen', async () => {
    await db.cards.bulkPut([choiceCard('a')])
    render(<StudyScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    const option = await screen.findByRole('button', { name: /Richtig B/ })
    // Ein Sync zieht währenddessen einen neueren State (eine Wiederholung auf einem anderen Gerät).
    const earlier = new Date(NOW.getTime() - 60 * 60_000)
    const pulled = review(newSrsState(earlier), 3, earlier, { cardId: 'a' }).state
    await db.states.put({ cardId: 'a', state: pulled, updatedAt: earlier.toISOString() })
    await userEvent.click(option)
    await screen.findByRole('button', { name: 'Weiter' })
    const saved = (await db.states.get('a'))!
    expect(saved.state.reps).toBe(pulled.reps + 1)
    expect(saved.state).toEqual(review(pulled, 3, NOW, { cardId: 'a' }).state)
    // Die Karte war beim Speichern nicht mehr neu: kein Zähler für neue Karten.
    expect(await db.meta.get(newDoneKey(NOW))).toBeUndefined()
  })

  it('prüft nur Karten im gewählten Modul', async () => {
    await db.cards.bulkPut([choiceCard('a'), choiceCard('b', { moduleId: 'm2' })])
    const validate = vi.fn((_c: { id: string }) => true)
    render(<StudyScreen moduleId="m1" now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} validate={validate} />)
    await screen.findByRole('button', { name: /Richtig B/ })
    expect(validate.mock.calls.map(([c]) => c.id)).not.toContain('b')
  })

  it('Nachfragen-Dialog gehört zur Karte: weg bei Weiter und beim Beenden', async () => {
    await db.cards.bulkPut([choiceCard('c1'), choiceCard('c2')])
    const renderAsk = (card: { id: string }) => <p>Dialog für {card.id}</p>
    render(<StudyScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} renderAsk={renderAsk} />)
    await userEvent.click(await screen.findByRole('button', { name: /Richtig B/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Nachfragen' }))
    expect(screen.getByText(/Dialog für c/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(screen.queryByText(/Dialog für/)).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: /Richtig B/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Nachfragen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Beenden' }))
    expect(screen.queryByText(/Dialog für/)).not.toBeInTheDocument()
  })
})
