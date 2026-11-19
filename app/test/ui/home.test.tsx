// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../../src/data/db'
import { HomeScreen } from '../../src/ui/HomeScreen'
import { newSrsState, review } from '../../src/srs/scheduler'
import { choiceCard } from './fixtures'

const NOW = new Date('2026-03-10T10:00:00.000Z')

beforeEach(async () => {
  await Promise.all([db.cards.clear(), db.states.clear(), db.meta.clear(), db.modules.clear(), db.dead.clear()])
})

describe('HomeScreen', () => {
  it('zeigt fällige und neue Karten und den Modulfortschritt', async () => {
    await db.meta.put({ key: 'settings', value: { retention: 0.9, newPerDay: 2 } })
    await db.modules.put({ id: 'm1', name: 'Botanik', examDate: null, styleProfile: null, updatedAt: NOW.toISOString() })
    await db.cards.bulkPut([choiceCard('a'), choiceCard('b'), choiceCard('c'), choiceCard('d'), choiceCard('gone', { deleted: true })])
    // a: gerade gelernt (gemeistert, nicht fällig); b: vor langer Zeit gelernt → fällig, recall niedrig
    const learned = review(newSrsState(NOW), 3, NOW, { cardId: 'a' })
    const longAgo = new Date('2026-01-01T10:00:00.000Z')
    const old = review(newSrsState(longAgo), 3, longAgo, { cardId: 'b' })
    await db.states.bulkPut([
      { cardId: 'a', state: learned.state, updatedAt: NOW.toISOString() },
      { cardId: 'b', state: old.state, updatedAt: NOW.toISOString() },
    ])
    render(<HomeScreen now={() => NOW} sync={{ kind: 'idle' }} onStudy={vi.fn()} onSettings={vi.fn()} />)
    expect(await screen.findByText('Heute fällig: 1 · Neu: 2')).toBeInTheDocument()
    expect(screen.getByText('Botanik')).toBeInTheDocument()
    expect(screen.getByText('25 %')).toBeInTheDocument() // 1 von 4 nicht gelöschten Karten
  })

  it('zeigt Sync-Fehler und Quarantäne-Warnung', async () => {
    await db.dead.add({ kind: 'log', payload: {} as never, error: 'x' })
    render(<HomeScreen now={() => NOW} sync={{ kind: 'error', message: 'Netzwerk kaputt' }} onStudy={vi.fn()} onSettings={vi.fn()} />)
    expect(await screen.findByText('1 Einträge konnten nicht synchronisiert werden')).toBeInTheDocument()
    expect(screen.getByText(/Netzwerk kaputt/)).toBeInTheDocument()
  })
})
