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
})
