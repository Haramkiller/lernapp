import { describe, expect, it } from 'vitest'
import type { Module, Topic } from '@lernapp/shared'
import { REGION_SPECIES, bloomCount, buildGarden, newMilestones, plantStage, speciesFor, type Milestones } from '../src/game/garden'
import { REGIONS } from '../src/game/bosses'
import { newSrsState, review, type SrsState } from '../src/srs/scheduler'
import { choiceCard } from './ui/fixtures'

const NOW = new Date('2026-03-10T10:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const iso = NOW.toISOString()
const learned = (id: string) => review(newSrsState(NOW), 3, NOW, { cardId: id }).state
const secure = (id: string): SrsState => ({ ...review(newSrsState(NOW), 4, NOW, { cardId: id }).state, stability: 30, last_review: iso })
/** Lange nicht gesehen: gelernt, aber nicht mehr sicher. */
const faded = (id: string): SrsState => ({ ...secure(id), last_review: new Date(NOW.getTime() - 200 * DAY).toISOString() })

const mod = (id: string, name: string): Module => ({ id, name, examDate: null, styleProfile: null, updatedAt: iso })
const topic = (id: string, moduleId: string, name: string): Topic => ({ id, moduleId, name, updatedAt: iso })
const none: Milestones = { securedAt: new Map(), defeatedAt: new Map() }

describe('plantStage', () => {
  const cards = ['a', 'b', 'c', 'd'].map((id) => choiceCard(id))
  const st = (entries: [string, SrsState][]) => new Map(entries)

  it('ohne gelernte Karte: Saat', () => {
    expect(plantStage(cards, new Map(), NOW, 0.9, false)).toBe('seed')
  })

  it('alle sicher: Blüte', () => {
    expect(plantStage(cards, st(cards.map((c) => [c.id, secure(c.id)])), NOW, 0.9, false)).toBe('bloom')
  })

  it('1 von 4 sicher: Sämling, 3 von 4: jung', () => {
    expect(plantStage(cards, st([['a', secure('a')], ['b', learned('b')]]), NOW, 0.9, false)).toBe('sprout')
    expect(plantStage(cards, st([['a', secure('a')], ['b', secure('b')], ['c', secure('c')], ['d', learned('d')]]), NOW, 0.9, false)).toBe('young')
  })

  it('einmal sicher gewesen, jetzt eine gelernte Karte unsicher: welk', () => {
    const states = st([['a', secure('a')], ['b', secure('b')], ['c', secure('c')], ['d', faded('d')]])
    expect(plantStage(cards, states, NOW, 0.9, true)).toBe('wilted')
  })

  it('einmal sicher gewesen, nur eine neue Karte dazugekommen: nicht welk', () => {
    const states = st([['a', secure('a')], ['b', secure('b')], ['c', secure('c')]])
    expect(plantStage(cards, states, NOW, 0.9, true)).toBe('young')
  })
})

describe('buildGarden', () => {
  const modules = [mod('m2', 'Trainingslehre'), mod('m1', 'Botanik'), mod('m3', 'Anatomie')]
  const topics = [topic('t2', 'm1', 'Zellwand'), topic('t1', 'm1', 'Chloroplasten'), topic('t3', 'm2', 'Superkompensation'), topic('t9', 'm1', 'Leer')]
  const cards = [
    choiceCard('a', { moduleId: 'm1', topicId: 't1' }),
    choiceCard('b', { moduleId: 'm1', topicId: 't2' }),
    choiceCard('x', { moduleId: 'm1', topicId: 't9', deleted: true }),
    choiceCard('c', { moduleId: 'm2', topicId: 't3' }),
  ]
  const input = (states: Map<string, SrsState>, milestones = none) =>
    buildGarden({ modules, topics, cards, states, now: NOW, retention: 0.9, chosen: new Map(), milestones })

  it('Beete nach Modulname, Pflanzen nach Themenname; gelöschte Karten und leere Themen zählen nicht', () => {
    const beds = input(new Map())
    expect(beds.map((b) => b.module.name)).toEqual(['Anatomie', 'Botanik', 'Trainingslehre'])
    expect(beds[0]!.plants).toEqual([])
    expect(beds[1]!.plants.map((p) => p.topic.name)).toEqual(['Chloroplasten', 'Zellwand'])
    expect(beds[1]!.plants[0]).toMatchObject({ stage: 'seed', total: 1, due: 0, securePct: 0 })
  })

  it('Baum: ohne Meilenstein keiner, mit Meilenstein blühend oder welk', () => {
    const allSecure = new Map([['a', secure('a')], ['b', secure('b')]])
    expect(input(allSecure)[1]!.tree).toBe('none')
    const won: Milestones = { securedAt: new Map(), defeatedAt: new Map([['m1', iso]]) }
    expect(input(allSecure, won)[1]!.tree).toBe('bloom')
    // Beim Sieg saßen alle Themen sicher, also haben sie ihren Meilenstein.
    const wonAll: Milestones = { securedAt: new Map([['t1', iso], ['t2', iso]]), defeatedAt: new Map([['m1', iso]]) }
    expect(input(new Map([['a', secure('a')], ['b', faded('b')]]), wonAll)[1]!.tree).toBe('wilted')
  })

  it('Baum welkt nicht, nur weil neue Karten oder Themen dazukommen (Spec 6.5)', () => {
    const wonAll: Milestones = { securedAt: new Map([['t1', iso], ['t2', iso]]), defeatedAt: new Map([['m1', iso]]) }
    const withNew = buildGarden({
      modules,
      topics: [...topics, topic('t4', 'm1', 'Neu')],
      cards: [...cards, choiceCard('n', { moduleId: 'm1', topicId: 't4' })],
      states: new Map([['a', secure('a')], ['b', secure('b')]]),
      now: NOW,
      retention: 0.9,
      chosen: new Map(),
      milestones: wonAll,
    })
    expect(withNew[1]!.plants.find((p) => p.topic.id === 't4')!.stage).toBe('seed')
    expect(withNew[1]!.tree).toBe('bloom')
  })

  it('welk über den Meilenstein des Themas; Schild zählt unsichere gelernte Karten', () => {
    const ms: Milestones = { securedAt: new Map([['t2', iso]]), defeatedAt: new Map() }
    const plant = input(new Map([['b', faded('b')]]), ms)[1]!.plants[1]!
    expect(plant).toMatchObject({ stage: 'wilted', due: 1 })
  })

  it('bloomCount zählt blühende Pflanzen und Bäume', () => {
    const won: Milestones = { securedAt: new Map(), defeatedAt: new Map([['m1', iso]]) }
    expect(bloomCount(input(new Map([['a', secure('a')], ['b', secure('b')], ['c', secure('c')]]), won))).toBe(4)
  })
})

describe('newMilestones', () => {
  const modules = [mod('m1', 'Botanik')]
  const topics = [topic('t1', 'm1', 'A'), topic('t2', 'm1', 'B')]
  const cards = [choiceCard('a', { topicId: 't1' }), choiceCard('b', { topicId: 't2' })]
  const beds = (states: Map<string, SrsState>, ms = none) =>
    buildGarden({ modules, topics, cards, states, now: NOW, retention: 0.9, chosen: new Map(), milestones: ms })

  it('frisch sicheres Thema genau einmal; Modul erst, wenn alle Themen gleichzeitig sicher', () => {
    const one = new Map([['a', secure('a')]])
    expect(newMilestones(beds(one), none)).toEqual({ topics: ['t1'], modules: [] })
    const known: Milestones = { securedAt: new Map([['t1', iso]]), defeatedAt: new Map() }
    expect(newMilestones(beds(one, known), known)).toEqual({ topics: [], modules: [] })
    const both = new Map([['a', secure('a')], ['b', secure('b')]])
    expect(newMilestones(beds(both, known), known)).toEqual({ topics: ['t2'], modules: ['m1'] })
  })

  it('ungültige Karte zählt nicht: Thema blüht und Modul wird besiegt', () => {
    const bad = { ...choiceCard('x', { topicId: 't1' }), payload: {} } as unknown as (typeof cards)[number]
    const withBad = buildGarden({
      modules,
      topics,
      cards: [...cards, bad],
      states: new Map([['a', secure('a')], ['b', secure('b')]]),
      now: NOW,
      retention: 0.9,
      chosen: new Map(),
      milestones: none,
    })
    expect(withBad[0]!.plants.map((p) => p.stage)).toEqual(['bloom', 'bloom'])
    expect(newMilestones(withBad, none).modules).toEqual(['m1'])
  })

  it('Modul ohne Pflanzen wird nie besiegt', () => {
    const empty = buildGarden({ modules, topics: [], cards: [], states: new Map(), now: NOW, retention: 0.9, chosen: new Map(), milestones: none })
    expect(newMilestones(empty, none).modules).toEqual([])
  })
})

describe('speciesFor', () => {
  it('stabil und aus der Auswahl der Region', () => {
    for (const r of REGIONS) {
      const s = speciesFor('topic-42', r.id)
      expect(speciesFor('topic-42', r.id)).toBe(s)
      expect(REGION_SPECIES[r.id]).toContain(s)
    }
  })
})
