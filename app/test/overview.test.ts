import { describe, expect, it } from 'vitest'
import type { Module, Topic } from '@lernapp/shared'
import { buildOverview } from '../src/game/overview'
import { bossLife, dailyQuest, lifePercent } from '../src/game/mastery'
import { BOSSES } from '../src/game/bosses'
import { newSrsState, review } from '../src/srs/scheduler'
import { choiceCard } from './ui/fixtures'

const NOW = new Date('2026-03-10T10:00:00.000Z')
const settings = { retention: 0.9, newPerDay: 20 }
const mod = (id: string, name: string): Module => ({ id, name, examDate: null, styleProfile: null, updatedAt: NOW.toISOString() })
const topic = (id: string, moduleId: string, name: string): Topic => ({ id, moduleId, name, updatedAt: NOW.toISOString() })
const base = { states: new Map(), newDoneToday: 0, now: NOW, settings, chosen: new Map<string, string>() }

describe('buildOverview', () => {
  it('Modul landet in der Region seines Bosses, die übrigen Regionen sind leer', () => {
    const o = buildOverview({ ...base, cards: [choiceCard('a')], topics: [topic('t1', 'm1', 'Zelle')], modules: [mod('m1', 'Botanik')] })
    expect(o.regions).toHaveLength(6)
    const filled = o.regions.filter((r) => r.modules.length > 0)
    expect(filled).toHaveLength(1)
    const view = filled[0]!.modules[0]!
    expect(filled[0]!.region.id).toBe(view.boss.region)
    expect(view).toMatchObject({ bossName: `${view.boss.title} · Botanik`, life: 100, due: 0, fresh: 1 })
  })

  it('Modul ohne Karten: kein Boss-Leben (null)', () => {
    const o = buildOverview({ ...base, cards: [], topics: [], modules: [mod('m1', 'Botanik')] })
    expect(o.regions.flatMap((r) => r.modules)[0]!.life).toBeNull()
  })

  it('ungültige Karten zählen nicht zum Boss-Leben', () => {
    const bad = { ...choiceCard('x'), payload: {} } as unknown as (typeof cards)[number]
    const cards = [choiceCard('a')]
    const o = buildOverview({ ...base, cards: [...cards, bad], topics: [], modules: [mod('m1', 'Botanik')] })
    const view = o.regions.flatMap((r) => r.modules)[0]!
    expect(view.life).toBe(100)
    expect(view.fresh).toBe(1)
  })

  it('gewähltes Gebiet verschiebt das Modul', () => {
    const o = buildOverview({ ...base, cards: [], topics: [], modules: [mod('m1', 'Botanik')], chosen: new Map([['m1', 'aschephoenix']]) })
    expect(o.regions.find((r) => r.region.id === 'vulkan')!.modules.map((m) => m.module.name)).toEqual(['Botanik'])
  })

  it('7 Module: keines fehlt, zwei teilen sich eine Region', () => {
    const modules = Array.from({ length: 7 }, (_, i) => mod(`m${i}`, `Modul ${i}`))
    const o = buildOverview({ ...base, cards: [], topics: [], modules })
    expect(o.regions.flatMap((r) => r.modules).length).toBe(7)
    expect(o.regions.some((r) => r.modules.length === 2)).toBe(true)
  })

  it('Themen alphabetisch mit Fähnchen; Boss-Leben über alle Karten des Moduls', () => {
    const cards = [choiceCard('a', { topicId: 't1' }), choiceCard('b', { topicId: 't2' })]
    const states = new Map([['a', review(newSrsState(NOW), 3, NOW, { cardId: 'a' }).state]])
    const o = buildOverview({
      ...base,
      states,
      cards,
      topics: [topic('t1', 'm1', 'Zelle'), topic('t2', 'm1', 'Blatt'), topic('tx', 'm2', 'Fremd')],
      modules: [mod('m1', 'Botanik')],
    })
    const view = o.regions.flatMap((r) => r.modules)[0]!
    expect(view.topics.map((t) => t.topic.name)).toEqual(['Blatt', 'Zelle'])
    expect(view.topics[0]).toMatchObject({ fresh: 1, secure: false })
    expect(view.life).toBe(lifePercent(bossLife(cards, states, NOW, 0.9)))
    expect(view.life).toBeLessThan(100)
  })

  it('verirrte Karten: fällig, aber Modul unbekannt', () => {
    const cards = [choiceCard('a', { moduleId: 'weg' }), choiceCard('b', { moduleId: 'weg' }), choiceCard('c')]
    const o = buildOverview({ ...base, cards, topics: [], modules: [mod('m1', 'Botanik')] })
    expect(o.strays).toBe(2)
  })

  it('Quest wie dailyQuest', () => {
    const cards = [choiceCard('a'), choiceCard('b')]
    const o = buildOverview({ ...base, cards, topics: [], modules: [mod('m1', 'Botanik')] })
    expect(o.quest).toEqual(dailyQuest({ cards, states: new Map(), newDoneToday: 0, now: NOW, settings }))
    expect(BOSSES.length).toBe(6)
  })
})
