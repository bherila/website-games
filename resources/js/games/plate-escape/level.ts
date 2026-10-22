export type ScrewColor = 'coral' | 'mint' | 'blue'
export type Point3 = readonly [number, number, number]

export const COLORS: Record<ScrewColor, { name: string, hex: string }> = {
  coral: { name: 'Coral', hex: '#ed775c' },
  mint: { name: 'Mint', hex: '#50b49b' },
  blue: { name: 'Blue', hex: '#598dda' },
}

export interface Plate {
  id: string
  name: string
  position: Point3
  size: readonly [number, number]
  normal: Point3
  up: Point3
  gableRise?: number
  finish: 'front' | 'back' | 'side' | 'roof'
  color: string
}

export interface Screw {
  id: string
  plate: string
  color: ScrewColor
  position: readonly [number, number]
}

const roofLength = Math.hypot(2.1, 1.35)
const roofSin = 1.35 / roofLength
const roofCos = 2.1 / roofLength

/** Local X/Y describe each panel; its normal points toward the screw heads. */
export const PLATES: readonly Plate[] = [
  { id: 'front', name: 'Front gable wall', position: [0, -0.25, 1.25], size: [3.6, 2.6], normal: [0, 0, 1], up: [0, 1, 0], gableRise: 1.15, finish: 'front', color: '#f2dfbc' },
  { id: 'back', name: 'Back gable wall', position: [0, -0.25, -1.25], size: [3.6, 2.6], normal: [0, 0, -1], up: [0, 1, 0], gableRise: 1.15, finish: 'back', color: '#efdbb7' },
  { id: 'left', name: 'Left wall', position: [-1.8, -0.25, 0], size: [2.5, 2.6], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'side', color: '#e9d3ad' },
  { id: 'right', name: 'Right wall', position: [1.8, -0.25, 0], size: [2.5, 2.6], normal: [1, 0, 0], up: [0, 1, 0], finish: 'side', color: '#f2dfbc' },
  { id: 'left-roof', name: 'Left roof slope', position: [-1.05, 1.6, 0], size: [3.05, roofLength], normal: [-roofSin, roofCos, 0], up: [roofCos, roofSin, 0], finish: 'roof', color: '#a95145' },
  { id: 'right-roof', name: 'Right roof slope', position: [1.05, 1.6, 0], size: [3.05, roofLength], normal: [roofSin, roofCos, 0], up: [-roofCos, roofSin, 0], finish: 'roof', color: '#b6614e' },
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
