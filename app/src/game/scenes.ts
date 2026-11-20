import { gameAsset, type RegionId } from './bosses'

/** Titelbild (192×256, Hochformat). Der Name kommt als Text darüber. */
export const TITLE_IMAGE = gameAsset('title.png')

/**
 * Waldplatz mit Feuerstelle. Das Feuer ist eine Schleife aus Einzelbildern, deren Mitte der Fuß
 * der Flammen ist; x/y = Mitte in % der Kulisse, width = Breite in % der Kulisse.
 */
export const CAMP = {
  backdrop: gameAsset('camp/backdrop.png'),
  fire: { frames: 8, fps: 10, x: 50, y: 86.5, width: 25 },
}

export function fireFrames(): string[] {
  return Array.from({ length: CAMP.fire.frames }, (_, i) => gameAsset(`camp/fire_${i}.png`))
}

/** Gemalte Karte (192×256) mit den 6 Landschaften. */
export const MAP_IMAGE = gameAsset('map/map.png')

/** Mitte der gemalten Landschaft je Region in % der Karte: Platz für Fähnchen bzw. Nebel. */
export const REGION_SPOTS: Record<RegionId, { x: number; y: number }> = {
  wald: { x: 24, y: 17 },
  sumpf: { x: 76, y: 16 },
  kristallberge: { x: 25, y: 41 },
  kueste: { x: 78, y: 44 },
  arena: { x: 22, y: 80 },
  vulkan: { x: 78, y: 82 },
}

export function regionIcon(id: RegionId): string {
  return gameAsset(`map/${id}.png`)
}

/** Zwei Nebelwolken, abwechselnd über unentdeckten Regionen. */
export const FOG_IMAGES = [gameAsset('map/fog_0.png'), gameAsset('map/fog_1.png')]
