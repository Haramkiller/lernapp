import { gameAsset, type RegionId } from './bosses'
import type { PlantStage } from './garden'

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

/* ---------------- Gewächshaus ---------------- */

export type ViewId = 'gang' | 'tuer' | 'zurueck' | 'beetL' | 'beetR'
export type Move = 'forward' | 'left' | 'right' | 'back'
/**
 * Beet-Fläche in % der Kulisse: x/w waagerecht, y = Fußlinie der hinteren Reihe, y + h = vordere Reihe.
 * `scale` = Pflanzengröße relativ zur Nahansicht, `max` = höchstens so viele Pflanzen sichtbar.
 */
export type BedArea = { side: 'left' | 'right'; x: number; y: number; w: number; h: number; scale: number; max: number }
export type GardenView = { image: string; mirror?: boolean; name: string; moves: Partial<Record<Move, ViewId>>; door?: boolean; beds: BedArea[] }

/** 32 px Trefferfläche bei 375 px Breite. */
export const MIN_PLANT_SIZE = (32 / 375) * 100
/** Pflanzenbreite in der Nahansicht (% der Kulisse). */
const NEAR_SIZE = 28

const view = (name: string) => gameAsset(`garden/views/${name}.png`)
/** Fernansichten: je Seite das hintere, ganz sichtbare Beet (ausgemessen an gang.png / zurueck.png). */
const farBeds: BedArea[] = [
  { side: 'left', x: 8, y: 60, w: 27, h: 4, scale: 0.45, max: 6 },
  { side: 'right', x: 65, y: 60, w: 27, h: 4, scale: 0.45, max: 6 },
]
const nearBed: BedArea[] = [{ side: 'left', x: 13, y: 67, w: 74, h: 5, scale: 1, max: 12 }]

export const GARDEN_VIEWS: Record<ViewId, GardenView> = {
  gang: { image: view('gang'), name: 'Eingang', moves: { forward: 'tuer', left: 'beetL', right: 'beetR' }, beds: farBeds },
  tuer: { image: view('tuer'), name: 'An der Tür', door: true, moves: { back: 'zurueck' }, beds: [] },
  zurueck: {
    image: view('zurueck'),
    name: 'Blick zurück',
    moves: { forward: 'gang', left: 'beetR', right: 'beetL' },
    // Umgedreht: das rechte Beet liegt jetzt links.
    beds: farBeds.map((b) => ({ ...b, side: b.side === 'left' ? 'right' : 'left' })),
  },
  beetL: { image: view('beet'), name: 'Beet links', moves: { back: 'gang' }, beds: nearBed },
  beetR: { image: view('beet'), mirror: true, name: 'Beet rechts', moves: { back: 'gang' }, beds: nearBed.map((b) => ({ ...b, side: 'right' })) },
}

/**
 * Plätze für Fundstücke je Blickpunkt (Fußpunkt x/y und Breite w in % der Kulisse). Große Plätze nehmen auch
 * legendäre Stücke. Gespiegelte Blickpunkte haben eigene Plätze.
 */
export type GardenSlot = { id: string; view: ViewId; x: number; y: number; w: number; size: 'small' | 'large' }

export const GARDEN_SLOTS: GardenSlot[] = [
  { id: 'gang-mitte', view: 'gang', x: 50, y: 84, w: 26, size: 'large' },
  { id: 'gang-links', view: 'gang', x: 33, y: 96, w: 12, size: 'small' },
  { id: 'gang-rechts', view: 'gang', x: 67, y: 96, w: 12, size: 'small' },
  { id: 'zurueck-mitte', view: 'zurueck', x: 50, y: 84, w: 26, size: 'large' },
  { id: 'zurueck-links', view: 'zurueck', x: 33, y: 96, w: 12, size: 'small' },
  { id: 'zurueck-rechts', view: 'zurueck', x: 67, y: 96, w: 12, size: 'small' },
  { id: 'tuer-links', view: 'tuer', x: 18, y: 88, w: 14, size: 'small' },
  { id: 'tuer-rechts', view: 'tuer', x: 82, y: 88, w: 14, size: 'small' },
  { id: 'beetL-links', view: 'beetL', x: 36, y: 97, w: 13, size: 'small' },
  { id: 'beetL-rechts', view: 'beetL', x: 64, y: 97, w: 13, size: 'small' },
  { id: 'beetR-links', view: 'beetR', x: 36, y: 97, w: 13, size: 'small' },
  { id: 'beetR-rechts', view: 'beetR', x: 64, y: 97, w: 13, size: 'small' },
]

export function plantImage(species: number, stage: PlantStage): string {
  if (stage === 'seed' || stage === 'sprout') return gameAsset(`garden/plants/${stage}.png`)
  return gameAsset(`garden/plants/p${species}_${stage}.png`)
}

export function treeImage(state: 'bloom' | 'wilted'): string {
  return gameAsset(`garden/plants/tree_${state}.png`)
}

export function insectFrames(kind: 'butterfly' | 'bee'): string[] {
  return Array.from({ length: 4 }, (_, i) => gameAsset(`garden/insects/${kind}_${i}.png`))
}

/** Verteilt bis zu `area.max` Pflanzen in 1–2 Reihen; die hintere Reihe ist um eine halbe Lücke versetzt. */
export function slotPositions(area: BedArea, count: number): { x: number; y: number; size: number }[] {
  const n = Math.min(count, area.max)
  if (n === 0) return []
  const rows = n > Math.ceil(area.max / 2) ? 2 : 1
  const perRow = Math.ceil(n / rows)
  const gap = area.w / perRow
  const size = Math.max(MIN_PLANT_SIZE, Math.min(NEAR_SIZE * area.scale, gap * 1.8))
  return Array.from({ length: n }, (_, i) => {
    const row = rows === 2 ? Math.floor(i / perRow) : 0
    const col = i - row * perRow
    const shift = rows === 2 && row === 0 ? 0.25 : rows === 2 ? -0.25 : 0
    return { x: area.x + (col + 0.5 + shift) * gap, y: area.y + (rows === 2 ? row * area.h : area.h / 2), size }
  })
}

export type DayPhase = 'morgen' | 'tag' | 'abend' | 'nacht'

/** Tageszeit nach der Geräteuhr: Morgen 6–10, Tag 10–17, Abend 17–21, Nacht 21–6 Uhr. */
export function dayPhase(d: Date): DayPhase {
  const h = d.getHours()
  return h >= 6 && h < 10 ? 'morgen' : h >= 10 && h < 17 ? 'tag' : h >= 17 && h < 21 ? 'abend' : 'nacht'
}

/** Feste Plätze für Glühwürmchen (nachts) in % der Kulisse. */
export const FIREFLIES = [
  { x: 18, y: 38, d: 0 },
  { x: 72, y: 30, d: -1.3 },
  { x: 44, y: 46, d: -2.7 },
  { x: 86, y: 52, d: -0.6 },
  { x: 30, y: 58, d: -3.4 },
  { x: 60, y: 24, d: -2.1 },
]
