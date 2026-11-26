import type { Module } from '@lernapp/shared'

export type BossAnim = 'idle' | 'attack' | 'hit'
export type RegionId = 'wald' | 'sumpf' | 'kristallberge' | 'kueste' | 'arena' | 'vulkan'
export type RegionDef = { id: RegionId; name: string }
export type BossDef = { id: string; title: string; region: RegionId; frames: Record<BossAnim, number>; fps: number }
/** Gewähltes Gebiet je Modul: moduleId → bossId. */
export type AreaChoices = Map<string, string>

/** Reihenfolge = Reihenfolge auf der Karte. Jede Region ist die Heimat genau eines Bosses. */
export const REGIONS: RegionDef[] = [
  { id: 'wald', name: 'Wald' },
  { id: 'sumpf', name: 'Sumpf' },
  { id: 'kristallberge', name: 'Kristallberge' },
  { id: 'kueste', name: 'Küste' },
  { id: 'arena', name: 'Arena' },
  { id: 'vulkan', name: 'Vulkan' },
]
export type FxName = 'hit' | 'combo2' | 'combo3' | 'crit' | 'claw'

// PixelLab v3: je Animation das Ausgangsbild plus 4 bzw. 6 bewegte Bilder.
const DEFAULT_FRAMES: Record<BossAnim, number> = { idle: 5, attack: 7, hit: 5 }

/** Erster Vorrat. Bildzahlen entsprechen den Dateien unter public/game/bosses/<id>/. */
export const BOSSES: BossDef[] = [
  { id: 'moosgolem', title: 'Moosgolem', region: 'wald', frames: DEFAULT_FRAMES, fps: 8 },
  { id: 'sporenhexe', title: 'Sporenhexe', region: 'sumpf', frames: DEFAULT_FRAMES, fps: 8 },
  { id: 'kristallwaechter', title: 'Kristallwächter', region: 'kristallberge', frames: DEFAULT_FRAMES, fps: 8 },
  { id: 'tiefseekraken', title: 'Tiefseekraken', region: 'kueste', frames: DEFAULT_FRAMES, fps: 8 },
  { id: 'bronzetitan', title: 'Bronzetitan', region: 'arena', frames: DEFAULT_FRAMES, fps: 8 },
  { id: 'aschephoenix', title: 'Aschephönix', region: 'vulkan', frames: DEFAULT_FRAMES, fps: 8 },
]

export const FX: Record<FxName, { frames: number; fps: number }> = {
  hit: { frames: 8, fps: 16 },
  combo2: { frames: 12, fps: 16 },
  combo3: { frames: 15, fps: 16 },
  crit: { frames: 12, fps: 16 },
  claw: { frames: 8, fps: 16 },
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

export function regionOf(boss: BossDef): RegionDef {
  return REGIONS.find((r) => r.id === boss.region)!
}

/**
 * Zuordnung Modul → Boss: gültige Wahl zuerst, sonst Wunschplatz aus dem Hash der ID, bei Belegung
 * der nächste freie. Unabhängig von der Reihenfolge der Eingabe.
 */
export function assignBosses(modules: Pick<Module, 'id'>[], chosen: AreaChoices = new Map()): Map<string, BossDef> {
  const n = BOSSES.length
  const result = new Map<string, BossDef>()
  let taken = new Set<number>()
  const rest: Pick<Module, 'id'>[] = []
  for (const m of modules) {
    const slot = BOSSES.findIndex((b) => b.id === chosen.get(m.id))
    if (slot === -1) rest.push(m)
    else {
      taken.add(slot)
      result.set(m.id, BOSSES[slot]!)
    }
  }
  for (const { id } of rest.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (taken.size === n) taken = new Set()
    let slot = hash(id) % n
    while (taken.has(slot)) slot = (slot + 1) % n
    taken.add(slot)
    result.set(id, BOSSES[slot]!)
  }
  return result
}

export function bossFor(
  moduleId: string | undefined,
  modules: Pick<Module, 'id' | 'name'>[],
  chosen?: AreaChoices,
): { boss: BossDef; name: string } {
  const module = modules.find((m) => m.id === moduleId)
  const boss = (module && assignBosses(modules, chosen).get(module.id)) ?? BOSSES[0]!
  return { boss, name: `${boss.title} · ${module?.name ?? UNKNOWN_AREA}` }
}

/** Region des Bosses, dem das Modul zugewiesen ist; unbekanntes Modul: Wald. */
export function regionForModule(moduleId: string, modules: Pick<Module, 'id'>[], chosen?: AreaChoices): RegionId {
  return assignBosses(modules, chosen).get(moduleId)?.region ?? 'wald'
}
