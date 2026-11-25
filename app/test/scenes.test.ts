import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REGIONS } from '../src/game/bosses'
import { SPECIES_COUNT } from '../src/game/garden'
import {
  CAMP, FOG_IMAGES, GARDEN_VIEWS, MAP_IMAGE, MIN_PLANT_SIZE, REGION_SPOTS, TITLE_IMAGE,
  fireFrames, insectFrames, plantImage, regionIcon, slotPositions, treeImage, type ViewId,
} from '../src/game/scenes'

const pub = join(__dirname, '../public')
const file = (url: string) => join(pub, url.replace(/^\//, ''))

describe('Szenen-Grafiken', () => {
  it('alle Dateien liegen in public/game', () => {
    for (const f of [TITLE_IMAGE, CAMP.backdrop, MAP_IMAGE, ...FOG_IMAGES, ...fireFrames(), ...REGIONS.map((r) => regionIcon(r.id))]) {
      expect(existsSync(file(f)), f).toBe(true)
    }
  })

  it('kein überzähliges Feuerbild', () => {
    expect(fireFrames()).toHaveLength(CAMP.fire.frames)
    expect(existsSync(file(`/game/camp/fire_${CAMP.fire.frames}.png`))).toBe(false)
  })

  it('jede Region hat einen Platz auf der Karte', () => {
    for (const r of REGIONS) {
      const s = REGION_SPOTS[r.id]
      expect(s.x, r.id).toBeGreaterThan(0)
      expect(s.x, r.id).toBeLessThan(100)
      expect(s.y, r.id).toBeGreaterThan(0)
      expect(s.y, r.id).toBeLessThan(100)
    }
  })
})

describe('Gewächshaus', () => {
  const ids = Object.keys(GARDEN_VIEWS) as ViewId[]

  it('jede Kante zeigt auf eine vorhandene Ansicht, alle sind von „gang“ erreichbar', () => {
    for (const id of ids) for (const to of Object.values(GARDEN_VIEWS[id].moves)) expect(ids, `${id} → ${to}`).toContain(to)
    const seen = new Set<ViewId>(['gang'])
    const todo: ViewId[] = ['gang']
    while (todo.length) {
      for (const to of Object.values(GARDEN_VIEWS[todo.pop()!].moves)) {
        if (to && !seen.has(to)) {
          seen.add(to)
          todo.push(to)
        }
      }
    }
    expect([...seen].sort()).toEqual([...ids].sort())
  })

  it('Navigation wie im Rundgang', () => {
    expect(GARDEN_VIEWS.gang.moves).toEqual({ forward: 'tuer', left: 'beetL', right: 'beetR' })
    expect(GARDEN_VIEWS.tuer).toMatchObject({ door: true, moves: { back: 'zurueck' } })
    expect(GARDEN_VIEWS.zurueck.moves).toEqual({ forward: 'gang', left: 'beetR', right: 'beetL' })
    expect(GARDEN_VIEWS.beetR).toMatchObject({ mirror: true, image: GARDEN_VIEWS.beetL.image, moves: { back: 'gang' } })
  })

  it('Beet-Plätze: höchstens max, innerhalb der Fläche, nie zu klein, bei vielen kleiner', () => {
    for (const id of ids) {
      for (const area of GARDEN_VIEWS[id].beds) {
        for (const count of [0, 1, 3, 30]) {
          const slots = slotPositions(area, count)
          expect(slots).toHaveLength(Math.min(count, area.max))
          for (const s of slots) {
            expect(s.x).toBeGreaterThanOrEqual(area.x)
            expect(s.x).toBeLessThanOrEqual(area.x + area.w)
            expect(s.y).toBeGreaterThanOrEqual(area.y)
            expect(s.y).toBeLessThanOrEqual(area.y + area.h)
            expect(s.size).toBeGreaterThanOrEqual(MIN_PLANT_SIZE)
          }
        }
      }
    }
    const near = GARDEN_VIEWS.beetL.beds[0]!
    expect(slotPositions(near, 30)[0]!.size).toBeLessThan(slotPositions(near, 3)[0]!.size)
    expect(MIN_PLANT_SIZE).toBeCloseTo((32 / 375) * 100)
  })

  it('Saat und Sämling sind für alle Arten dasselbe Bild; alle Bilder liegen bereit', () => {
    expect(new Set(Array.from({ length: SPECIES_COUNT }, (_, i) => plantImage(i, 'sprout'))).size).toBe(1)
    const stages = ['seed', 'sprout', 'young', 'bloom', 'wilted'] as const
    const all = [
      ...Array.from({ length: SPECIES_COUNT }, (_, i) => stages.map((st) => plantImage(i, st))).flat(),
      treeImage('bloom'),
      treeImage('wilted'),
      ...insectFrames('butterfly'),
      ...insectFrames('bee'),
      ...ids.map((id) => GARDEN_VIEWS[id].image),
    ]
    for (const f of all) expect(existsSync(file(f)), f).toBe(true)
  })
})
