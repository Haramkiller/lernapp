// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../src/data/db'
import { saveAreaChoice, saveLastBattleAt } from '../../src/data/game'
import { CampScreen } from '../../src/ui/CampScreen'
import { newSrsState, review, type SrsState } from '../../src/srs/scheduler'
import { choiceCard } from './fixtures'

const NOW = new Date('2026-03-10T10:00:00.000Z')
const YESTERDAY = new Date(NOW.getTime() - 24 * 60 * 60 * 1000)
const iso = NOW.toISOString()

async function botanik() {
  await db.modules.put({ id: 'm1', name: 'Botanik', examDate: null, styleProfile: null, updatedAt: iso })
  await db.topics.bulkPut([
    { id: 't1', moduleId: 'm1', name: 'Zelle', updatedAt: iso },
    { id: 't2', moduleId: 'm1', name: 'Blatt', updatedAt: iso },
  ])
  await saveAreaChoice('m1', 'moosgolem', NOW)
}

async function work() {
  await db.cards.bulkPut([
    ...['n1', 'n2', 'n3', 'd1', 'd2'].map((id) => choiceCard(id, { topicId: 't1' })),
    choiceCard('s1', { topicId: 't2' }),
  ])
  const due = (id: string) => ({ cardId: id, state: review(newSrsState(YESTERDAY), 1, YESTERDAY, { cardId: id }).state, updatedAt: iso })
  const secure: SrsState = { ...review(newSrsState(NOW), 4, NOW, { cardId: 's1' }).state, stability: 30, last_review: YESTERDAY.toISOString(), due: new Date(NOW.getTime() + 20 * 86400000).toISOString() }
  await db.states.bulkPut([due('d1'), due('d2'), { cardId: 's1', state: secure, updatedAt: iso }])
}

const camp = (over: Partial<Parameters<typeof CampScreen>[0]> = {}) => {
  const props = { now: () => NOW, sync: { kind: 'idle' as const }, onBattle: vi.fn(), onSettings: vi.fn(), onSyncNow: vi.fn(), ...over }
  render(<CampScreen {...props} />)
  return props
}
const openMap = async () => userEvent.click(await screen.findByRole('button', { name: 'Lagerfeuer – Karte öffnen' }))

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('CampScreen', () => {
  it('Feuer öffnet die Karte mit der Tages-Quest', async () => {
    await botanik()
    await work()
    camp()
    await openMap()
    const map = await screen.findByRole('dialog', { name: 'Karte' })
    expect(within(map).getByText(/^Tages-Quest/).textContent).toBe('Tages-Quest 0/5')
  })

  it('Region zeigt Boss, Bedrohung, Themen-Fähnchen und startet den Kampf ausgeruht', async () => {
    await botanik()
    await work()
    const { onBattle } = camp()
    await openMap()
    await userEvent.click(await screen.findByRole('button', { name: 'Wald: Botanik' }))
    const panel = (await screen.findByText('Moosgolem · Botanik')).closest('section')!
    expect(within(panel).getByText('Bedrohung 67 %')).toBeInTheDocument()
    const zelle = screen.getByText('Zelle').closest('li')!
    expect(within(zelle).getByText('2 fällig')).toBeInTheDocument()
    expect(within(zelle).getByText('3 neu')).toBeInTheDocument()
    expect(within(screen.getByText('Blatt').closest('li')!).getByText('sitzt sicher')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Kämpfen' }))
    expect(onBattle).toHaveBeenCalledWith('m1', true)
  })

  it('2 Minuten nach einem Kampf: nicht ausgeruht, Restzeit sichtbar', async () => {
    await botanik()
    await work()
    await saveLastBattleAt(new Date(NOW.getTime() - 2 * 60 * 1000))
    const { onBattle } = camp()
    expect(await screen.findByText('Pause am Feuer: noch 3 min bis Ausgeruht')).toBeInTheDocument()
    await openMap()
    await userEvent.click(await screen.findByRole('button', { name: 'Wald: Botanik' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Kämpfen' }))
    expect(onBattle).toHaveBeenCalledWith('m1', false)
  })

  it('ohne Pause seit dem letzten Kampf: „Ausgeruht“', async () => {
    await botanik()
    camp()
    expect(await screen.findByText(/^Ausgeruht/)).toBeInTheDocument()
  })

  it('nichts zu tun: „Kämpfen“ gesperrt, unerforschtes Modul ohne Bedrohung', async () => {
    await botanik()
    camp()
    await openMap()
    await userEvent.click(await screen.findByRole('button', { name: 'Wald: Botanik' }))
    expect(await screen.findByText('Noch unerforscht')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kämpfen' })).toBeDisabled()
    expect(screen.getByText('Heute nichts zu tun')).toBeInTheDocument()
  })

  it('leere Regionen liegen im Nebel und sind gesperrt', async () => {
    await botanik()
    camp()
    await openMap()
    const fog = await screen.findAllByRole('button', { name: 'Unentdecktes Gebiet' })
    expect(fog).toHaveLength(5)
    for (const f of fog) expect(f).toBeDisabled()
  })

  it('verirrte Karten: eigener Kampf ohne Modul', async () => {
    await db.cards.bulkPut([choiceCard('a', { moduleId: 'weg' }), choiceCard('b', { moduleId: 'weg' })])
    const { onBattle } = camp()
    expect(await screen.findByText('Verirrte Karten: 2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Kämpfen' }))
    expect(onBattle).toHaveBeenCalledWith(undefined, true)
  })

  it('offene Karte sperrt den Waldplatz dahinter (inert), nach dem Schließen wieder frei', async () => {
    await botanik()
    camp()
    await openMap()
    await screen.findByRole('dialog', { name: 'Karte' })
    const menu = screen.getByRole('button', { name: 'Menü', hidden: true })
    expect(menu.closest('[inert]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Schließen' }).closest('[inert]')).toBeNull()
    await userEvent.keyboard('{Escape}')
    expect(menu.closest('[inert]')).toBeNull()
  })

  it('Escape und „Schließen“ schließen die Karte, der Fokus kehrt zum Feuer zurück', async () => {
    await botanik()
    camp()
    await openMap()
    await screen.findByRole('dialog', { name: 'Karte' })
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Karte' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lagerfeuer – Karte öffnen' })).toHaveFocus()
    await openMap()
    await userEvent.click(await screen.findByRole('button', { name: 'Schließen' }))
    expect(screen.queryByRole('dialog', { name: 'Karte' })).not.toBeInTheDocument()
  })

  it('Menü: Sync-Status, Synchronisieren, Einstellungen, Quarantäne-Warnung', async () => {
    await db.dead.add({ kind: 'log', payload: {} as never, error: 'x' })
    const { onSettings, onSyncNow } = camp({ sync: { kind: 'error', message: 'Netzwerk kaputt' } })
    await userEvent.click(await screen.findByRole('button', { name: 'Menü' }))
    expect(await screen.findByText('1 Einträge konnten nicht synchronisiert werden')).toBeInTheDocument()
    expect(screen.getByText(/Netzwerk kaputt/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Jetzt synchronisieren' }))
    expect(onSyncNow).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Einstellungen' }))
    expect(onSettings).toHaveBeenCalled()
  })

  it('Knopf „Gewächshaus“ führt ins Gewächshaus', async () => {
    const onGreenhouse = vi.fn()
    camp({ onGreenhouse })
    await userEvent.click(await screen.findByRole('button', { name: 'Gewächshaus' }))
    expect(onGreenhouse).toHaveBeenCalled()
  })

  it('Ladefehler mit „Erneut versuchen“', async () => {
    const spy = vi.spyOn(db.cards, 'toArray').mockRejectedValue(new Error('DB gesperrt'))
    camp()
    expect(await screen.findByRole('alert')).toHaveTextContent('DB gesperrt')
    spy.mockRestore()
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(await screen.findByRole('button', { name: 'Lagerfeuer – Karte öffnen' })).toBeInTheDocument()
  })
})
