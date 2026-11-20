import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BOSSES, FX, assignBosses, bossBackdrop, bossFor, bossFrames, fxFrames } from '../src/game/bosses'

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
