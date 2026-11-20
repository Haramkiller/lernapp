import { useEffect, useState } from 'react'
import type { Battle, Hit } from '../../game/battle'
import { hpPercent } from '../../game/battle'
import { FX, bossBackdrop, bossFrames, fxFrames, type BossAnim, type BossDef, type FxName } from '../../game/bosses'
import { Sprite } from './Sprite'

type Props = {
  boss: BossDef
  name: string
  battle: Battle
  /** Steigt mit jeder gewerteten Antwort; startet die einmaligen Effekte. */
  turn: number
  /** true, solange die Rückmeldung zur letzten Antwort steht; sonst keine Treffer-Effekte. */
  active: boolean
}

const ATTACK_MS = 600

function effectsFor(hit: Hit): FxName[] {
  if (hit.outcome === 'wrong') return ['claw']
  const fx: FxName[] = [hit.tier === 3 ? 'combo3' : hit.tier === 2 ? 'combo2' : 'hit']
  if (hit.crit) fx.push('crit')
  return fx
}

/** Kampfbühne oberhalb der Frage: Kulisse, Boss, Lebensbalken, Treffer. Fängt keine Klicks ab. */
export function Arena({ boss, name, battle, turn, active }: Props) {
  const hit = battle.last
  const [anim, setAnim] = useState<BossAnim>('idle')
  const [attacking, setAttacking] = useState(false)
  const [doneFx, setDoneFx] = useState<string[]>([])

  // Alle Bilder vorladen, damit der erste Treffer nicht leer bleibt oder ruckelt.
  useEffect(() => {
    const all = [bossBackdrop(boss), ...(['idle', 'attack', 'hit'] as const).flatMap((a) => bossFrames(boss, a))]
    for (const f of Object.keys(FX) as FxName[]) all.push(...fxFrames(f))
    for (const src of all) new Image().src = src
  }, [boss])

  useEffect(() => {
    if (turn === 0 || !hit) return
    setDoneFx([])
    setAttacking(false)
    if (hit.outcome === 'wrong') {
      setAnim('attack')
      setAttacking(true)
      const t = setTimeout(() => setAttacking(false), ATTACK_MS)
      return () => clearTimeout(t)
    }
    setAnim(hit.damage > 0 ? 'hit' : 'idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn])

  const percent = hpPercent(battle)
  const show = active && hit !== null && turn > 0
  const effects = show ? effectsFor(hit).filter((f) => !doneFx.includes(f)) : []
  const backToIdle = () => setAnim('idle')

  return (
    <div className={`arena${show && attacking ? ' boss-attacks' : ''}`}>
      <img className="sprite arena-backdrop" src={bossBackdrop(boss)} alt="" draggable={false} />
      <div className="arena-hud">
        <h2 className="boss-name">{name}</h2>
        <div className="row between">
          <div
            className="hp"
            role="progressbar"
            aria-label="Leben des Bosses"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          {battle.phase > 1 && <span className="phase pixel">Phase {battle.phase}</span>}
        </div>
      </div>
      <div className={`boss${anim === 'attack' ? ' lunge' : ''}`}>
        {anim === 'idle' ? (
          <Sprite frames={bossFrames(boss, 'idle')} fps={boss.fps} />
        ) : (
          <Sprite key={`${anim}-${turn}`} frames={bossFrames(boss, anim)} fps={boss.fps + 2} loop={false} onDone={backToIdle} />
        )}
      </div>
      {effects.map((f) => (
        <Sprite
          key={`${f}-${turn}`}
          className={`fx fx-${f}`}
          frames={fxFrames(f)}
          fps={FX[f].fps}
          loop={false}
          onDone={() => setDoneFx((d) => [...d, f])}
        />
      ))}
      {show && hit.damage > 0 && (
        <span key={`dmg-${turn}`} className={`fx-damage pixel${hit.crit ? ' crit' : ''}`} aria-hidden="true">
          -{hit.damage}
        </span>
      )}
      {show && (
        <div className="arena-callouts pixel" aria-live="polite">
          {battle.combo >= 3 && hit.outcome === 'right' && <span className="callout combo">Combo ×{battle.combo}</span>}
          {hit.crit && <span className="callout crit">Kritisch!</span>}
          {hit.lucky && <span className="callout lucky">Glückstreffer!</span>}
          {hit.knockedOut && !battle.finished && <span className="callout phase-up">Er steht wieder auf! Phase {battle.phase}</span>}
        </div>
      )}
    </div>
  )
}
