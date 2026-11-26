import { describe, expect, it } from 'vitest'
import type { Card, Topic } from '@lernapp/shared'
import { CARD_LIFE, bossLife, cardLife, dailyQuest, isLearned, isPlayable, isSecure, isTypedReady, lifePercent, topicStatus } from '../src/game/mastery'
import { newSrsState, review, type SrsState } from '../src/srs/scheduler'
import { choiceCard, clozeCard } from './ui/fixtures'
import { State } from 'ts-fsrs'

const NOW = new Date('2026-03-10T10:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const settings = { retention: 0.9, newPerDay: 20 }
const topic: Topic = { id: 't1', moduleId: 'm1', name: 'Chloroplasten', updatedAt: NOW.toISOString() }

const learned = (id: string, at = NOW, rating: 1 | 3 | 4 = 3) => review(newSrsState(at), rating, at, { cardId: id }).state
const secure = (id: string): SrsState => ({ ...learned(id, NOW, 4), stability: 30, last_review: NOW.toISOString() })

describe('isSecure', () => {
  it('ohne State oder neue Karte: nicht sicher, nicht gelernt', () => {
    expect(isSecure(undefined, NOW, 0.9)).toBe(false)
    expect(isLearned(newSrsState(NOW))).toBe(false)
    expect(isSecure(newSrsState(NOW), NOW, 0.9)).toBe(false)
  })

  it('frisch gelernt (Stabilität unter 7 Tagen): nicht sicher', () => {
    const s = learned('a')
    expect(isLearned(s)).toBe(true)
    expect(s.stability).toBeLessThan(7)
    expect(isSecure(s, NOW, 0.9)).toBe(false)
  })

  it('stabil und frisch wiederholt: sicher; lange nicht gesehen: nicht mehr sicher', () => {
    expect(isSecure(secure('a'), NOW, 0.9)).toBe(true)
    expect(isSecure(secure('a'), new Date(NOW.getTime() + 200 * DAY), 0.9)).toBe(false)
  })
})

describe('topicStatus', () => {
  it('eine sichere und eine nie gelernte Karte: nicht sicher; neu zählt nur aus der Lernliste', () => {
    const cards = [choiceCard('a'), choiceCard('b')]
    const states = new Map([['a', secure('a')]])
    expect(topicStatus(topic, cards, states, new Set(), NOW, 0.9)).toEqual({ topic, total: 2, due: 0, fresh: 0, secure: false })
    expect(topicStatus(topic, cards, states, new Set(['b']), NOW, 0.9).fresh).toBe(1)
  })

  it('alle Karten sicher: sicher; gelöschte Karte zählt nicht', () => {
    const cards = [choiceCard('a'), choiceCard('b'), choiceCard('x', { deleted: true })]
    const states = new Map([
      ['a', secure('a')],
      ['b', secure('b')],
    ])
    expect(topicStatus(topic, cards, states, new Set(), NOW, 0.9)).toMatchObject({ total: 2, secure: true })
  })

  it('fällig zählt Karten der Lernliste mit State', () => {
    const cards = [choiceCard('a'), choiceCard('b')]
    const states = new Map([['a', learned('a')]])
    expect(topicStatus(topic, cards, states, new Set(['a', 'b']), NOW, 0.9)).toMatchObject({ due: 1, fresh: 1 })
  })
})

describe('Boss-Leben', () => {
  it('neue Karte zählt 10, sicher sitzende 0', () => {
    expect(cardLife(undefined, NOW, 0.9)).toBe(CARD_LIFE)
    expect(cardLife(newSrsState(NOW), NOW, 0.9)).toBe(10)
    expect(cardLife(secure('a'), NOW, 0.9)).toBe(0)
  })

  it('cardLife ist genau dann 0, wenn isSecure', () => {
    const later = new Date(NOW.getTime() + 200 * DAY)
    const cases: [SrsState | undefined, Date][] = [
      [undefined, NOW],
      [learned('a'), NOW],
      [learned('a', NOW, 1), NOW],
      [secure('a'), NOW],
      [secure('a'), later],
    ]
    for (const [s, at] of cases) expect(cardLife(s, at, 0.9) === 0).toBe(isSecure(s, at, 0.9))
  })

  it('halbe Stabilität bei vollem Abruf: 5', () => {
    const s: SrsState = { ...learned('a'), stability: 3.5, last_review: NOW.toISOString() }
    expect(cardLife(s, NOW, 0.9)).toBeCloseTo(5)
  })

  it('verblasste Karte gewinnt Leben zurück', () => {
    const later = new Date(NOW.getTime() + 60 * DAY)
    expect(cardLife(secure('a'), later, 0.9)).toBeGreaterThan(0)
    expect(cardLife(secure('a'), later, 0.9)).toBeLessThan(10)
  })

  it('bossLife: Summe und Höchstwert, gelöschte und ungültige Karten zählen nicht', () => {
    const bad = { ...choiceCard('x'), payload: {} } as unknown as Card
    expect(isPlayable(choiceCard('a'))).toBe(true)
    expect(isPlayable(bad)).toBe(false)
    const cards = [choiceCard('a'), choiceCard('b'), choiceCard('c'), choiceCard('d', { deleted: true }), bad]
    expect(bossLife(cards, new Map([['c', secure('c')]]), NOW, 0.9)).toEqual({ hp: 20, max: 30 })
  })

  it('lifePercent: null ohne Karten, sonst gerundet', () => {
    expect(lifePercent({ hp: 0, max: 0 })).toBeNull()
    expect(lifePercent({ hp: 13.4, max: 20 })).toBe(67)
    // Nur wirklich besiegt zeigt 0 %.
    expect(lifePercent({ hp: 0.3, max: 300 })).toBe(1)
    expect(lifePercent({ hp: 0, max: 300 })).toBe(0)
  })
})

describe('dailyQuest', () => {
  it('heute erledigt plus noch offen', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => choiceCard(id))
    const states = new Map([
      ['a', learned('a', NOW, 4)],
      ['b', learned('b', NOW, 4)],
    ])
    expect(dailyQuest({ cards, states, newDoneToday: 2, now: NOW, settings })).toEqual({ done: 2, total: 5 })
  })

  it('heute gelernt, aber im Lernschritt wieder fällig: nur offen, nicht doppelt', () => {
    const cards = [choiceCard('a')]
    const states = new Map([['a', learned('a', NOW, 1)]])
    const later = new Date(NOW.getTime() + 30 * 60 * 1000)
    expect(dailyQuest({ cards, states, newDoneToday: 1, now: later, settings })).toEqual({ done: 0, total: 1 })
  })

  it('Wiederholung von gestern zählt nicht als erledigt', () => {
    const cards = [choiceCard('a')]
    const states = new Map([['a', learned('a', new Date(NOW.getTime() - DAY), 4)]])
    expect(dailyQuest({ cards, states, newDoneToday: 0, now: NOW, settings })).toEqual({ done: 0, total: 0 })
  })

  it('Lerntag wechselt um 04:00: 03:30 gehört zum Vortag', () => {
    const cards = [choiceCard('a')]
    const at = new Date(2026, 2, 10, 3, 30)
    const states = new Map([['a', learned('a', at, 4)]])
    expect(dailyQuest({ cards, states, newDoneToday: 0, now: new Date(2026, 2, 10, 3, 50), settings }).done).toBe(1)
    expect(dailyQuest({ cards, states, newDoneToday: 0, now: new Date(2026, 2, 10, 4, 10), settings }).done).toBe(0)
  })

  it('gelöschte Karten zählen nicht', () => {
    const cards = [choiceCard('a', { deleted: true })]
    const states = new Map([['a', learned('a', NOW, 4)]])
    expect(dailyQuest({ cards, states, newDoneToday: 0, now: NOW, settings })).toEqual({ done: 0, total: 0 })
  })
})

describe('isTypedReady', () => {
  const typedCard = (typed: unknown = { answers: ['Richtig B'] }) => {
    const c = choiceCard('a')
    return { ...c, payload: { ...c.payload, typed } } as Card
  }
  const st = (over: Partial<SrsState>): SrsState => ({ ...secure('a'), state: State.Review, stability: 7, ...over })

  it('Review und Stabilität ≥ 7 Tage mit Kernantwort → Eingabe', () => {
    expect(isTypedReady(typedCard(), st({}))).toBe(true)
    expect(isTypedReady(typedCard(), st({ stability: 30, due: new Date(NOW.getTime() - 10 * DAY).toISOString() }))).toBe(true)
  })
  it('zu wenig Stabilität, Lernen, Wiederlernen, ohne State → Auswahl', () => {
    expect(isTypedReady(typedCard(), st({ stability: 6.9 }))).toBe(false)
    expect(isTypedReady(typedCard(), st({ state: State.Relearning, stability: 30 }))).toBe(false)
    expect(isTypedReady(typedCard(), st({ state: State.Learning, stability: 30 }))).toBe(false)
    expect(isTypedReady(typedCard(), undefined)).toBe(false)
  })
  it('ohne Kernantwort oder andere Kartentypen → nie', () => {
    expect(isTypedReady(typedCard(null), st({ stability: 30 }))).toBe(false)
    expect(isTypedReady(choiceCard('a'), st({ stability: 30 }))).toBe(false)
    expect(isTypedReady(clozeCard('z'), st({ stability: 30 }))).toBe(false)
  })
})
