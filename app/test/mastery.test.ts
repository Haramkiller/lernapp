import { describe, expect, it } from 'vitest'
import type { Topic } from '@lernapp/shared'
import { dailyQuest, isLearned, isSecure, moduleThreat, topicStatus } from '../src/game/mastery'
import { newSrsState, review, type SrsState } from '../src/srs/scheduler'
import { choiceCard } from './ui/fixtures'

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

describe('moduleThreat', () => {
  it('nur neue Karten: keine Bedrohung (null)', () => {
    expect(moduleThreat([choiceCard('a')], new Map(), NOW, 0.9)).toBeNull()
  })

  it('Anteil unsicherer unter den gelernten, nie gelernte zählen nicht', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => choiceCard(id))
    const states = new Map([
      ['a', secure('a')],
      ['b', learned('b')],
    ])
    expect(moduleThreat(cards, states, NOW, 0.9)).toBe(50)
    expect(moduleThreat(cards, new Map([['a', secure('a')]]), NOW, 0.9)).toBe(0)
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
