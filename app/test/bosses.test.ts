import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BOSSES, FX, REGIONS, assignBosses, bossBackdrop, bossFor, bossFrames, fxFrames, regionOf } from '../src/game/bosses'

const pub = join(__dirname, '../public')
const file = (url: string) => join(pub, url.replace(/^\//, ''))

const mods = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `mod-${i}`, name: `Modul ${i}` }))

describe('bosses', () => {
  it('bis zu 6 Module bekommen verschiedene Bosse', () => {
    const m = assignBosses(mods(6))
    expect(new Set([...m.values()].map((b) => b.id)).size).toBe(6)
  })

  it('Zuordnung hängt nicht von der Reihenfolge ab', () => {
    const a = assignBosses(mods(4))
    const b = assignBosses(mods(4).reverse())
    for (const id of a.keys()) expect(b.get(id)!.id).toBe(a.get(id)!.id)
  })

  it('mehr Module als Bosse: jedes Modul hat trotzdem einen', () => {
    expect(assignBosses(mods(9)).size).toBe(9)
  })

  it('6 Regionen, jede mit genau einem Boss', () => {
    expect(REGIONS.map((r) => r.name)).toEqual(['Wald', 'Sumpf', 'Kristallberge', 'Küste', 'Arena', 'Vulkan'])
    for (const r of REGIONS) expect(BOSSES.filter((b) => b.region === r.id)).toHaveLength(1)
    expect(regionOf(BOSSES.find((b) => b.id === 'aschephoenix')!).name).toBe('Vulkan')
  })

  it('gewählter Boss gewinnt, die anderen meiden ihn', () => {
    const m = assignBosses(mods(3), new Map([['mod-0', 'aschephoenix']]))
    expect(m.get('mod-0')!.id).toBe('aschephoenix')
    expect(m.get('mod-1')!.id).not.toBe('aschephoenix')
    expect(m.get('mod-2')!.id).not.toBe('aschephoenix')
  })

  it('zwei Module wählen denselben Boss: beide bekommen ihn', () => {
    const m = assignBosses(mods(2), new Map([['mod-0', 'sporenhexe'], ['mod-1', 'sporenhexe']]))
    expect(m.get('mod-0')!.id).toBe('sporenhexe')
    expect(m.get('mod-1')!.id).toBe('sporenhexe')
  })

  it('unbekannte Boss-ID oder fremdes Modul in der Wahl: wie ohne Wahl', () => {
    const plain = assignBosses(mods(3))
    const odd = assignBosses(mods(3), new Map([['mod-0', 'gibtsnicht'], ['weg', 'moosgolem']]))
    for (const id of plain.keys()) expect(odd.get(id)!.id).toBe(plain.get(id)!.id)
    const other = BOSSES.find((b) => b.id !== plain.get('mod-1')!.id)!
    expect(bossFor('mod-1', mods(3), new Map([['mod-1', other.id]])).boss.id).toBe(other.id)
  })

  it('Name aus Boss-Titel und Modulname', () => {
    const { boss, name } = bossFor('mod-1', mods(3))
    expect(name).toBe(`${boss.title} · Modul 1`)
  })

  it('unbekanntes oder fehlendes Modul: erster Boss, „Unbekanntes Gebiet“', () => {
    expect(bossFor('weg', mods(2))).toEqual({ boss: BOSSES[0], name: `${BOSSES[0]!.title} · Unbekanntes Gebiet` })
    expect(bossFor(undefined, []).boss).toBe(BOSSES[0])
  })

  it('Bildpfade', () => {
    const b = BOSSES[0]!
    expect(bossFrames(b, 'idle')[0]).toBe(`/game/bosses/${b.id}/idle_0.png`)
    expect(bossFrames(b, 'idle')).toHaveLength(b.frames.idle)
    expect(fxFrames('crit')[1]).toBe('/game/fx/crit_1.png')
  })

  it('alle Bilder des Vorrats liegen in public/game, keine überzähligen', () => {
    for (const b of BOSSES) {
      for (const anim of ['idle', 'attack', 'hit'] as const) {
        for (const f of bossFrames(b, anim)) expect(existsSync(file(f)), f).toBe(true)
        // Ein Bild mehr als eingetragen hieße: die Animation wird abgeschnitten.
        expect(existsSync(file(`/game/bosses/${b.id}/${anim}_${b.frames[anim]}.png`)), `${b.id}/${anim}`).toBe(false)
      }
      expect(existsSync(file(bossBackdrop(b))), bossBackdrop(b)).toBe(true)
    }
    for (const n of Object.keys(FX) as (keyof typeof FX)[]) {
      for (const f of fxFrames(n)) expect(existsSync(file(f)), f).toBe(true)
      expect(existsSync(file(`/game/fx/${n}_${FX[n].frames}.png`)), n).toBe(false)
    }
  })

  it('alle Grafiken zusammen höchstens 4 MB', () => {
    const size = (d: string): number =>
      readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(join(d, e.name)) : statSync(join(d, e.name)).size), 0)
    expect(size(join(pub, 'game'))).toBeLessThanOrEqual(4 * 1024 * 1024)
  })
})
