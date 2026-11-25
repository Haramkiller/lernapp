// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Card } from '@lernapp/shared'
import { db } from '../../src/data/db'
import { recordReview } from '../../src/data/sync'
import { newDoneKey } from '../../src/session/queue'
import { newSrsState, review } from '../../src/srs/scheduler'
import { Cloze } from '../../src/ui/questions/Cloze'
import { BattleScreen } from '../../src/ui/BattleScreen'
import { seededRng } from '../../src/ui/random'
import { choiceCard, clozeCard, orderCard, pick } from './fixtures'

const NOW = new Date('2026-03-10T10:00:00.000Z')

beforeEach(async () => {
  await Promise.all([db.cards.clear(), db.states.clear(), db.outbox.clear(), db.meta.clear(), db.modules.clear(), db.dead.clear()])
  await db.meta.put({ key: 'settings', value: { retention: 0.9, newPerDay: 40 } })
})
afterEach(() => vi.restoreAllMocks())

const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

describe('Einheit vorzeitig beenden', () => {
  it('Beenden zeigt Zusammenfassung bisher und ruft onFinished', async () => {
    await db.cards.bulkPut([choiceCard('a'), choiceCard('b'), choiceCard('c')])
    const onFinished = vi.fn()
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onFinished={onFinished} onExit={vi.fn()} />)
    await pick(await screen.findByRole('button', { name: /Richtig B/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Weiter' }))
    expect(onFinished).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Beenden' }))
    expect(await screen.findByText(/1 richtig, 0 teilweise, 0 falsch/)).toBeInTheDocument()
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(await db.states.count()).toBe(1)
  })
})

describe('fehlerhafte Karten', () => {
  const broken = (): Card => {
    const c = orderCard('broken') as unknown as { payload: Record<string, unknown>; createdAt: string }
    delete c.payload.steps
    c.createdAt = '2026-01-01T00:00:00.000Z'
    return c as unknown as Card
  }

  it('Fehlergrenze zeigt Meldung, Überspringen ohne Review zeigt die nächste Karte', async () => {
    quiet()
    await db.cards.bulkPut([broken(), choiceCard('ok')])
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} validate={() => true} onExit={vi.fn()} />)
    expect(await screen.findByText('Diese Karte kann nicht angezeigt werden.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Karte überspringen' }))
    expect(await screen.findByRole('button', { name: /Richtig B/ })).toBeInTheDocument()
    expect(await db.states.count()).toBe(0)
  })

  it('Schema-Prüfung überspringt ungültige Karten beim Aufbau der Einheit', async () => {
    await db.cards.bulkPut([broken(), choiceCard('ok')])
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    expect(await screen.findByRole('button', { name: /Richtig B/ })).toBeInTheDocument()
    await pick(screen.getByRole('button', { name: /Richtig B/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Weiter' }))
    expect(await screen.findByText(/1 fehlerhafte Karte/)).toBeInTheDocument()
  })

  it('Cloze ohne passende Platzhalter zeigt ein Feld je Lücke', () => {
    const card = clozeCard('z')
    card.payload = { text: 'Kein Platzhalter hier', gaps: [{ answers: ['a'] }, { answers: ['b'] }] }
    render(<Cloze card={card} onAnswer={vi.fn()} />)
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(screen.getByLabelText('Lücke 2')).toBeInTheDocument()
  })
})

describe('Fehler werden angezeigt', () => {
  it('fehlgeschlagenes Speichern der Antwort zeigt Meldung und erlaubt neuen Versuch', async () => {
    await db.cards.bulkPut([choiceCard('a')])
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    const option = await screen.findByRole('button', { name: /Richtig B/ })
    const spy = vi.spyOn(db.states, 'put').mockRejectedValue(new Error('Speicher voll'))
    await pick(option)
    expect(await screen.findByRole('alert')).toHaveTextContent('Die Antwort konnte nicht gespeichert werden: Speicher voll')
    spy.mockRestore()
    await pick(screen.getByRole('button', { name: /Richtig B/ }))
    expect(await screen.findByRole('button', { name: 'Weiter' })).toBeInTheDocument()
    expect(await db.states.count()).toBe(1)
  })

  it('Study: Ladefehler mit „Erneut versuchen“', async () => {
    const spy = vi.spyOn(db.cards, 'toArray').mockRejectedValue(new Error('DB gesperrt'))
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('DB gesperrt')
    spy.mockRestore()
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(await screen.findByText(/Nichts zu lernen/)).toBeInTheDocument()
  })
})

describe('Zähler neuer Karten', () => {
  it('falsch beantwortete neue Karte zählt genau einmal, auch bei späterer Wiederholung', async () => {
    await db.cards.bulkPut([choiceCard('a')])
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    await pick(await screen.findByRole('button', { name: /Falsch A/ }))
    await screen.findByRole('button', { name: 'Weiter' })
    const key = newDoneKey(NOW)
    expect((await db.meta.get(key))?.value).toBe(1)
    const later = new Date(NOW.getTime() + 10 * 60_000)
    const st = (await db.states.get('a'))!.state
    await recordReview('a', review(st, 3, later, { cardId: 'a' }))
    expect((await db.meta.get(key))?.value).toBe(1)
  })

  it('Antwort nach 04:00 zählt für den neuen Lerntag', async () => {
    await db.cards.bulkPut([choiceCard('a')])
    let clock = new Date(2026, 2, 10, 3, 59)
    render(<BattleScreen now={() => clock} rng={seededRng(1)} onExit={vi.fn()} />)
    const option = await screen.findByRole('button', { name: /Richtig B/ })
    const before = newDoneKey(clock)
    clock = new Date(2026, 2, 10, 4, 1)
    const after = newDoneKey(clock)
    expect(after).not.toBe(before)
    await pick(option)
    await screen.findByRole('button', { name: 'Weiter' })
    expect((await db.meta.get(after))?.value).toBe(1)
    expect(await db.meta.get(before)).toBeUndefined()
    // sanity: neue Karte ohne State war vorher "neu"
    expect(newSrsState(clock).state).toBe(0)
  })
})
