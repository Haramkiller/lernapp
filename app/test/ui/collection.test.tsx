// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { State } from 'ts-fsrs'
import { db } from '../../src/data/db'
import { loadFinds, saveFind } from '../../src/data/finds'
import type { Find } from '../../src/game/finds'
import { newSrsState, type SrsState } from '../../src/srs/scheduler'
import { CollectionScreen } from '../../src/ui/CollectionScreen'
import { choiceCard } from './fixtures'

const NOW = new Date(2026, 2, 10, 10)
const DAY = 86_400_000

const find = (over: Partial<Find> = {}): Find => ({
  id: 'f',
  item: 'moosstein',
  rarity: 'common',
  region: 'wald',
  cardId: 'a',
  topicId: 't1',
  moduleId: 'm1',
  foundAt: '2026-03-10T09:00:00.000Z',
  foundDay: '2026-03-10',
  ...over,
})

const state = (over: Partial<SrsState>): SrsState => ({ ...newSrsState(NOW), ...over })

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.modules.put({ id: 'm1', name: 'Bio', examDate: null, styleProfile: null, updatedAt: NOW.toISOString() })
})

describe('Sammelbuch', () => {
  it('zeigt Dünger, Regionen mit Zählern und Silhouetten', async () => {
    await saveFind(find({ id: 'a' }))
    await saveFind(find({ id: 'b', foundAt: '2026-03-10T11:00:00.000Z' }))
    render(<CollectionScreen now={() => NOW} onBack={vi.fn()} />)
    expect(await screen.findByText('Dünger: 1')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Wald 1/6' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Vulkan 0/6' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('Unbekanntes Stück')).toHaveLength(35)
  })

  it('unerforschte Funde oben mit Hinweis auf ihre Karte', async () => {
    await db.cards.put(choiceCard('a'))
    await db.states.put({ cardId: 'a', state: state({ state: State.Learning, last_review: NOW.toISOString(), due: new Date(NOW.getTime() + 3 * DAY).toISOString() }), updatedAt: NOW.toISOString() })
    await saveFind(find())
    render(<CollectionScreen now={() => NOW} onBack={vi.fn()} />)
    const section = await screen.findByRole('region', { name: 'Wird erforscht' })
    expect(within(section).getByText('Moosstein')).toBeInTheDocument()
    expect(within(section).getByText('erforscht, wenn du ‚Frage a?‘ in 3 Tagen wieder weißt')).toBeInTheDocument()
  })

  it('prüft beim Öffnen die Forschung', async () => {
    await db.cards.put(choiceCard('a'))
    const at = new Date(2026, 2, 10, 5)
    await db.states.put({ cardId: 'a', state: state({ state: State.Review, stability: 20, last_review: at.toISOString(), due: new Date(at.getTime() + 20 * DAY).toISOString() }), updatedAt: at.toISOString() })
    await saveFind(find({ foundAt: '2026-03-09T09:00:00.000Z', foundDay: '2026-03-09' }))
    render(<CollectionScreen now={() => NOW} onBack={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: 'Wald 1/6' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Wird erforscht' })).toBeNull()
    expect((await loadFinds())[0]!.researchedAt).not.toBeNull()
  })
})
