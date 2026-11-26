import { describe, expect, it } from 'vitest'
import { Rating, State } from 'ts-fsrs'
import {
  EMPTY_RUN,
  FIND_ITEMS,
  collection,
  countsForLoot,
  fertilizer,
  isDuplicate,
  itemById,
  itemSize,
  nextDrops,
  oddsFor,
  researchHint,
  researchedByModule,
  researchedByState,
  rollFind,
  soilSpent,
  type DropKind,
  type Find,
  type FindStatus,
} from '../src/game/finds'
import { REGIONS, regionForModule } from '../src/game/bosses'
import { newSrsState, review } from '../src/srs/scheduler'

const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++]!
}

const find = (over: Partial<Find> = {}): Find => ({
  id: 'f',
  item: 'moosstein',
  rarity: 'common',
  region: 'wald',
  cardId: 'c',
  topicId: 't',
  moduleId: 'm',
  foundAt: '2026-03-10T10:00:00Z',
  foundDay: '2026-03-10',
  ...over,
})

describe('Fundstücke', () => {
  it('Katalog: 36 Stücke, je Region 4/1/1, eindeutige IDs', () => {
    expect(FIND_ITEMS).toHaveLength(36)
    expect(new Set(FIND_ITEMS.map((i) => i.id)).size).toBe(36)
    for (const r of REGIONS) {
      const own = FIND_ITEMS.filter((i) => i.region === r.id)
      expect(own.map((i) => i.rarity).sort()).toEqual(['common', 'common', 'common', 'common', 'legendary', 'rare'])
    }
    expect(itemSize(itemById('waldteich')!)).toBe('large')
    expect(itemSize(itemById('moosstein')!)).toBe('small')
  })

  it('countsForLoot: nur richtig und nur erste Antwort des Lerntags', () => {
    const now = new Date(2026, 2, 10, 10)
    const earlierToday = { ...newSrsState(now), last_review: new Date(2026, 2, 10, 5).toISOString() }
    const yesterday = { ...newSrsState(now), last_review: new Date(2026, 2, 10, 3).toISOString() }
    expect(countsForLoot(undefined, 'right', now)).toBe(true)
    expect(countsForLoot(undefined, 'partial', now)).toBe(true)
    expect(countsForLoot(undefined, 'wrong', now)).toBe(false)
    expect(countsForLoot(earlierToday, 'right', now)).toBe(false)
    expect(countsForLoot(yesterday, 'right', now)).toBe(true)
  })

  it('nextDrops: dritte zählende Antwort, nicht zählende werden übersprungen', () => {
    let run = EMPTY_RUN
    const all: DropKind[] = []
    for (const counts of [true, false, true, false, true]) {
      const r = nextDrops(run, { counts, combo: 1 }, false)
      run = r.run
      all.push(...r.drops)
    }
    expect(all).toEqual(['third'])
  })

  it('nextDrops: ausgeruht bei der vierten, Combo 5 einmal, nie mehr als 3', () => {
    let run = EMPTY_RUN
    const all: DropKind[] = []
    for (let i = 1; i <= 12; i++) {
      const r = nextDrops(run, { counts: true, combo: i }, true)
      run = r.run
      all.push(...r.drops)
    }
    expect(all).toEqual(['third', 'rested', 'combo'])
  })

  it('nextDrops: Combo 5 auf einer nicht zählenden Antwort wartet auf die nächste zählende', () => {
    const a = nextDrops({ counted: 3, given: ['third'] }, { counts: false, combo: 5 }, false)
    expect(a.drops).toEqual([])
    expect(nextDrops(a.run, { counts: true, combo: 6 }, false).drops).toEqual(['combo'])
  })

  it('oddsFor: normal 80/17/3, ausgeruht oder Combo 65/28/7', () => {
    expect(oddsFor('third', false)).toEqual({ common: 0.8, rare: 0.17, legendary: 0.03 })
    expect(oddsFor('third', true)).toEqual({ common: 0.65, rare: 0.28, legendary: 0.07 })
    expect(oddsFor('combo', false)).toEqual({ common: 0.65, rare: 0.28, legendary: 0.07 })
  })

  it('rollFind: erster Wurf Seltenheit, zweiter Wurf Stück der Region', () => {
    expect(rollFind('third', false, 'wald', seq(0.5, 0)).id).toBe('leuchtpilze')
    expect(rollFind('third', false, 'wald', seq(0.5, 0.99)).id).toBe('farn')
    expect(rollFind('third', false, 'wald', seq(0.81, 0)).id).toBe('eulenstatue')
    expect(rollFind('third', false, 'vulkan', seq(0.975, 0)).id).toBe('glutbaum')
    expect(rollFind('combo', false, 'wald', seq(0.94, 0)).id).toBe('waldteich')
  })

  it('isDuplicate und fertilizer: früherer Fund gewinnt, auch bei gleichem Zeitpunkt (nach id)', () => {
    const a = find({ id: 'b', item: 'moosstein' })
    const b = find({ id: 'a', item: 'moosstein' })
    const c = find({ id: 'c', item: 'farn', foundAt: '2026-03-09T10:00:00Z' })
    expect(isDuplicate(a, [a, b, c])).toBe(true)
    expect(isDuplicate(b, [a, b, c])).toBe(false)
    expect(isDuplicate(c, [a, b, c])).toBe(false)
    expect(fertilizer([a, b, c], [])).toBe(1)
    expect(soilSpent([1, 2, 3])).toBe(2 + 6 + 12)
    expect(fertilizer([a, b, c], [1])).toBe(0)
  })

  it('collection: Stück erforscht, sobald ein Fund erforscht ist', () => {
    const st = (over: Partial<FindStatus>): FindStatus => ({ ...find(), opened: true, researchedAt: null, told: false, ...over })
    const owned = collection([
      st({ id: '1', item: 'farn' }),
      st({ id: '2', item: 'farn', researchedAt: '2026-03-11T10:00:00Z' }),
      st({ id: '3', item: 'moosstein' }),
    ])
    expect(owned.get('farn')!.researched).toBe(true)
    expect(owned.get('farn')!.finds).toHaveLength(2)
    expect(owned.get('moosstein')!.researched).toBe(false)
    expect(owned.has('waldteich')).toBe(false)
  })

  it('researchedByState: späterer Lerntag und nicht im Wiederlernen', () => {
    const f = find({ foundDay: '2026-03-10' })
    const reviewed = (at: Date, state: State) => ({ ...newSrsState(at), last_review: at.toISOString(), state })
    expect(researchedByState(f, reviewed(new Date(2026, 2, 11, 3), State.Review))).toBe(false)
    expect(researchedByState(f, reviewed(new Date(2026, 2, 11, 5), State.Review))).toBe(true)
    expect(researchedByState(f, reviewed(new Date(2026, 2, 11, 5), State.Relearning))).toBe(false)
    expect(researchedByState(f, undefined)).toBe(false)
  })

  it('researchedByState: falsche Antwort auf eine Lernkarte am Folgetag erforscht nicht', () => {
    const f = find({ foundDay: '2026-03-10' })
    const day1 = new Date(2026, 2, 10, 12)
    const day2 = new Date(2026, 2, 11, 12)
    const learned = review(newSrsState(day1), Rating.Good, day1, { cardId: 'c' }).state
    expect(researchedByState(f, review(learned, Rating.Again, day2, { cardId: 'c' }).state)).toBe(false)
    expect(researchedByState(f, review(learned, Rating.Good, day2, { cardId: 'c' }).state)).toBe(true)
  })

  it('researchedByModule: nur an einem späteren Tag und wenn ein Thema sitzt', () => {
    const f = find({ foundDay: '2026-03-10' })
    expect(researchedByModule(f, true, new Date(2026, 2, 10, 20))).toBe(false)
    expect(researchedByModule(f, false, new Date(2026, 2, 11, 5))).toBe(false)
    expect(researchedByModule(f, true, new Date(2026, 2, 11, 5))).toBe(true)
  })

  it('researchHint: heute/morgen/in N Tagen, frühestens am Tag nach dem Fund', () => {
    const now = new Date(2026, 2, 10, 10)
    const base = { question: 'Was sind Moose?', moduleName: 'Bio', foundDay: '2026-03-10', now }
    expect(researchHint({ ...base, due: new Date(2026, 2, 10, 12) })).toBe('erforscht, wenn du ‚Was sind Moose?‘ morgen wieder weißt')
    expect(researchHint({ ...base, due: new Date(2026, 2, 13, 12) })).toBe('erforscht, wenn du ‚Was sind Moose?‘ in 3 Tagen wieder weißt')
    expect(researchHint({ ...base, foundDay: '2026-03-08', due: new Date(2026, 2, 9, 12) })).toBe('erforscht, wenn du ‚Was sind Moose?‘ heute wieder weißt')
    expect(researchHint({ ...base, question: null, due: null })).toBe('erforscht, sobald ein Thema aus Bio sicher sitzt')
  })

  it('researchHint: lange Frage wird auf 60 Zeichen gekürzt', () => {
    const hint = researchHint({ question: 'x'.repeat(100), moduleName: 'Bio', due: new Date(2026, 2, 11, 12), foundDay: '2026-03-10', now: new Date(2026, 2, 10, 10) })
    expect(hint).toContain(`‚${'x'.repeat(59)}…‘`)
  })

  it('regionForModule: Region des zugewiesenen Bosses, unbekannt = wald', () => {
    expect(regionForModule('m1', [{ id: 'm1' }], new Map([['m1', 'aschephoenix']]))).toBe('vulkan')
    expect(regionForModule('fehlt', [{ id: 'm1' }])).toBe('wald')
  })
})
