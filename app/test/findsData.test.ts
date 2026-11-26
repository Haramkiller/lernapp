import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import { db } from '../src/data/db'
import { checkResearch, loadDesign, loadFinds, markOpened, placeItem, raiseSoil, researchByAnswer, saveFind } from '../src/data/finds'
import { fertilizer, type Find } from '../src/game/finds'
import { newSrsState, type SrsState } from '../src/srs/scheduler'
import { choiceCard } from './ui/fixtures'

const NOW = new Date(2026, 2, 10, 10)

const find = (over: Partial<Find> = {}): Find => ({
  id: 'f',
  item: 'moosstein',
  rarity: 'common',
  region: 'wald',
  cardId: 'a',
  topicId: 't1',
  moduleId: 'm1',
  foundAt: '2026-03-10T09:00:00.000Z',
  foundDay: '2026-03-10',
  ...over,
})

const reviewed = (at: Date, over: Partial<SrsState> = {}): SrsState => ({
  ...newSrsState(at),
  state: State.Review,
  stability: 30,
  last_review: at.toISOString(),
  due: new Date(at.getTime() + 30 * 86_400_000).toISOString(),
  ...over,
})

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('Funde in der Spieltabelle', () => {
  it('saveFind + loadFinds: Fund samt Status; landet in der Outbox', async () => {
    await saveFind(find({ id: 'f1' }))
    await markOpened(['f1'], NOW)
    const [f] = await loadFinds()
    expect(f).toMatchObject({ id: 'f1', item: 'moosstein', opened: true, researchedAt: null, told: false })
    expect((await db.outbox.toArray()).map((e) => e.kind)).toEqual(['game', 'game'])
  })

  it('researchByAnswer: nur Funde dieser Karte von einem früheren Lerntag', async () => {
    await saveFind(find({ id: 'alt', cardId: 'a', foundDay: '2026-03-09' }))
    await saveFind(find({ id: 'heute', cardId: 'a', foundDay: '2026-03-10' }))
    await saveFind(find({ id: 'andere', cardId: 'b', foundDay: '2026-03-09' }))
    expect(await researchByAnswer('a', NOW)).toBe(1)
    const byId = new Map((await loadFinds()).map((f) => [f.id, f.researchedAt]))
    expect(byId.get('alt')).not.toBeNull()
    expect(byId.get('heute')).toBeNull()
    expect(byId.get('andere')).toBeNull()
  })

  it('checkResearch: aus dem Kartenzustand, schon erforschte bleiben unverändert', async () => {
    await db.cards.put(choiceCard('a'))
    await db.states.put({ cardId: 'a', state: reviewed(new Date(2026, 2, 11, 5)), updatedAt: NOW.toISOString() })
    await saveFind(find({ id: 'f1' }))
    const later = new Date(2026, 2, 11, 6)
    expect(await checkResearch(later)).toBe(1)
    const first = (await loadFinds())[0]!.researchedAt
    expect(first).not.toBeNull()
    expect(await checkResearch(new Date(2026, 2, 12, 6))).toBe(0)
    expect((await loadFinds())[0]!.researchedAt).toBe(first)
  })

  it('checkResearch: gelöschte Karte – erforscht, sobald ein Thema des Moduls sicher sitzt', async () => {
    const later = new Date(2026, 2, 11, 10)
    await db.cards.bulkPut([choiceCard('weg', { deleted: true }), choiceCard('b', { topicId: 't2' })])
    await saveFind(find({ id: 'f1', cardId: 'weg' }))
    expect(await checkResearch(later)).toBe(0)
    await db.states.put({ cardId: 'b', state: reviewed(new Date(2026, 2, 11, 9)), updatedAt: later.toISOString() })
    expect(await checkResearch(later)).toBe(1)
  })

  it('Sync-Konflikt: zwei Funde desselben Stücks → einer ist doppelt (1 Dünger)', async () => {
    await saveFind(find({ id: 'x', item: 'farn', foundAt: '2026-03-10T09:00:00.000Z' }))
    await saveFind(find({ id: 'y', item: 'farn', foundAt: '2026-03-10T08:00:00.000Z' }))
    expect(fertilizer(await loadFinds(), [])).toBe(1)
  })

  it('placeItem: Stück zieht um, alter Platz wird leer', async () => {
    let d = await loadDesign()
    await placeItem('gang-links', 'farn', d, NOW)
    d = await loadDesign()
    await placeItem('gang-rechts', 'farn', d, new Date(NOW.getTime() + 1000))
    d = await loadDesign()
    expect([...d.placements]).toEqual([['gang-rechts', 'farn']])
  })

  it('loadDesign: dasselbe Stück auf zwei Plätzen (Sync) → nur der neueste zählt', async () => {
    await db.game.bulkPut([
      { id: 'place:gang-links', data: { item: 'farn' }, updatedAt: '2026-03-10T08:00:00.000Z' },
      { id: 'place:tuer-links', data: { item: 'farn' }, updatedAt: '2026-03-10T09:00:00.000Z' },
    ])
    expect([...(await loadDesign()).placements]).toEqual([['tuer-links', 'farn']])
  })

  it('nach Sync-Konflikt: Platz leeren oder neu belegen holt das Stück nicht auf den alten Platz zurück', async () => {
    const conflict = () =>
      db.game.bulkPut([
        { id: 'place:gang-links', data: { item: 'farn' }, updatedAt: '2026-03-10T08:00:00.000Z' },
        { id: 'place:tuer-links', data: { item: 'farn' }, updatedAt: '2026-03-10T09:00:00.000Z' },
      ])
    await conflict()
    await placeItem('tuer-links', null, await loadDesign(), NOW)
    expect([...(await loadDesign()).placements]).toEqual([])
    await conflict()
    await placeItem('tuer-links', 'moosstein', await loadDesign(), NOW)
    expect([...(await loadDesign()).placements]).toEqual([['tuer-links', 'moosstein']])
  })

  it('loadDesign: Plätze, die es nicht mehr gibt, zählen nicht (Stück wird frei)', async () => {
    await db.game.put({ id: 'place:zurueck-mitte', data: { item: 'waldteich' }, updatedAt: '2026-03-10T08:00:00.000Z' })
    expect([...(await loadDesign()).placements]).toEqual([])
  })

  it('raiseSoil: kostet 2/4/6 Dünger, zu wenig wirft', async () => {
    await saveFind(find({ id: '1', item: 'farn', foundAt: '2026-03-10T07:00:00.000Z' }))
    await saveFind(find({ id: '2', item: 'farn', foundAt: '2026-03-10T08:00:00.000Z' }))
    await saveFind(find({ id: '3', item: 'farn', foundAt: '2026-03-10T09:00:00.000Z' }))
    expect(await raiseSoil('m1', NOW)).toBe(1)
    await expect(raiseSoil('m1', NOW)).rejects.toThrow('Nicht genug Dünger')
    expect((await loadDesign()).soil.get('m1')).toBe(1)
  })
})
