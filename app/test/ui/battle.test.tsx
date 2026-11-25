// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../src/data/db'
import { BattleScreen } from '../../src/ui/BattleScreen'
import { seededRng } from '../../src/ui/random'
import { choiceCard, pick } from './fixtures'
import { newDoneKey } from '../../src/session/queue'
import { newSrsState, review } from '../../src/srs/scheduler'
import { BOSSES, bossFor } from '../../src/game/bosses'
import { saveAreaChoice } from '../../src/data/game'

const NOW = new Date('2026-03-10T10:00:00.000Z')

beforeEach(async () => {
  await Promise.all([db.cards.clear(), db.states.clear(), db.outbox.clear(), db.meta.clear(), db.modules.clear(), db.topics.clear(), db.game.clear()])
})

describe('BattleScreen', () => {
  it('speichert jede Antwort und endet nach 25 Karten mit Zusammenfassung', async () => {
    await db.meta.put({ key: 'settings', value: { retention: 0.9, newPerDay: 40 } })
    await db.cards.bulkPut(Array.from({ length: 30 }, (_, i) => choiceCard(`c${String(i).padStart(2, '0')}`)))
    const onFinished = vi.fn()
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onFinished={onFinished} onExit={vi.fn()} />)

    for (let i = 0; i < 25; i++) {
      const right = i % 5 !== 4 // 20 richtig, 5 falsch
      await pick(await screen.findByRole('button', { name: right ? /Richtig B/ : /Falsch A/ }))
      expect(await db.states.count()).toBe(i + 1)
      await userEvent.click(await screen.findByRole('button', { name: 'Weiter' }))
    }
    expect(await screen.findByText(/20 richtig/)).toBeInTheDocument()
    expect(screen.getByText(/5 falsch/)).toBeInTheDocument()
    expect(screen.getByText(/Pause/)).toBeInTheDocument()
    expect(await db.states.count()).toBe(25)
    expect(await db.outbox.count()).toBe(50)
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('zeigt bei leerer Warteschlange einen Hinweis', async () => {
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    expect(await screen.findByText(/Nichts zu lernen/)).toBeInTheDocument()
  })

  it('berechnet den neuen State aus dem aktuellen DB-Stand, nicht aus dem Stand beim Öffnen', async () => {
    await db.cards.bulkPut([choiceCard('a')])
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
    const option = await screen.findByRole('button', { name: /Richtig B/ })
    // Ein Sync zieht währenddessen einen neueren State (eine Wiederholung auf einem anderen Gerät).
    const earlier = new Date(NOW.getTime() - 60 * 60_000)
    const pulled = review(newSrsState(earlier), 3, earlier, { cardId: 'a' }).state
    await db.states.put({ cardId: 'a', state: pulled, updatedAt: earlier.toISOString() })
    await pick(option)
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
    render(<BattleScreen moduleId="m1" now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} validate={validate} />)
    await screen.findByRole('button', { name: /Richtig B/ })
    expect(validate.mock.calls.map(([c]) => c.id)).not.toContain('b')
  })

  it('Nachfragen-Dialog gehört zur Karte: weg bei Weiter und beim Beenden', async () => {
    await db.cards.bulkPut([choiceCard('c1'), choiceCard('c2')])
    const renderAsk = (card: { id: string }) => <p>Dialog für {card.id}</p>
    render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} renderAsk={renderAsk} />)
    await pick(await screen.findByRole('button', { name: /Richtig B/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Nachfragen' }))
    expect(screen.getByText(/Dialog für c/)).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Weiter' }))
    expect(screen.queryByText(/Dialog für/)).not.toBeInTheDocument()
    await pick(await screen.findByRole('button', { name: /Richtig B/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Nachfragen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Beenden' }))
    expect(screen.queryByText(/Dialog für/)).not.toBeInTheDocument()
  })

  it('Schließen des Nachfragen-Dialogs lässt genau eine Rückmeldung stehen (auch mit key={card.id})', async () => {
    await db.cards.bulkPut([choiceCard('c1')])
    const renderAsk = (card: { id: string }, _a: unknown, close: () => void) => (
      <button key={card.id} type="button" onClick={close}>
        Schließen
      </button>
    )
    const { container } = render(<BattleScreen now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} renderAsk={renderAsk} />)
    await pick(await screen.findByRole('button', { name: /Falsch A/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Nachfragen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(container.querySelectorAll('section.feedback')).toHaveLength(1)
  })
})

describe('BattleScreen: Kampf', () => {
  const NO_LUCK = () => 0.99
  const bar = () => screen.getByRole('progressbar', { name: 'Leben des Bosses' })
  const botanik = () => db.modules.put({ id: 'm1', name: 'Botanik', examDate: null, styleProfile: null, updatedAt: NOW.toISOString() })
  const cards = (n: number) => db.cards.bulkPut(Array.from({ length: n }, (_, i) => choiceCard(`k${i}`)))
  const right = async () => pick(await screen.findByRole('button', { name: /Richtig B/ }))
  const wrong = async () => pick(await screen.findByRole('button', { name: /Falsch A/ }))
  const next = async () => userEvent.click(await screen.findByRole('button', { name: 'Weiter' }))

  afterEach(() => vi.unstubAllGlobals())

  it('zeigt Boss mit Modulnamen und vollem Leben', async () => {
    await botanik()
    await cards(2)
    render(<BattleScreen moduleId="m1" now={() => NOW} rng={NO_LUCK} onExit={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: /· Botanik$/ })).toBeInTheDocument()
    expect(bar()).toHaveAttribute('aria-valuenow', '100')
  })

  it('kämpft gegen den Boss des gewählten Gebiets (wie auf der Karte)', async () => {
    await botanik()
    await cards(2)
    const mod = { id: 'm1', name: 'Botanik', examDate: null, styleProfile: null, updatedAt: NOW.toISOString() }
    const auto = bossFor('m1', [mod]).boss
    const chosen = BOSSES.find((b) => b.id !== auto.id)!
    await saveAreaChoice('m1', chosen.id, NOW)
    render(<BattleScreen moduleId="m1" now={() => NOW} rng={NO_LUCK} onExit={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: `${chosen.title} · Botanik` })).toBeInTheDocument()
  })

  it('richtige Antwort senkt das Leben, falsche lässt den Boss angreifen', async () => {
    await botanik()
    await cards(4)
    const { container } = render(<BattleScreen moduleId="m1" now={() => NOW} rng={NO_LUCK} onExit={vi.fn()} />)
    await right()
    await vi.waitFor(() => expect(bar()).toHaveAttribute('aria-valuenow', '75'))
    expect(container.querySelector('.fx-damage')).toHaveTextContent('-10')
    await next()
    await wrong()
    // Die Antwort zählt erst nach dem Speichern: auf den Angriff warten, nicht sofort prüfen (CI ist langsamer).
    await vi.waitFor(() => expect(container.querySelector('.arena')).toHaveClass('boss-attacks'))
    expect(bar()).toHaveAttribute('aria-valuenow', '75')
    expect(screen.queryByText(/Herz|Leben verloren/)).not.toBeInTheDocument()
  })

  it('Combo ab 3 richtigen Antworten', async () => {
    await cards(5)
    render(<BattleScreen now={() => NOW} rng={NO_LUCK} onExit={vi.fn()} />)
    await right()
    await next()
    await right()
    expect(screen.queryByText(/Combo ×/)).not.toBeInTheDocument()
    await next()
    await right()
    expect(screen.getByText('Combo ×3')).toBeInTheDocument()
  })

  it('Krit bei lange nicht gesehener Karte', async () => {
    await cards(1)
    const earlier = new Date(NOW.getTime() - 10 * 24 * 60 * 60_000)
    await db.states.put({ cardId: 'k0', state: review(newSrsState(earlier), 3, earlier, { cardId: 'k0' }).state, updatedAt: earlier.toISOString() })
    render(<BattleScreen now={() => NOW} rng={NO_LUCK} onExit={vi.fn()} />)
    await right()
    expect(screen.getByText('Kritisch!')).toBeInTheDocument()
  })

  it('alle Fragen richtig: „Besiegt!“ mit Zahlen und Pausenhinweis', async () => {
    await cards(2)
    render(<BattleScreen now={() => NOW} rng={NO_LUCK} onExit={vi.fn()} />)
    await right()
    await next()
    await right()
    await next()
    expect(await screen.findByRole('heading', { name: 'Besiegt!' })).toBeInTheDocument()
    expect(screen.getByText(/2 richtig, 0 teilweise, 0 falsch/)).toBeInTheDocument()
    expect(screen.getByText('Höchste Combo: 2')).toBeInTheDocument()
    expect(screen.getByText(/Pause/)).toBeInTheDocument()
  })

  it('Beenden mitten im Kampf: „Geflohen“, onFinished einmal', async () => {
    await cards(3)
    const onFinished = vi.fn()
    render(<BattleScreen now={() => NOW} rng={NO_LUCK} onFinished={onFinished} onExit={vi.fn()} />)
    await right()
    await userEvent.click(screen.getByRole('button', { name: 'Beenden' }))
    expect(await screen.findByRole('heading', { name: 'Geflohen' })).toBeInTheDocument()
    expect(screen.getByText('Er flieht mit 67 % Leben.')).toBeInTheDocument()
    expect(screen.getByText(/1 richtig, 0 teilweise, 0 falsch/)).toBeInTheDocument()
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('ausgeruht: Hinweis und mehr Glückstreffer', async () => {
    await cards(2)
    render(<BattleScreen now={() => NOW} rng={() => 0.2} rested onExit={vi.fn()} />)
    expect(await screen.findByText(/Ausgeruht/)).toBeInTheDocument()
    await right()
    expect(await screen.findByText('Glückstreffer!')).toBeInTheDocument()
  })

  it('nicht ausgeruht: kein Hinweis, kein Glückstreffer bei rng 0.2', async () => {
    await cards(2)
    render(<BattleScreen now={() => NOW} rng={() => 0.2} onExit={vi.fn()} />)
    await right()
    expect(await screen.findByRole('button', { name: 'Weiter' })).toBeInTheDocument()
    expect(screen.queryByText(/Ausgeruht/)).not.toBeInTheDocument()
    expect(screen.queryByText('Glückstreffer!')).not.toBeInTheDocument()
  })

  it('onFinished meldet die Zahl gespeicherter Antworten', async () => {
    await cards(3)
    const onFinished = vi.fn()
    render(<BattleScreen now={() => NOW} rng={NO_LUCK} onFinished={onFinished} onExit={vi.fn()} />)
    await right()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Beenden' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Beenden' }))
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledWith(1))
  })

  it('Beenden ohne Antwort: onFinished mit 0', async () => {
    await cards(3)
    const onFinished = vi.fn()
    render(<BattleScreen now={() => NOW} rng={NO_LUCK} onFinished={onFinished} onExit={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Beenden' }))
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledWith(0))
  })

  it('Speichern schlägt fehl: kein Schaden', async () => {
    await cards(2)
    const spy = vi.spyOn(db.states, 'put').mockRejectedValueOnce(new Error('voll'))
    render(<BattleScreen now={() => NOW} rng={NO_LUCK} onExit={vi.fn()} />)
    await right()
    expect(await screen.findByRole('alert')).toHaveTextContent(/nicht gespeichert/)
    expect(bar()).toHaveAttribute('aria-valuenow', '100')
    spy.mockRestore()
  })

  it('Beenden ist gesperrt, solange eine Antwort gespeichert wird', async () => {
    await cards(2)
    const spy = vi.spyOn(db.states, 'put').mockImplementationOnce(() => new Promise<string>(() => {}) as never)
    render(<BattleScreen now={() => NOW} rng={NO_LUCK} onExit={vi.fn()} />)
    await right()
    expect(screen.getByRole('button', { name: 'Beenden' })).toBeDisabled()
    spy.mockRestore()
  })

  it('Weiter sofort nach Treffer: nächste Frage bedienbar, kein alter Effekt', async () => {
    await cards(2)
    const { container } = render(<BattleScreen now={() => NOW} rng={NO_LUCK} onExit={vi.fn()} />)
    await right()
    await next()
    expect(await screen.findByRole('button', { name: /Richtig B/ })).toBeEnabled()
    expect(container.querySelector('.fx-damage')).toBeNull()
    expect(container.querySelector('.arena .fx')).toBeNull()
  })

  it('Modul fehlt in der Datenbank: Kampf startet mit „Unbekanntes Gebiet“', async () => {
    await cards(1)
    render(<BattleScreen moduleId="m1" now={() => NOW} rng={NO_LUCK} onExit={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: /· Unbekanntes Gebiet$/ })).toBeInTheDocument()
  })

  it('reduzierte Bewegung: Leben sinkt trotzdem', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
    await cards(2)
    render(<BattleScreen now={() => NOW} rng={NO_LUCK} onExit={vi.fn()} />)
    await right()
    await vi.waitFor(() => expect(bar()).toHaveAttribute('aria-valuenow', '50'))
  })
})
