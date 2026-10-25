import { createVillageLevels } from './villageLevels'

export type ScrewColor = 'coral' | 'mint' | 'blue' | 'amber'
export type Point3 = readonly [number, number, number]

export const COLORS: Record<ScrewColor, { name: string, hex: string }> = {
  coral: { name: 'Coral', hex: '#ed775c' },
  mint: { name: 'Mint', hex: '#50b49b' },
  blue: { name: 'Blue', hex: '#598dda' },
  amber: { name: 'Amber', hex: '#d9a132' },
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
  /** Plates this one rests on; their last screw stays locked while this plate is attached. */
  restsOn?: readonly string[]
  finish: 'front' | 'back' | 'side' | 'roof' | 'brace' | 'sail' | 'glass' | 'glass-wall' | 'glass-roof' | 'awning' | 'sign'
  color: string
}

export interface Screw {
  id: string
  plate: string
  color: ScrewColor
  blockedBy?: readonly string[]
  position: readonly [number, number]
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

export interface PuzzleLevel {
  id: number
  name: string
  plates: readonly Plate[]
  screws: readonly Screw[]
  trayColors: readonly ScrewColor[]
  spareCapacity: number
  overflowLoses: boolean
  theme?: 'windmill' | 'glasshouse' | 'cafe'
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

export const LEVELS: readonly PuzzleLevel[] = [...introductoryLevels, ...createVillageLevels(PLATES, SCREWS, introductoryLevels[1]!)]

export function getLevel(id: number): PuzzleLevel {
  const level = LEVELS.find((candidate) => candidate.id === id)
  if (!level) throw new Error(`Unknown Plate Escape level: ${id}`)
  return level
}
