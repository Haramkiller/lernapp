import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/data/db'
import {
  ALL_MODULES,
  loadAreaChoices,
  loadBossLife,
  loadLastBattleAt,
  loadMilestones,
  recordMilestones,
  saveAreaChoice,
  saveBossLife,
  saveLastBattleAt,
} from '../src/data/game'
import { newMilestones, type BedView } from '../src/game/garden'

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

  it('Boss-Leben: ohne Eintrag null; speichern, laden, Outbox; je Modul getrennt', async () => {
    expect(await loadBossLife('m1')).toBeNull()
    await saveBossLife('m1', 280, T1)
    await saveBossLife(ALL_MODULES, 12, T2)
    expect(await loadBossLife('m1')).toBe(280)
    expect(await loadBossLife(ALL_MODULES)).toBe(12)
    expect(ALL_MODULES).toBe('*')
    const box = await db.outbox.toArray()
    expect(box[0]).toMatchObject({ kind: 'game', payload: { id: 'life:m1', data: { hp: 280 }, updatedAt: T1.toISOString() } })
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

describe('Meilensteine', () => {
  it('schreibt je Eintrag eine Zeile samt Outbox und liest sie zurück', async () => {
    expect(await recordMilestones({ topics: ['t1', 't2'], modules: ['m1'] }, T1)).toBe(3)
    const ms = await loadMilestones()
    expect(ms.securedAt).toEqual(new Map([['t1', T1.toISOString()], ['t2', T1.toISOString()]]))
    expect(ms.defeatedAt).toEqual(new Map([['m1', T1.toISOString()]]))
    expect(await db.outbox.count()).toBe(3)
    expect((await db.outbox.toArray()).map((o) => (o.payload as { id: string }).id).sort()).toEqual(['boss:m1', 'topic:t1', 'topic:t2'])
  })

  it('zweiter Durchlauf über newMilestones schreibt nichts mehr', async () => {
    await recordMilestones({ topics: ['t1'], modules: ['m1'] }, T1)
    const beds = [{ module: { id: 'm1' }, plants: [{ topic: { id: 't1' }, stage: 'bloom' }] }] as unknown as BedView[]
    const again = newMilestones(beds, await loadMilestones())
    expect(again).toEqual({ topics: [], modules: [] })
    expect(await recordMilestones(again, T2)).toBe(0)
    expect(await db.outbox.count()).toBe(2)
  })
})
