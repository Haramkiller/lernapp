import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REGIONS } from '../src/game/bosses'
import { CAMP, FOG_IMAGES, MAP_IMAGE, REGION_SPOTS, TITLE_IMAGE, fireFrames, regionIcon } from '../src/game/scenes'

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
