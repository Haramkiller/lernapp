import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REGIONS } from '../src/game/bosses'
import { SPECIES_COUNT } from '../src/game/garden'
import {
  CAMP, FOG_IMAGES, GARDEN_SLOTS, dayPhase, GARDEN_VIEWS, MAP_IMAGE, MIN_PLANT_SIZE, REGION_SPOTS, TITLE_IMAGE,
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

describe('Plätze für Fundstücke', () => {
  /** Höhe in % der Kulisse für eine Breite in % (Kulisse 192×256). */
  const tall = (w: number) => w * 0.75
  const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1

  it('10–14 Plätze, eindeutig, jede Sicht hat welche', () => {
    expect(GARDEN_SLOTS.length).toBeGreaterThanOrEqual(10)
    expect(GARDEN_SLOTS.length).toBeLessThanOrEqual(14)
    expect(new Set(GARDEN_SLOTS.map((s) => s.id)).size).toBe(GARDEN_SLOTS.length)
    for (const id of Object.keys(GARDEN_VIEWS)) expect(GARDEN_SLOTS.some((s) => s.view === id), id).toBe(true)
    expect(GARDEN_SLOTS.some((s) => s.size === 'large')).toBe(true)
  })

  it('kein Platz verdeckt Pflanzen oder das Beet-Schild; Nahansicht bleibt zwischen den Blätter-Knöpfen', () => {
    for (const s of GARDEN_SLOTS) {
      const sx0 = s.x - s.w / 2
      const sx1 = s.x + s.w / 2
      const sy0 = s.y - tall(s.w)
      expect(sx0, s.id).toBeGreaterThanOrEqual(0)
      expect(sx1, s.id).toBeLessThanOrEqual(100)
      for (const b of GARDEN_VIEWS[s.view].beds) {
        const near = b.scale === 1
        // Pflanzen wachsen von der Fußlinie nach oben (Größe 28 % × scale).
        const plants = overlap(sx0, sx1, b.x, b.x + b.w) && overlap(sy0, s.y, b.y - tall(28 * b.scale), b.y + b.h)
        const signY = b.y + b.h + (near ? 9 : 4)
        const half = near ? 35 : b.w / 2
        const cx = b.x + b.w / 2
        const sign = overlap(sx0, sx1, cx - half, cx + half) && overlap(sy0, s.y, signY - 3, signY + 3)
        expect(plants, `${s.id} verdeckt Pflanzen`).toBe(false)
        expect(sign, `${s.id} verdeckt das Schild`).toBe(false)
      }
      // Nahansicht: „‹ Beet“/„Beet ›“ liegen unten am Rand (je etwa 25 % breit) – Plätze bleiben dazwischen.
      if (s.view === 'beetL' || s.view === 'beetR') {
        expect(sx0, s.id).toBeGreaterThanOrEqual(26)
        expect(sx1, s.id).toBeLessThanOrEqual(74)
      }
    }
  })
})

describe('Tageszeit', () => {
  it('dayPhase: Grenzen 6, 10, 17, 21 Uhr', () => {
    const at = (h: number, m = 0) => dayPhase(new Date(2026, 0, 1, h, m))
    expect(at(5, 59)).toBe('nacht')
    expect(at(6)).toBe('morgen')
    expect(at(9, 59)).toBe('morgen')
    expect(at(10)).toBe('tag')
    expect(at(16, 59)).toBe('tag')
    expect(at(17)).toBe('abend')
    expect(at(20, 59)).toBe('abend')
    expect(at(21)).toBe('nacht')
    expect(at(0)).toBe('nacht')
  })
})
