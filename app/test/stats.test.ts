import { describe, expect, it } from 'vitest'
import { nextBattleModule } from '../src/session/stats'
import { newSrsState, review } from '../src/srs/scheduler'
import { choiceCard } from './ui/fixtures'

const NOW = new Date('2026-03-10T10:00:00.000Z')
const mod = (id: string, name: string) => ({ id, name, examDate: null, styleProfile: null, updatedAt: NOW.toISOString() })
const settings = { retention: 0.9, newPerDay: 20 }

describe('nextBattleModule', () => {
  it('längste Lernliste gewinnt, Gleichstand alphabetisch', () => {
    const modules = [mod('m1', 'Zoologie'), mod('m2', 'Botanik'), mod('m3', 'Chemie')]
    const cards = [
      choiceCard('a', { moduleId: 'm1' }),
      choiceCard('b', { moduleId: 'm1' }),
      choiceCard('c', { moduleId: 'm2' }),
      choiceCard('d', { moduleId: 'm2' }),
      choiceCard('e', { moduleId: 'm3' }),
    ]
    expect(nextBattleModule({ cards, states: new Map(), newDoneToday: 0, now: NOW, settings, modules })?.name).toBe('Botanik')
  })

  it('nichts zu tun → undefined', () => {
    const cards = [choiceCard('a')]
    const states = new Map([['a', review(newSrsState(NOW), 4, NOW, { cardId: 'a' }).state]])
    const later = new Date(NOW.getTime() + 60_000)
    expect(nextBattleModule({ cards, states, newDoneToday: 0, now: later, settings, modules: [mod('m1', 'Botanik')] })).toBeUndefined()
  })
})
