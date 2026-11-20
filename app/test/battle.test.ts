import { describe, expect, it, vi } from 'vitest'
import { applyAnswer, endBattle, hpPercent, startBattle } from '../src/game/battle'

const never = () => 0.99 // kein Glückstreffer
const R = { outcome: 'right' as const, elapsedDays: 1 }

describe('battle', () => {
  it('startet mit 10 Leben je Frage', () => {
    expect(startBattle(3)).toMatchObject({ hp: 30, maxHp: 30, phase: 1, combo: 0, finished: false })
  })

  it('richtig trifft mit 10, ab Combo 3 mit 13, ab Combo 6 mit 16', () => {
    let b = startBattle(20)
    const dmg: number[] = []
    for (let i = 0; i < 6; i++) {
      b = applyAnswer(b, R, never)
      dmg.push(b.last!.damage)
    }
    expect(dmg).toEqual([10, 10, 13, 13, 13, 16])
    expect(b.last!.tier).toBe(3)
    expect(b.bestCombo).toBe(6)
  })

  it('Krit bei Karte, die 7 Tage oder länger nicht gesehen wurde; neue Karte nie', () => {
    expect(applyAnswer(startBattle(5), { outcome: 'right', elapsedDays: 7 }, never).last).toMatchObject({ damage: 20, crit: true })
    expect(applyAnswer(startBattle(5), { outcome: 'right', elapsedDays: 6 }, never).last!.crit).toBe(false)
    expect(applyAnswer(startBattle(5), { outcome: 'right', elapsedDays: null }, never).last!.crit).toBe(false)
  })

  it('Glückstreffer +5 bei rng < 0.1', () => {
    expect(applyAnswer(startBattle(5), R, () => 0.05).last).toMatchObject({ damage: 15, lucky: true })
  })

  it('rng wird bei falsch und teilweise nicht benutzt', () => {
    const rng = vi.fn(() => 0)
    let b = applyAnswer(startBattle(5), { outcome: 'wrong', elapsedDays: 9 }, rng)
    b = applyAnswer(b, { outcome: 'partial', elapsedDays: 9 }, rng)
    expect(rng).not.toHaveBeenCalled()
  })

  it('teilweise: 5 Schaden, Combo bleibt; falsch: 0 Schaden, Combo weg', () => {
    let b = applyAnswer(applyAnswer(startBattle(9), R, never), R, never)
    b = applyAnswer(b, { outcome: 'partial', elapsedDays: 1 }, never)
    expect(b.last!.damage).toBe(5)
    expect(b.combo).toBe(2)
    b = applyAnswer(b, { outcome: 'wrong', elapsedDays: 1 }, never)
    expect(b.last!.damage).toBe(0)
    expect(b.combo).toBe(0)
  })

  it('besiegt, wenn die letzte Antwort ihn auf 0 bringt', () => {
    const b = applyAnswer(applyAnswer(startBattle(2), R, never), R, never)
    expect(b).toMatchObject({ hp: 0, finished: true, defeated: true })
  })

  it('k.o. vor der letzten Frage: nächste Phase mit 10 Leben je offener Frage', () => {
    let b = applyAnswer(startBattle(3), { outcome: 'right', elapsedDays: 30 }, never) // 20
    b = applyAnswer(b, R, never) // 10 → 0, eine Frage offen
    expect(b.last!.knockedOut).toBe(true)
    expect(b).toMatchObject({ phase: 2, hp: 10, maxHp: 10, finished: false })
    b = applyAnswer(b, { outcome: 'wrong', elapsedDays: 1 }, never)
    // Einmal zu Boden geschickt zählt als besiegt, auch wenn die letzte Antwort danebenging.
    expect(b).toMatchObject({ finished: true, defeated: true, knockouts: 1 })
  })

  it('fast perfekter Kampf (nur die letzte falsch) endet nicht mit „Geflohen“', () => {
    let b = startBattle(25)
    for (let i = 0; i < 24; i++) b = applyAnswer(b, R, never)
    b = applyAnswer(b, { outcome: 'wrong', elapsedDays: 1 }, never)
    expect(b.defeated).toBe(true)
    expect(b.knockouts).toBeGreaterThan(1)
  })

  it('nie zu Boden geschickt: geflohen', () => {
    let b = startBattle(3)
    for (let i = 0; i < 3; i++) b = applyAnswer(b, { outcome: 'partial', elapsedDays: 1 }, never)
    expect(b).toMatchObject({ finished: true, defeated: false, knockouts: 0 })
  })

  it('Beenden nach einem k.o.: besiegt', () => {
    let b = applyAnswer(startBattle(3), { outcome: 'right', elapsedDays: 30 }, never)
    b = applyAnswer(b, R, never)
    expect(endBattle(b).defeated).toBe(true)
  })

  it('Beenden: geflohen, danach keine Änderung mehr', () => {
    const b = endBattle(applyAnswer(startBattle(4), R, never))
    expect(b).toMatchObject({ finished: true, defeated: false })
    expect(hpPercent(b)).toBe(75)
    expect(applyAnswer(b, R, never)).toEqual(b)
  })
})
