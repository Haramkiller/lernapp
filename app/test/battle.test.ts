import { describe, expect, it, vi } from 'vitest'
import { RESTED_LUCKY_CHANCE, applyAnswer, defeated, endBattle, hpPercent, startBattle } from '../src/game/battle'

const never = () => 0.99 // kein Glückstreffer
const L = { hp: 40, max: 40 }
/** Richtig, Karte fällt von 10 auf 4. */
const R = { outcome: 'right' as const, elapsedDays: 1, before: 10, after: 4 }

describe('battle', () => {
  it('startet mit gerundetem Leben', () => {
    expect(startBattle(3, { hp: 30.4, max: 40 })).toMatchObject({ startHp: 30, hp: 30, maxHp: 40, combo: 0, secured: 0, finished: false })
  })

  it('Schaden = vorher − nachher, Anzeige sinkt', () => {
    const b = applyAnswer(startBattle(3, L), { ...R, after: 4.4 }, never)
    expect(b.hp).toBe(34)
    expect(b.last!.damage).toBe(6)
    expect(hpPercent(b)).toBe(85)
  })

  it('falsche Antwort: 0 Schaden, Anzeige bleibt, echtes Leben steigt', () => {
    const b = applyAnswer(startBattle(3, { hp: 20, max: 40 }), { outcome: 'wrong', elapsedDays: 1, before: 2, after: 7 }, never)
    expect(b.hp).toBe(20)
    expect(b.last!.damage).toBe(0)
    expect(b.real).toBe(25)
    expect(defeated(b)).toBe(false)
  })

  it('falsche Antwort auf eine neue Karte: trotzdem 0 Schaden (wie mit dem Nutzer vereinbart)', () => {
    const b = applyAnswer(startBattle(3, { hp: 30, max: 30 }), { outcome: 'wrong', elapsedDays: null, before: 10, after: 9.2 }, never)
    expect(b.hp).toBe(30)
    expect(b.last!.damage).toBe(0)
    expect(b.real).toBeCloseTo(29.2)
  })

  it('angezeigte Schäden gehen auf und erreichen 0', () => {
    // Start 10.6 → Anzeige 11; zwei Antworten mit je 5.3 Schaden (einzeln gerundet wären es nur 10).
    let b = startBattle(2, { hp: 10.6, max: 20 })
    b = applyAnswer(b, { outcome: 'right', elapsedDays: 1, before: 5.3, after: 0 }, never)
    const first = b.last!.damage
    b = applyAnswer(b, { outcome: 'right', elapsedDays: 1, before: 5.3, after: 0 }, never)
    expect(first + b.last!.damage).toBe(11)
    expect(b.hp).toBe(0)
    expect(defeated(b)).toBe(true)
  })

  it('fast sicher ist nicht besiegt: Anzeige bleibt bei 1, kein „endgültig besiegt“', () => {
    // Letzte offene Karte endet bei Stabilität 6,8 Tagen: Leben ≈ 0,29, gerundet wäre es 0.
    const b = applyAnswer(startBattle(1, { hp: 10, max: 30 }), { ...R, before: 10, after: 0.29 }, never)
    expect(b.hp).toBe(1)
    expect(b.last!.damage).toBe(9)
    expect(defeated(b)).toBe(false)
  })

  it('Combo, Krit und Glück ändern den Schaden nicht', () => {
    const b = applyAnswer(startBattle(3, L), { ...R, elapsedDays: 7 }, () => 0.05)
    expect(b.last).toMatchObject({ damage: 6, crit: true, lucky: true })
  })

  it('Combo-Stufen 3 und 6, bestCombo; teilweise hält die Combo, falsch setzt sie zurück', () => {
    let b = startBattle(20, { hp: 200, max: 200 })
    const tiers: number[] = []
    for (let i = 0; i < 6; i++) {
      b = applyAnswer(b, R, never)
      tiers.push(b.last!.tier)
    }
    expect(tiers).toEqual([1, 1, 2, 2, 2, 3])
    expect(b.bestCombo).toBe(6)
    b = applyAnswer(b, { ...R, outcome: 'partial' }, never)
    expect(b.combo).toBe(6)
    b = applyAnswer(b, { ...R, outcome: 'wrong' }, never)
    expect(b.combo).toBe(0)
    expect(b.bestCombo).toBe(6)
  })

  it('Krit nur bei Karte, die 7 Tage oder länger nicht gesehen wurde', () => {
    expect(applyAnswer(startBattle(3, L), { ...R, elapsedDays: 6 }, never).last!.crit).toBe(false)
    expect(applyAnswer(startBattle(3, L), { ...R, elapsedDays: null }, never).last!.crit).toBe(false)
  })

  it('secured zählt Karten, die auf 0 fallen', () => {
    let b = applyAnswer(startBattle(3, L), { ...R, before: 3, after: 0 }, never)
    expect(b.last!.secured).toBe(true)
    b = applyAnswer(b, { ...R, before: 0, after: 0 }, never)
    expect(b.last!.secured).toBe(false)
    expect(b.secured).toBe(1)
  })

  it('rng wird bei falsch und teilweise nicht benutzt', () => {
    const rng = vi.fn(() => 0)
    let b = applyAnswer(startBattle(5, L), { ...R, outcome: 'wrong' }, rng)
    b = applyAnswer(b, { ...R, outcome: 'partial' }, rng)
    expect(rng).not.toHaveBeenCalled()
  })

  it('ausgeruht: Glückstreffer schon bei rng 0.2', () => {
    expect(applyAnswer(startBattle(5, L), R, () => 0.2).last!.lucky).toBe(false)
    expect(applyAnswer(startBattle(5, L), R, () => 0.2, RESTED_LUCKY_CHANCE).last!.lucky).toBe(true)
  })

  it('nach der letzten Frage beendet', () => {
    const b = applyAnswer(applyAnswer(startBattle(2, L), R, never), R, never)
    expect(b).toMatchObject({ answered: 2, finished: true, hp: 28 })
  })

  it('Beenden vorzeitig, danach keine Änderung mehr', () => {
    const b = endBattle(applyAnswer(startBattle(4, L), R, never))
    expect(b.finished).toBe(true)
    expect(applyAnswer(b, R, never)).toEqual(b)
  })
})
