import type { Module } from '@lernapp/shared'

export type BossAnim = 'idle' | 'attack' | 'hit'
export type BossDef = { id: string; title: string; frames: Record<BossAnim, number>; fps: number }
export type FxName = 'hit' | 'combo2' | 'combo3' | 'crit' | 'claw'

const DEFAULT_FRAMES: Record<BossAnim, number> = { idle: 4, attack: 6, hit: 4 }

/** Erster Vorrat. Bildzahlen entsprechen den Dateien unter public/game/bosses/<id>/. */
export const BOSSES: BossDef[] = [
  { id: 'moosgolem', title: 'Moosgolem', frames: DEFAULT_FRAMES, fps: 8 },
  { id: 'sporenhexe', title: 'Sporenhexe', frames: DEFAULT_FRAMES, fps: 8 },
  { id: 'kristallwaechter', title: 'Kristallwächter', frames: DEFAULT_FRAMES, fps: 8 },
  { id: 'tiefseekraken', title: 'Tiefseekraken', frames: DEFAULT_FRAMES, fps: 8 },
  { id: 'bronzetitan', title: 'Bronzetitan', frames: DEFAULT_FRAMES, fps: 8 },
  { id: 'aschephoenix', title: 'Aschephönix', frames: DEFAULT_FRAMES, fps: 8 },
]

export const FX: Record<FxName, { frames: number; fps: number }> = {
  hit: { frames: 6, fps: 12 },
  combo2: { frames: 6, fps: 12 },
  combo3: { frames: 6, fps: 12 },
  crit: { frames: 6, fps: 12 },
  claw: { frames: 6, fps: 12 },
}

export const UNKNOWN_AREA = 'Unbekanntes Gebiet'

export function gameAsset(path: string): string {
  return `${import.meta.env.BASE_URL}game/${path}`
}

const frameList = (dir: string, count: number) => Array.from({ length: count }, (_, i) => gameAsset(`${dir}_${i}.png`))

export function bossFrames(boss: BossDef, anim: BossAnim): string[] {
  return frameList(`bosses/${boss.id}/${anim}`, boss.frames[anim])
}

export function fxFrames(name: FxName): string[] {
  return frameList(`fx/${name}`, FX[name].frames)
}

export function bossBackdrop(boss: BossDef): string {
  return gameAsset(`bosses/${boss.id}/backdrop.png`)
}

/** FNV-1a, 32 Bit. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/**
 * Feste Zuordnung Modul → Boss: Wunschplatz aus dem Hash der ID, bei Belegung der nächste freie.
 * Unabhängig von der Reihenfolge der Eingabe. (Teil 2 speichert die Wahl dauerhaft.)
 */
export function assignBosses(modules: Pick<Module, 'id'>[]): Map<string, BossDef> {
  const n = BOSSES.length
  const result = new Map<string, BossDef>()
  let taken = new Set<number>()
  for (const { id } of [...modules].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (taken.size === n) taken = new Set()
    let slot = hash(id) % n
    while (taken.has(slot)) slot = (slot + 1) % n
    taken.add(slot)
    result.set(id, BOSSES[slot]!)
  }
  return result
}

export function bossFor(moduleId: string | undefined, modules: Pick<Module, 'id' | 'name'>[]): { boss: BossDef; name: string } {
  const module = modules.find((m) => m.id === moduleId)
  const boss = (module && assignBosses(modules).get(module.id)) ?? BOSSES[0]!
  return { boss, name: `${boss.title} · ${module?.name ?? UNKNOWN_AREA}` }
}
