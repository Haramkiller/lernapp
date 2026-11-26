// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { studyDay } from '@lernapp/shared'
import { db } from '../../src/data/db'
import { loadFinds, saveFind } from '../../src/data/finds'
import { saveAreaChoice } from '../../src/data/game'
import { newSrsState, review } from '../../src/srs/scheduler'
import { BattleScreen } from '../../src/ui/BattleScreen'
import { seededRng } from '../../src/ui/random'
import { choiceCard, pick } from './fixtures'

const NOW = new Date('2026-03-10T10:00:00.000Z')
const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${String(i).padStart(2, '0')}`)

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

describe('Funde im Kampf', () => {
  it('dritte richtige Antwort (heute erstmals) bringt einen Fund und den Blitz', async () => {
    await db.cards.bulkPut(ids(4).map((id) => choiceCard(id)))
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    await answerRight(2)
    expect(screen.queryByText('✨ Fund!')).toBeNull()
    await pick(await screen.findByRole('button', { name: /Richtig B/ }))
    expect(await screen.findByText('✨ Fund!')).toBeInTheDocument()
    const finds = await loadFinds()
    expect(finds).toHaveLength(1)
    expect(finds[0]).toMatchObject({ moduleId: 'm1', topicId: 't1', foundDay: studyDay(NOW), opened: false })
  })

  it('Karten, die heute schon beantwortet wurden, bringen keinen Fund', async () => {
    await db.cards.bulkPut(ids(4).map((id) => choiceCard(id)))
    const earlier = new Date(NOW.getTime() - 60 * 60_000)
    for (const id of ids(4)) {
      const state = { ...review(newSrsState(earlier), 1, earlier, { cardId: id }).state, due: new Date(NOW.getTime() - 60_000).toISOString() }
      await db.states.put({ cardId: id, state, updatedAt: earlier.toISOString() })
    }
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    await answerRight(4)
    expect(await loadFinds()).toHaveLength(0)
  })

  it('ausgeruht: zweiter Fund bei der vierten zählenden Antwort', async () => {
    await db.cards.bulkPut(ids(5).map((id) => choiceCard(id)))
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} rested onExit={vi.fn()} />)
    await answerRight(3)
    expect(await loadFinds()).toHaveLength(1)
    await answerRight(1)
    expect(await loadFinds()).toHaveLength(2)
  })

  it('nie mehr als 3 Funde pro Kampf', async () => {
    await db.cards.bulkPut(ids(10).map((id) => choiceCard(id)))
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} rested onExit={vi.fn()} />)
    await answerRight(9)
    await pick(await screen.findByRole('button', { name: /Richtig B/ }))
    await screen.findByRole('button', { name: 'Weiter' })
    expect(await loadFinds()).toHaveLength(3)
  })

  it('Region kommt vom Modul der Karte (Kampf über alle Module)', async () => {
    await db.modules.put({ id: 'm1', name: 'Bio', examDate: null, styleProfile: null, updatedAt: NOW.toISOString() })
    await saveAreaChoice('m1', 'aschephoenix', NOW)
    await db.cards.bulkPut(ids(3).map((id) => choiceCard(id)))
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    await answerRight(2)
    await pick(await screen.findByRole('button', { name: /Richtig B/ }))
    await screen.findByText('✨ Fund!')
    expect((await loadFinds())[0]!.region).toBe('vulkan')
  })

  it('richtige Antwort an einem späteren Lerntag erforscht den Fund der Karte', async () => {
    await saveFind({ id: 'f', item: 'farn', rarity: 'common', region: 'wald', cardId: 'a', topicId: 't1', moduleId: 'm1', foundAt: '2026-03-09T10:00:00.000Z', foundDay: '2026-03-09' })
    await db.cards.bulkPut([choiceCard('a')])
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    await pick(await screen.findByRole('button', { name: /Richtig B/ }))
    await vi.waitFor(async () => expect((await loadFinds())[0]!.researchedAt).not.toBeNull())
  })

  it('Fehler beim Speichern eines Funds hält den Kampf nicht auf', async () => {
    await db.cards.bulkPut(ids(4).map((id) => choiceCard(id)))
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    await answerRight(2)
    const put = vi.spyOn(db.game, 'put').mockRejectedValueOnce(new Error('voll'))
    await pick(await screen.findByRole('button', { name: /Richtig B/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Weiter' }))
    expect(await screen.findByRole('button', { name: /Richtig B/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('✨ Fund!')).toBeNull()
    put.mockRestore()
  })
})
