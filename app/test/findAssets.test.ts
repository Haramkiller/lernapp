import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FIND_ITEMS } from '../src/game/finds'

describe('Fundstück-Grafiken', () => {
  it('jedes Fundstück und die Truhe haben eine Grafik', () => {
    const dir = join(__dirname, '../public/game/finds')
    for (const { id } of FIND_ITEMS) expect(existsSync(join(dir, `${id}.png`)), id).toBe(true)
    for (const f of ['truhe_zu.png', 'truhe_offen.png']) expect(existsSync(join(dir, f)), f).toBe(true)
  })
})
