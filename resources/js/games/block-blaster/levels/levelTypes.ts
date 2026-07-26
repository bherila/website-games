export type BlockType = 'crate' | 'smallCube' | 'beam' | 'plank' | 'barrel' | 'stone'

export interface BlockCatalogEntry {
  shape: 'box' | 'cylinder'
  /** Bounding size [width, height, depth] in world units. Cylinders: width = depth = diameter. */
  size: [number, number, number]
  mass: number
  color: number
  accentColor: number
}

export const BLOCK_CATALOG: Record<BlockType, BlockCatalogEntry> = {
  crate: { shape: 'box', size: [1.0, 1.0, 1.0], mass: 1.0, color: 0xe8862e, accentColor: 0xb35f14 },
  smallCube: { shape: 'box', size: [0.6, 0.6, 0.6], mass: 0.4, color: 0xf7c948, accentColor: 0xd9a520 },
  beam: { shape: 'box', size: [3.0, 0.75, 0.75], mass: 2.0, color: 0xc7ccd4, accentColor: 0xd93636 },
  plank: { shape: 'box', size: [2.5, 0.3, 1.0], mass: 1.2, color: 0xd93636, accentColor: 0xf5f0e6 },
  barrel: { shape: 'cylinder', size: [1.0, 1.0, 1.0], mass: 1.5, color: 0xc7ccd4, accentColor: 0xd93636 },
  stone: { shape: 'box', size: [1.2, 1.2, 1.2], mass: 6.0, color: 0x8a8f99, accentColor: 0x6b707a },
}

export interface BlockPlacement {
  type: BlockType
  /**
   * X/Z measured from the platform center; Y is the height of the block's BASE above the
   * platform's top surface (0 = resting directly on the platform).
   */
  position: [number, number, number]
  /** Yaw around the block's own vertical axis, degrees. */
  rotationYDeg?: number
  /** Barrels/planks: rotate 90° about the local Z axis so the piece lies on its side. */
  layOnSide?: boolean
}

export interface PlatformRotation {
  mode: 'continuous' | 'oscillate'
  /** Continuous: signed angular speed. Oscillate: peak angular speed. Degrees per second. */
  speedDegPerSec: number
  /** Oscillate only: amplitude in degrees (swing is ±maxAngleDeg from the spawn orientation). */
  maxAngleDeg?: number
}

export interface PlatformDef {
  shape: 'round' | 'square'
  /** Round: cylinder radius. Square: half-width. */
  radius: number
  /** Height of the platform's top surface above the ground plane. */
  topY: number
  /** World X/Z of the platform's rotation axis. */
  center: [number, number]
  rotation?: PlatformRotation
  blocks: BlockPlacement[]
}

export interface StarThresholds {
  /** Minimum balls remaining at the moment of victory to earn 2 stars. */
  twoStar: number
  /** Minimum balls remaining at the moment of victory to earn 3 stars. */
  threeStar: number
}

export interface LevelDef {
  id: number
  balls: number
  starThresholds: StarThresholds
  platforms: PlatformDef[]
  /** Wordless tutorial: indices of the block the hint ring/finger points at. */
  hint?: { platform: number, block: number }
}

export function blockId(platformIndex: number, blockIndex: number): string {
  return `p${platformIndex}b${blockIndex}`
}
