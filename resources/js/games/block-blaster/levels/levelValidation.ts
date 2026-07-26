import { BLOCK_CATALOG, type BlockPlacement, type BlockType, type LevelDef, type PlatformDef } from './levelTypes'

/**
 * Pure geometry checks for `LevelDef` authoring (see docs/games/block-blaster.md, "Placement
 * rules"). No I/O, no cannon-es dependency — these are cheap axis-aligned-bounding-box (AABB)
 * proxies for the real physics shapes, used by `levels.test.ts` to keep the 25 hand-authored
 * levels honest.
 *
 * Known limitations (acceptable per the spec's "conservative AABB" allowance):
 * - Cylinders (barrels) are treated as their bounding square/box, not their true round footprint.
 *   This is conservative for the "inside platform" check (a round platform can reject a corner
 *   that the true circle would clear) and for interpenetration (two barrels resting in a true
 *   nested "V" formation would be flagged as either not touching or slightly overlapping,
 *   depending on how they're authored) — level authors avoid barrel-on-barrel nesting for this
 *   reason and stack barrels only on flat surfaces (platform top, or another block's flat top).
 * - The round-platform "inside" check tests the 4 corners of the block's rotated footprint
 *   rectangle against the platform radius. This is exact for axis-aligned (0°/90°) placements
 *   (the only yaws used in practice) and conservative for arbitrary yaws.
 * - The support check only requires the block's footprint to *overlap* (not be fully contained
 *   by) a surface below within the gap tolerance. A block whose footprint partially overhangs its
 *   support (as in the deliberate cantilever/rubble designs) will be considered supported as long
 *   as some part of it rests flush; whether the overhang is torque-stable is left to the real
 *   physics stability test (`levelStability.test.ts`), not this static check.
 */

/** Overhang tolerance for "block footprint must lie within its platform's footprint". */
export const MAX_OVERHANG = 0.35

/** Tolerance for "blocks must not interpenetrate each other or the platform at spawn". */
export const SPAWN_OVERLAP_TOLERANCE = 0.02

/** Tolerance for "stacked blocks must rest on a surface within this gap". */
export const SUPPORT_GAP_TOLERANCE = 0.05

interface FootprintHalfExtents {
  halfX: number
  halfZ: number
}

interface WorldAabb {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

/**
 * Local (pre-yaw) half-extents of a block's footprint in the X/Z plane, after applying the
 * `layOnSide` 90°-about-local-Z tilt (which swaps the local X and Y half-extents — see
 * `scene/physics/levelWorld.ts` `blockSpawnQuaternion` / `blockHalfHeight`).
 */
function tiltedHalfExtents(type: BlockType, layOnSide: boolean): { hx: number, hz: number } {
  const [w, h, d] = BLOCK_CATALOG[type].size
  if (!layOnSide) {
    return { hx: w / 2, hz: d / 2 }
  }
  return { hx: h / 2, hz: d / 2 }
}

/** Vertical half-height of a block once its spawn orientation is applied (mirrors levelWorld.ts). */
export function verticalHalfHeight(type: BlockType, layOnSide: boolean): number {
  const [w, h] = BLOCK_CATALOG[type].size
  return (layOnSide ? w : h) / 2
}

/** Axis-aligned bounding half-extents of a block's footprint in world X/Z, after yaw. */
export function footprintHalfExtents(placement: Pick<BlockPlacement, 'type' | 'layOnSide' | 'rotationYDeg'>): FootprintHalfExtents {
  const { hx, hz } = tiltedHalfExtents(placement.type, placement.layOnSide ?? false)
  const yawRad = ((placement.rotationYDeg ?? 0) * Math.PI) / 180
  const cos = Math.abs(Math.cos(yawRad))
  const sin = Math.abs(Math.sin(yawRad))
  return {
    halfX: hx * cos + hz * sin,
    halfZ: hx * sin + hz * cos,
  }
}

/** World-space AABB for a block placement, given the platform it's spawned on. */
export function blockWorldAabb(platform: Pick<PlatformDef, 'center' | 'topY'>, placement: BlockPlacement): WorldAabb {
  const { halfX, halfZ } = footprintHalfExtents(placement)
  const halfY = verticalHalfHeight(placement.type, placement.layOnSide ?? false)
  const worldX = platform.center[0] + placement.position[0]
  const worldZ = platform.center[1] + placement.position[2]
  const baseY = platform.topY + placement.position[1]
  return {
    minX: worldX - halfX,
    maxX: worldX + halfX,
    minY: baseY,
    maxY: baseY + halfY * 2,
    minZ: worldZ - halfZ,
    maxZ: worldZ + halfZ,
  }
}

/** Whether a block's rotated footprint lies within its platform's footprint (± MAX_OVERHANG). */
export function isFootprintInsidePlatform(platform: Pick<PlatformDef, 'shape' | 'radius'>, placement: BlockPlacement): boolean {
  const { halfX, halfZ } = footprintHalfExtents(placement)
  const cx = placement.position[0]
  const cz = placement.position[2]
  const limit = platform.radius + MAX_OVERHANG

  if (platform.shape === 'square') {
    const maxAbsX = Math.max(Math.abs(cx - halfX), Math.abs(cx + halfX))
    const maxAbsZ = Math.max(Math.abs(cz - halfZ), Math.abs(cz + halfZ))
    return maxAbsX <= limit && maxAbsZ <= limit
  }

  const corners: Array<[number, number]> = [
    [cx - halfX, cz - halfZ],
    [cx - halfX, cz + halfZ],
    [cx + halfX, cz - halfZ],
    [cx + halfX, cz + halfZ],
  ]
  return corners.every(([x, z]) => Math.sqrt(x * x + z * z) <= limit)
}

function rangesOverlapBeyond(aMin: number, aMax: number, bMin: number, bMax: number, tolerance: number): boolean {
  const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin)
  return overlap > tolerance
}

function rangesOverlapAtAll(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax && aMax > bMin
}

/** Whether two block AABBs interpenetrate beyond the spawn overlap tolerance (all 3 axes). */
export function aabbsInterpenetrate(a: WorldAabb, b: WorldAabb, tolerance: number = SPAWN_OVERLAP_TOLERANCE): boolean {
  return (
    rangesOverlapBeyond(a.minX, a.maxX, b.minX, b.maxX, tolerance)
    && rangesOverlapBeyond(a.minY, a.maxY, b.minY, b.maxY, tolerance)
    && rangesOverlapBeyond(a.minZ, a.maxZ, b.minZ, b.maxZ, tolerance)
  )
}

/** Whether a block's base rests on the platform top (within SUPPORT_GAP_TOLERANCE). */
export function restsOnPlatformTop(platform: Pick<PlatformDef, 'topY'>, placement: BlockPlacement): boolean {
  return Math.abs(placement.position[1]) <= SUPPORT_GAP_TOLERANCE
}

/** Whether `aabb` rests on top of `supportAabb` (XZ footprints overlap, base flush with its top). */
function restsOnAabbTop(aabb: WorldAabb, supportAabb: WorldAabb): boolean {
  const flush = Math.abs(aabb.minY - supportAabb.maxY) <= SUPPORT_GAP_TOLERANCE
  if (!flush) {
    return false
  }
  return (
    rangesOverlapAtAll(aabb.minX, aabb.maxX, supportAabb.minX, supportAabb.maxX)
    && rangesOverlapAtAll(aabb.minZ, aabb.maxZ, supportAabb.minZ, supportAabb.maxZ)
  )
}

export interface BlockValidationIssue {
  platformIndex: number
  blockIndex: number
  kind: 'footprint' | 'interpenetration' | 'support'
  detail: string
}

/**
 * Validate every block placement in a level against the three placement rules: footprint inside
 * platform, no spawn interpenetration (block↔block, block↔platform), and every block supported.
 * Returns an empty array when the level is fully valid.
 */
export function validateLevelBlocks(level: LevelDef): BlockValidationIssue[] {
  const issues: BlockValidationIssue[] = []

  interface Entry {
    platformIndex: number
    blockIndex: number
    platform: PlatformDef
    placement: BlockPlacement
    aabb: WorldAabb
  }

  const entries: Entry[] = []
  level.platforms.forEach((platform, platformIndex) => {
    platform.blocks.forEach((placement, blockIndex) => {
      entries.push({
        platformIndex,
        blockIndex,
        platform,
        placement,
        aabb: blockWorldAabb(platform, placement),
      })
    })
  })

  for (const entry of entries) {
    if (!isFootprintInsidePlatform(entry.platform, entry.placement)) {
      issues.push({
        platformIndex: entry.platformIndex,
        blockIndex: entry.blockIndex,
        kind: 'footprint',
        detail: `block ${entry.placement.type} at [${entry.placement.position.join(', ')}] overhangs its platform beyond MAX_OVERHANG (${MAX_OVERHANG})`,
      })
    }

    if (entry.aabb.minY < entry.platform.topY - SPAWN_OVERLAP_TOLERANCE) {
      issues.push({
        platformIndex: entry.platformIndex,
        blockIndex: entry.blockIndex,
        kind: 'interpenetration',
        detail: `block ${entry.placement.type} at [${entry.placement.position.join(', ')}] is embedded below its platform's top surface`,
      })
    }

    const supported = restsOnPlatformTop(entry.platform, entry.placement)
      || entries.some((other) => (
        other !== entry
        && other.platformIndex === entry.platformIndex
        && restsOnAabbTop(entry.aabb, other.aabb)
      ))
    if (!supported) {
      issues.push({
        platformIndex: entry.platformIndex,
        blockIndex: entry.blockIndex,
        kind: 'support',
        detail: `block ${entry.placement.type} at [${entry.placement.position.join(', ')}] is not resting on the platform top or another block's surface`,
      })
    }
  }

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i]
      const b = entries[j]
      if (!a || !b) {
        continue
      }
      if (aabbsInterpenetrate(a.aabb, b.aabb)) {
        issues.push({
          platformIndex: a.platformIndex,
          blockIndex: a.blockIndex,
          kind: 'interpenetration',
          detail: `block ${a.placement.type} at [${a.placement.position.join(', ')}] overlaps block ${b.placement.type} at [${b.placement.position.join(', ')}] (platform ${b.platformIndex}, block ${b.blockIndex})`,
        })
      }
    }
  }

  return issues
}
