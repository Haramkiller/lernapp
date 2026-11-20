import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/data/db'
import { loadAreaChoices, loadLastBattleAt, saveAreaChoice, saveLastBattleAt } from '../src/data/game'

const T1 = new Date('2026-03-10T10:00:00Z')
const T2 = new Date('2026-03-10T11:00:00Z')

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('Spieldaten', () => {
  it('gewähltes Gebiet: speichern, laden, Outbox-Eintrag', async () => {
    await saveAreaChoice('m1', 'sporenhexe', T1)
    expect(await loadAreaChoices()).toEqual(new Map([['m1', 'sporenhexe']]))
    const box = await db.outbox.toArray()
    expect(box).toHaveLength(1)
    expect(box[0]).toMatchObject({ kind: 'game', payload: { id: 'area:m1', data: { bossId: 'sporenhexe' }, updatedAt: T1.toISOString() } })
  })

  it('„automatisch“ entfernt die Wahl', async () => {
    await saveAreaChoice('m1', 'sporenhexe', T1)
    await saveAreaChoice('m1', null, T2)
    expect(await loadAreaChoices()).toEqual(new Map())
  })

  it('letzter Kampf: ohne Eintrag null, sonst der gespeicherte Zeitpunkt', async () => {
    expect(await loadLastBattleAt()).toBeNull()
    await saveLastBattleAt(T2)
    expect((await loadLastBattleAt())?.toISOString()).toBe(T2.toISOString())
  })
})
