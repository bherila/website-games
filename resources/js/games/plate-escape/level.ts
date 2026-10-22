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
  back: boolean
  color: string
}

export interface Screw {
  id: string
  plate: string
  color: ScrewColor
  position: readonly [number, number]
}

export const PLATES: readonly Plate[] = [
  { id: 'bridge', name: 'Front bridge', position: [0, 1, 0.65], size: [4.6, 1.35], back: false, color: '#f1ddba' },
  { id: 'panel', name: 'Lower panel', position: [0, -0.25, 0.2], size: [3.2, 3.4], back: false, color: '#d3e4e7' },
  { id: 'wing', name: 'Back panel', position: [0.5, 0.3, -0.4], size: [3.4, 2.8], back: true, color: '#e3d7ef' },
]

export const SCREWS: readonly Screw[] = [
  { id: 'bridge-1', plate: 'bridge', color: 'coral', position: [-1.6, 0] },
  { id: 'bridge-2', plate: 'bridge', color: 'mint', position: [0, 0] },
  { id: 'bridge-3', plate: 'bridge', color: 'blue', position: [1.6, 0] },
  { id: 'panel-1', plate: 'panel', color: 'blue', position: [-0.8, 0.9] },
  { id: 'panel-2', plate: 'panel', color: 'mint', position: [0.8, 0.9] },
  { id: 'panel-3', plate: 'panel', color: 'coral', position: [0, -1.1] },
  { id: 'wing-1', plate: 'wing', color: 'coral', position: [-1, 0.6] },
  { id: 'wing-2', plate: 'wing', color: 'mint', position: [1, 0.6] },
  { id: 'wing-3', plate: 'wing', color: 'blue', position: [0, -0.75] },
]

export const SPARE_CAPACITY = 4
export const TRAY_CAPACITY = 3
