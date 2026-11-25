// @vitest-environment jsdom
import './setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Arena } from '../../src/ui/game/Arena'
import { BOSSES, bossBackdrop, bossFrames, fxFrames } from '../../src/game/bosses'
import { applyAnswer, startBattle } from '../../src/game/battle'

const boss = BOSSES[0]!
const never = () => 0.99

afterEach(() => vi.unstubAllGlobals())

describe('Arena', () => {
  it('richtige Antwort kurz nach einer falschen: kein Boss-Angriff mehr', () => {
    const L = { hp: 30, max: 30 }
    const afterWrong = applyAnswer(startBattle(3, L), { outcome: 'wrong', elapsedDays: null, before: 10, after: 10 }, never)
    const { container, rerender } = render(<Arena boss={boss} name="X" battle={afterWrong} turn={1} active />)
    expect(container.querySelector('.arena')).toHaveClass('boss-attacks')
    rerender(<Arena boss={boss} name="X" battle={afterWrong} turn={1} active={false} />)
    const afterRight = applyAnswer(afterWrong, { outcome: 'right', elapsedDays: null, before: 10, after: 4 }, never)
    rerender(<Arena boss={boss} name="X" battle={afterRight} turn={2} active />)
    expect(container.querySelector('.arena')).not.toHaveClass('boss-attacks')
  })

  it('lädt beim Start alle Bilder des Bosses und alle Effekte vor', () => {
    const loaded: string[] = []
    vi.stubGlobal(
      'Image',
      class {
        set src(v: string) {
          loaded.push(v)
        }
      },
    )
    render(<Arena boss={boss} name="X" battle={startBattle(3, { hp: 30, max: 30 })} turn={0} active={false} recovery={null} />)
    for (const f of [...bossFrames(boss, 'attack'), ...bossFrames(boss, 'hit'), ...fxFrames('combo3'), ...fxFrames('claw'), bossBackdrop(boss)]) {
      expect(loaded).toContain(f)
    }
  })
})
