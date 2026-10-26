import type { Dial } from './dial'
import { createHarborLevels } from './harborLevels'
import { createLabLevels } from './labLevels'
import { createMillLevels } from './millLevels'
import { createRailwayLevels } from './railwayLevels'
import type { StageId } from './stage'
import { createVillageLevels } from './villageLevels'

export type ScrewColor = 'coral' | 'mint' | 'blue' | 'amber' | 'pearl'
export type Point3 = readonly [number, number, number]

export const COLORS: Record<ScrewColor, { name: string, hex: string }> = {
  coral: { name: 'Coral', hex: '#ed775c' },
  mint: { name: 'Mint', hex: '#50b49b' },
  blue: { name: 'Blue', hex: '#598dda' },
  amber: { name: 'Amber', hex: '#d9a132' },
  // The fifth color, from level 18: clear of every other color for common color-vision differences.
  pearl: { name: 'Pearl', hex: '#ece6d6' },
}

export interface Plate {
  id: string
  name: string
  position: Point3
  size: readonly [number, number]
  normal: Point3
  up: Point3
  translucent?: boolean
  gableRise?: number
  /** A shaped panel's outline in local X/Y, inside `size`; otherwise a rounded rectangle. */
  outline?: readonly (readonly [number, number])[]
  /** Plates this one rests on; their last screw stays locked while this plate is attached. */
  restsOn?: readonly string[]
  /** A captive panel: with its screws gone it swings open on this edge and stays with its host. */
  hinge?: 'left' | 'right' | 'top' | 'bottom'
  /** How far a hinged panel swings, in radians; a drop flap turns π to hang below its hinge. */
  hingeAngle?: number
  /** A captive shutter: with its screws gone it drops `travel` along `along` (downhill, world) to a stop. */
  rail?: { along: Point3, travel: number }
  /** The part a hinged or railed panel, or a dial, stays with once open; it falls when that part does. */
  host?: string
  /** A disc that turns over the screws behind it; it has no screws of its own and stays with its host. */
  dial?: Dial
  finish: 'front' | 'back' | 'side' | 'roof' | 'brace' | 'sail' | 'glass' | 'glass-wall' | 'glass-roof' | 'awning' | 'sign'
    | 'wheel' | 'plank' | 'beam' | 'guard' | 'rack' | 'hull' | 'stone' | 'dial' | 'loco' | 'lacquer'
  color: string
}

export interface Screw {
  id: string
  /** The plate the head sits on; `position` is in its local X/Y. */
  plate: string
  /** Plates behind the head that the same screw also pins, outermost first. */
  through?: readonly string[]
  color: ScrewColor
  blockedBy?: readonly string[]
  /** Captive panels that lie over this head once they open, until the part they hang on comes off. */
  coveredWhenOpen?: readonly string[]
  /** A head behind a dial, at this slot round it: it can be reached only while a window is over the slot. */
  underDial?: { dial: string, slot: number }
  position: readonly [number, number]
}

/** Every plate a screw holds: its head plate, then any it passes through. */
export function heldPlates(screw: Screw): readonly string[] {
  return screw.through ? [screw.plate, ...screw.through] : [screw.plate]
}

const roofLength = Math.hypot(2.1, 1.35)
const roofSin = 1.35 / roofLength
const roofCos = 2.1 / roofLength

/** The gable walls carry the roof; the side walls are infill and bear nothing. */
const GABLES = ['front', 'back'] as const

/** Local X/Y describe each panel; its normal points toward the screw heads. */
export const PLATES: readonly Plate[] = [
  { id: 'front', name: 'Front gable wall', position: [0, -0.25, 1.25], size: [3.6, 2.6], normal: [0, 0, 1], up: [0, 1, 0], gableRise: 1.15, finish: 'front', color: '#f2dfbc' },
  { id: 'back', name: 'Back gable wall', position: [0, -0.25, -1.25], size: [3.6, 2.6], normal: [0, 0, -1], up: [0, 1, 0], gableRise: 1.15, finish: 'back', color: '#efdbb7' },
  { id: 'left', name: 'Left wall', position: [-1.8, -0.25, 0], size: [2.5, 2.6], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'side', color: '#e9d3ad' },
  { id: 'right', name: 'Right wall', position: [1.8, -0.25, 0], size: [2.5, 2.6], normal: [1, 0, 0], up: [0, 1, 0], finish: 'side', color: '#f2dfbc' },
  { id: 'left-roof', name: 'Left roof slope', position: [-1.05, 1.6, 0], size: [3.05, roofLength], normal: [-roofSin, roofCos, 0], up: [roofCos, roofSin, 0], restsOn: GABLES, finish: 'roof', color: '#a95145' },
  { id: 'right-roof', name: 'Right roof slope', position: [1.05, 1.6, 0], size: [3.05, roofLength], normal: [roofSin, roofCos, 0], up: [-roofCos, roofSin, 0], restsOn: GABLES, finish: 'roof', color: '#b6614e' },
]

export const SCREWS: readonly Screw[] = [
  { id: 'front-1', plate: 'front', color: 'coral', position: [-1.28, 0.82] },
  { id: 'front-2', plate: 'front', color: 'mint', position: [1.28, 0.82] },
  { id: 'back-1', plate: 'back', color: 'blue', position: [0, 0.75] },
  { id: 'left-1', plate: 'left', color: 'coral', position: [-0.7, 0.65] },
  { id: 'right-1', plate: 'right', color: 'mint', position: [-0.7, 0.65] },
  { id: 'left-roof-1', plate: 'left-roof', color: 'mint', position: [-0.65, -0.25] },
  { id: 'left-roof-2', plate: 'left-roof', color: 'blue', position: [0.65, 0.35] },
  { id: 'right-roof-1', plate: 'right-roof', color: 'blue', position: [-0.65, -0.25] },
  { id: 'right-roof-2', plate: 'right-roof', color: 'coral', position: [0.65, 0.35] },
]

export const SPARE_CAPACITY = 4
export const TRAY_CAPACITY = 3

/**
 * Parts that turn slowly about an axis for decoration. The angle is never
 * puzzle state: covers stay as authored, and a released part falls from
 * wherever it was when it let go.
 */
export interface Rotor {
  plates: readonly string[]
  center: Point3
  axis: Point3
  /** Seconds per full turn. */
  period: number
}

export interface PuzzleLevel {
  id: number
  name: string
  plates: readonly Plate[]
  screws: readonly Screw[]
  trayColors: readonly ScrewColor[]
  spareCapacity: number
  overflowLoses: boolean
  theme?: 'windmill' | 'glasshouse' | 'cafe' | 'millrace' | 'barn' | 'sawmill'
  /** The permanent base it stands on; the garden by default. */
  stage?: StageId
  rotor?: Rotor
  introduction?: string
}

const introductoryLevels: readonly PuzzleLevel[] = [
  { id: 1, name: 'Little Cottage', plates: PLATES, screws: SCREWS, trayColors: ['coral', 'mint', 'blue'], spareCapacity: SPARE_CAPACITY, overflowLoses: false },
  {
    id: 2, name: 'Garden Workshop', spareCapacity: 2, overflowLoses: true,
    trayColors: ['coral', 'mint', 'blue', 'amber'],
    plates: [
      ...PLATES.map((plate) => ({ ...plate, color: plate.finish === 'roof' ? '#728e8b' : '#efd9b6' })),
      { id: 'front-brace', name: 'Front timber brace', position: [0, 0.56, 1.85], size: [3.6, 1.05], normal: [0, 0, 1], up: [0, 1, 0], finish: 'brace', color: '#b98958' },
      { id: 'back-brace', name: 'Back timber brace', position: [0, 0.56, -1.85], size: [3.6, 1.05], normal: [0, 0, -1], up: [0, 1, 0], finish: 'brace', color: '#b98958' },
    ],
    screws: [
      ...SCREWS.map((screw): Screw => ({
        ...screw,
        color: ({ 'front-1': 'blue', 'front-2': 'amber', 'left-roof-2': 'amber', 'right-roof-2': 'amber' } as Record<string, ScrewColor>)[screw.id] ?? screw.color,
        ...(['front-1', 'front-2'].includes(screw.id) ? { blockedBy: ['front-brace'] } : screw.id === 'back-1' ? { blockedBy: ['back-brace'] } : {}),
      })),
      { id: 'front-brace-1', plate: 'front-brace', color: 'coral', position: [-1.15, 0] },
      { id: 'front-brace-2', plate: 'front-brace', color: 'mint', position: [1.15, 0] },
      { id: 'back-brace-1', plate: 'back-brace', color: 'coral', position: [1.1, 0] },
    ],
  },
]

export const LEVELS: readonly PuzzleLevel[] = [...introductoryLevels, ...createVillageLevels(PLATES, SCREWS, introductoryLevels[1]!), ...createMillLevels(PLATES, SCREWS), ...createHarborLevels(), ...createRailwayLevels()]

/** Boards for trying a mechanism before any level uses it: reached only by link, never listed, never saved. */
export const LAB_LEVELS: readonly PuzzleLevel[] = createLabLevels()

export function getLevel(id: number): PuzzleLevel {
  const level = LEVELS.find((candidate) => candidate.id === id) ?? LAB_LEVELS.find((candidate) => candidate.id === id)
  if (!level) throw new Error(`Unknown Plate Escape level: ${id}`)
  return level
}
