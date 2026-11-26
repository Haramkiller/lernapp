// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../src/data/db'
import { loadDesign, loadFinds, markOpened, saveFind } from '../../src/data/finds'
import { itemById, type Find } from '../../src/game/finds'
import { GreenhouseScreen } from '../../src/ui/GreenhouseScreen'
import { choiceCard } from './fixtures'

const NOW = new Date('2026-03-10T10:00:00.000Z')
const iso = NOW.toISOString()
let n = 0

/** Geöffneter Fund; `researched` = erforscht und schon gemeldet. */
async function found(item: string, researched: boolean, over: Partial<Find> = {}) {
  const it = itemById(item)!
  const id = `f${n++}`
  await saveFind({ id, item, rarity: it.rarity, region: it.region, cardId: 'x', topicId: 't1', moduleId: 'm1', foundAt: `2026-03-0${(n % 9) + 1}T10:00:00.000Z`, foundDay: '2026-03-01', ...over })
  await markOpened([id], NOW)
  if (researched) {
    await db.game.put({ id: `researched:${id}`, data: { at: iso }, updatedAt: iso })
    await db.game.put({ id: `told:${id}`, data: { at: iso }, updatedAt: iso })
  }
  return id
}

const props = { now: () => NOW, sync: { kind: 'idle' as const }, onCamp: vi.fn(), onSettings: vi.fn() }
const open = (over: Partial<Parameters<typeof GreenhouseScreen>[0]> = {}) => render(<GreenhouseScreen {...props} {...over} />)
const picker = () => screen.getByRole('dialog', { name: 'Stück wählen' })

beforeEach(async () => {
  n = 0
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.modules.put({ id: 'm1', name: 'Botanik', examDate: null, styleProfile: null, updatedAt: iso })
  await db.topics.put({ id: 't1', moduleId: 'm1', name: 'Mitose', updatedAt: iso })
  await db.cards.put(choiceCard('a', { moduleId: 'm1', topicId: 't1' }))
})

describe('Gewächshaus gestalten', () => {
  it('Platz wählen zeigt nur erforschte, passende Stücke und stellt sie auf', async () => {
    await found('moosstein', true)
    await found('waldteich', true)
    await found('farn', false)
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Gestalten' }))
    await userEvent.click(screen.getByRole('button', { name: 'Platz gang-links: leer' }))
    expect(within(picker()).getByRole('button', { name: 'Moosstein' })).toBeInTheDocument()
    expect(within(picker()).queryByRole('button', { name: 'Waldteich' })).toBeNull()
    expect(within(picker()).queryByRole('button', { name: 'Farnbüschel' })).toBeNull()
    await userEvent.click(within(picker()).getByRole('button', { name: 'Moosstein' }))
    expect(await screen.findByRole('img', { name: 'Moosstein' })).toBeInTheDocument()
    expect((await loadDesign()).placements.get('gang-links')).toBe('moosstein')
  })

  it('großer Platz bietet auch legendäre Stücke an; „Leer“ räumt ab', async () => {
    await found('waldteich', true)
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Gestalten' }))
    await userEvent.click(screen.getByRole('button', { name: 'Platz gang-mitte: leer' }))
    await userEvent.click(within(picker()).getByRole('button', { name: 'Waldteich' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Platz gang-mitte: Waldteich' }))
    await userEvent.click(within(picker()).getByRole('button', { name: 'Leer' }))
    expect(await screen.findByRole('button', { name: 'Platz gang-mitte: leer' })).toBeInTheDocument()
    expect((await loadDesign()).placements.has('gang-mitte')).toBe(false)
  })

  it('außerhalb des Gestalten-Modus keine Platz-Markierungen, Deko trotzdem sichtbar', async () => {
    await found('moosstein', true)
    await db.game.put({ id: 'place:gang-links', data: { item: 'moosstein' }, updatedAt: iso })
    open()
    expect(await screen.findByRole('img', { name: 'Moosstein' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Platz / })).toBeNull()
  })

  it('Erde verbessern über das Beet-Schild', async () => {
    await found('moosstein', true)
    await found('moosstein', true)
    await found('moosstein', true)
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Gestalten' }))
    await userEvent.click(screen.getByRole('button', { name: 'Erde von Botanik verbessern' }))
    expect(screen.getByText('Erde: Stufe 0/3 · Dünger: 2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Verbessern (2 Dünger)' }))
    expect(await screen.findByText('Erde: Stufe 1/3 · Dünger: 0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verbessern (4 Dünger)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mitose' })).toHaveClass('soil-1')
  })

  it('meldet erforschte Funde genau einmal', async () => {
    for (const item of ['moosstein', 'farn']) {
      const id = await found(item, false)
      await db.game.put({ id: `researched:${id}`, data: { at: iso }, updatedAt: iso })
    }
    const view = open({ refreshKey: 0 })
    expect(await screen.findByText('2 Funde erforscht!')).toBeInTheDocument()
    await vi.waitFor(async () => expect((await loadFinds()).every((f) => f.told)).toBe(true))
    view.rerender(<GreenhouseScreen {...props} refreshKey={1} />)
    await vi.waitFor(() => expect(screen.queryByText('2 Funde erforscht!')).toBeNull())
  })

  it('Knopf „Sammelbuch“ ruft onCollection', async () => {
    const onCollection = vi.fn()
    open({ onCollection })
    await userEvent.click(await screen.findByRole('button', { name: 'Sammelbuch' }))
    expect(onCollection).toHaveBeenCalled()
  })

  it('Farbschicht nach Uhrzeit, nachts Glühwürmchen', async () => {
    const night = open({ now: () => new Date(2026, 2, 10, 22) })
    await screen.findByRole('button', { name: 'Gestalten' })
    expect(document.querySelector('.daylight.phase-nacht')).not.toBeNull()
    expect(document.querySelector('.scene')).toHaveClass('night')
    expect(document.querySelectorAll('.firefly').length).toBeGreaterThan(0)
    night.unmount()
    open({ now: () => new Date(2026, 2, 10, 12) })
    await screen.findByRole('button', { name: 'Gestalten' })
    expect(document.querySelector('.daylight.phase-tag')).not.toBeNull()
    expect(document.querySelector('.scene')).not.toHaveClass('night')
    expect(document.querySelectorAll('.firefly')).toHaveLength(0)
  })
})
