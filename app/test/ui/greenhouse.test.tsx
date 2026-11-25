// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../src/data/db'
import { recordMilestones } from '../../src/data/game'
import { GreenhouseScreen } from '../../src/ui/GreenhouseScreen'
import { newSrsState, review, type SrsState } from '../../src/srs/scheduler'
import { choiceCard } from './fixtures'

const NOW = new Date('2026-03-10T10:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const iso = NOW.toISOString()
const secure = (id: string): SrsState => ({
  ...review(newSrsState(NOW), 4, NOW, { cardId: id }).state,
  stability: 30,
  last_review: new Date(NOW.getTime() - DAY).toISOString(),
  due: new Date(NOW.getTime() + 20 * DAY).toISOString(),
})
/** Gelernt, aber lange nicht gesehen: nicht mehr sicher. */
const faded = (id: string): SrsState => ({ ...secure(id), last_review: new Date(NOW.getTime() - 200 * DAY).toISOString() })

async function mod(id: string, name: string) {
  await db.modules.put({ id, name, examDate: null, styleProfile: null, updatedAt: iso })
}
async function topic(id: string, moduleId: string, name: string, cards: [string, SrsState | null][]) {
  await db.topics.put({ id, moduleId, name, updatedAt: iso })
  await db.cards.bulkPut(cards.map(([c]) => choiceCard(c, { moduleId, topicId: id })))
  await db.states.bulkPut(cards.filter(([, s]) => s).map(([c, s]) => ({ cardId: c, state: s!, updatedAt: iso })))
}

async function botanik() {
  await mod('m1', 'Botanik')
  await topic('t1', 'm1', 'Chloroplasten', [['a', secure('a')], ['b', secure('b')]])
  await topic('t2', 'm1', 'Mitose', [['c', faded('c')], ['d', faded('d')], ['e', faded('e')]])
  await topic('t3', 'm1', 'Zellatmung', [['f', null]])
}

const open = (over: Partial<Parameters<typeof GreenhouseScreen>[0]> = {}) => {
  const props = { now: () => NOW, sync: { kind: 'idle' as const }, onCamp: vi.fn(), onSettings: vi.fn(), ...over }
  const view = render(<GreenhouseScreen {...props} />)
  return { ...props, ...view }
}
const btn = (name: string) => screen.findByRole('button', { name })

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('GreenhouseScreen', () => {
  it('Rundgang: Eingang → Tür → Lagerfeuer, Umdrehen → Blick zurück', async () => {
    await botanik()
    const { onCamp } = open()
    expect(await screen.findByText('Eingang')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '↓ Umdrehen' })).toBeDisabled()
    await userEvent.click(await btn('↑ Vorwärts'))
    expect(await screen.findByText('An der Tür')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '↶ Links' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '↓ Umdrehen' }))
    expect(await screen.findByText('Blick zurück')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '↑ Vorwärts' }))
    await userEvent.click(await btn('↑ Vorwärts'))
    await userEvent.click(await btn('↑ Zum Lagerfeuer'))
    expect(onCamp).toHaveBeenCalled()
  })

  it('Pflanze antippen zeigt das Schild: sitzt sicher, welkt, Saat', async () => {
    await botanik()
    await recordMilestones({ topics: ['t2'], modules: [] }, NOW)
    open()
    await userEvent.click(await btn('Chloroplasten'))
    expect(screen.getByRole('status')).toHaveTextContent('Chloroplasten · Botanik · sitzt sicher · 2 Karten')
    await userEvent.click(screen.getByRole('button', { name: 'Mitose' }))
    expect(screen.getByRole('status')).toHaveTextContent('Mitose · Botanik · welkt · 3 Karten fällig')
    await userEvent.click(screen.getByRole('button', { name: 'Zellatmung' }))
    expect(screen.getByRole('status')).toHaveTextContent('Zellatmung · Botanik · Saat · noch nichts gelernt')
  })

  it('wachsende Pflanze: „wächst · x von y sicher“', async () => {
    await mod('m1', 'Botanik')
    await topic('t1', 'm1', 'Osmose', [['a', secure('a')], ['b', faded('b')]])
    open()
    await userEvent.click(await btn('Osmose'))
    expect(screen.getByRole('status')).toHaveTextContent('Osmose · Botanik · wächst · 1 von 2 sicher')
  })

  it('Öffnen schreibt den Meilenstein eines frisch sicheren Themas genau einmal', async () => {
    await botanik()
    const first = open()
    await btn('Chloroplasten')
    expect(await db.outbox.count()).toBe(1)
    expect((await db.game.get('topic:t1'))?.data.securedAt).toBe(iso)
    first.unmount()
    open()
    await btn('Chloroplasten')
    expect(await db.outbox.count()).toBe(1)
  })

  it('3 Module: linke Nahansicht zeigt Beet 1, „Beet ›“ blättert zu Beet 3', async () => {
    for (const [m, name, t] of [['m1', 'Anatomie', 'Knochen'], ['m2', 'Botanik', 'Blatt'], ['m3', 'Chemie', 'Säuren']]) {
      await mod(m!, name!)
      await topic(`t-${m}`, m!, t!, [[`c-${m}`, null]])
    }
    open()
    await userEvent.click(await btn('↶ Links'))
    expect(await screen.findByText('Beet links')).toBeInTheDocument()
    expect(screen.getByText('Anatomie')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Knochen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Blatt' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Beet ›' }))
    expect(screen.getByText('Chemie')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Säuren' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '↓ Umdrehen' }))
    await userEvent.click(await btn('Rechts ↷'))
    expect(await screen.findByText('Beet rechts')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Blatt' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Beet ›' })).not.toBeInTheDocument()
  })

  it('Insekten: keine ohne Blüte, welche bei vier blühenden Themen', async () => {
    await mod('m1', 'Botanik')
    await topic('t0', 'm1', 'Leer', [['z', null]])
    const a = open()
    await btn('Leer')
    expect(a.container.querySelectorAll('.insect')).toHaveLength(0)
    a.unmount()
    for (const i of [1, 2, 3, 4]) await topic(`t${i}`, 'm1', `Thema ${i}`, [[`c${i}`, secure(`c${i}`)]])
    const b = open()
    await btn('Thema 1')
    expect(b.container.querySelectorAll('.insect').length).toBeGreaterThan(0)
  })

  it('ohne Module: Hinweis auf die Werkstatt', async () => {
    open()
    expect(await screen.findByText('Noch keine Beete – erstelle Karten in der Werkstatt')).toBeInTheDocument()
  })

  it('Menü: Einstellungen', async () => {
    const { onSettings } = open()
    await userEvent.click(await btn('Menü'))
    await userEvent.click(screen.getByRole('button', { name: 'Einstellungen' }))
    expect(onSettings).toHaveBeenCalled()
  })
})
