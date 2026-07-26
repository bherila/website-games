import * as CANNON from 'cannon-es'

import { BLOCK_CATALOG, blockId, type BlockPlacement, type BlockType, type LevelDef, type PlatformDef } from '../../levels/levelTypes'
import {
  BALL_KILL_Y,
  CLEAR_DROP,
  PHYSICS_MAX_SUBSTEPS,
  PHYSICS_TIMESTEP,
  PLATFORM_SLAB_THICKNESS,
} from '../sceneConstants'
import { createPhysicsWorld, type PhysicsWorldHandles } from './world'

export interface LevelBlockBody {
  id: string
  platformIndex: number
  blockIndex: number
  type: BlockType
  body: CANNON.Body
  spawnPosition: CANNON.Vec3
}

export interface LevelPlatformBody {
  def: PlatformDef
  body: CANNON.Body
}

export interface LevelWorld {
  handles: PhysicsWorldHandles
  platforms: LevelPlatformBody[]
  blocks: LevelBlockBody[]
  clearedBlockIds: Set<string>
  elapsed: number
  /** Advance rotation drivers + physics + the cleared latch by dt seconds of wall time. */
  step: (dt: number) => void
}

const DEG_TO_RAD = Math.PI / 180

/**
 * Horizontal clearance beyond the platform footprint before a below-top block counts as off the
 * platform. Keeps a block tipped against the slab rim (center marginally outside the radius but
 * still supported by it) from latching a hair early.
 */
const OFF_PLATFORM_CLEAR_MARGIN = 0.1

const SCRATCH_OFFSET = new CANNON.Vec3()
const SCRATCH_LOCAL = new CANNON.Vec3()
const SCRATCH_INVERSE_ROTATION = new CANNON.Quaternion()

function isOutsidePlatformFootprint(body: CANNON.Body, platform: LevelPlatformBody): boolean {
  const def = platform.def
  SCRATCH_OFFSET.set(body.position.x - def.center[0], 0, body.position.z - def.center[1])
  platform.body.quaternion.conjugate(SCRATCH_INVERSE_ROTATION)
  SCRATCH_INVERSE_ROTATION.vmult(SCRATCH_OFFSET, SCRATCH_LOCAL)
  const reach = def.radius + OFF_PLATFORM_CLEAR_MARGIN
  if (def.shape === 'round') {
    return Math.hypot(SCRATCH_LOCAL.x, SCRATCH_LOCAL.z) > reach
  }
  return Math.abs(SCRATCH_LOCAL.x) > reach || Math.abs(SCRATCH_LOCAL.z) > reach
}

/**
 * A block is cleared when it has irreversibly left its platform: either its center dropped well
 * below the platform top (fast path), or it sits below the top surface AND horizontally outside
 * every platform footprint — which catches tall pieces (beams, planks) that land standing on end
 * on the grass with their center still above `topY - CLEAR_DROP`. Anything below the top and off
 * every slab cannot climb back on.
 */
function isBlockCleared(body: CANNON.Body, ownTopY: number, platforms: LevelPlatformBody[]): boolean {
  const y = body.position.y
  if (y < ownTopY - CLEAR_DROP || y < BALL_KILL_Y) {
    return true
  }
  if (y >= ownTopY) {
    return false
  }
  for (const platform of platforms) {
    if (!isOutsidePlatformFootprint(body, platform)) {
      return false
    }
  }
  return true
}

/** Vertical half-extent of a block's bounding size once its spawn orientation is applied. */
export function blockHalfHeight(type: BlockType, placement: Pick<BlockPlacement, 'layOnSide'>): number {
  const catalog = BLOCK_CATALOG[type]
  return (placement.layOnSide ? catalog.size[0] : catalog.size[1]) / 2
}

export function createBlockShape(type: BlockType): CANNON.Shape {
  const catalog = BLOCK_CATALOG[type]
  if (catalog.shape === 'cylinder') {
    const radius = catalog.size[0] / 2
    return new CANNON.Cylinder(radius, radius, catalog.size[1], 12)
  }
  return new CANNON.Box(new CANNON.Vec3(catalog.size[0] / 2, catalog.size[1] / 2, catalog.size[2] / 2))
}

export function blockSpawnQuaternion(placement: Pick<BlockPlacement, 'rotationYDeg' | 'layOnSide'>): CANNON.Quaternion {
  const yaw = new CANNON.Quaternion()
  yaw.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), (placement.rotationYDeg ?? 0) * DEG_TO_RAD)
  if (!placement.layOnSide) {
    return yaw
  }
  const tilt = new CANNON.Quaternion()
  tilt.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2)
  return yaw.mult(tilt)
}

function createPlatformBody(def: PlatformDef, handles: PhysicsWorldHandles): CANNON.Body {
  const shape = def.shape === 'round'
    ? new CANNON.Cylinder(def.radius, def.radius, PLATFORM_SLAB_THICKNESS, 24)
    : new CANNON.Box(new CANNON.Vec3(def.radius, PLATFORM_SLAB_THICKNESS / 2, def.radius))
  const body = new CANNON.Body({
    type: CANNON.Body.KINEMATIC,
    shape,
    material: handles.materials.platform,
  })
  body.allowSleep = false
  body.position.set(def.center[0], def.topY - PLATFORM_SLAB_THICKNESS / 2, def.center[1])
  return body
}

function createBlockBody(
  def: PlatformDef,
  placement: BlockPlacement,
  handles: PhysicsWorldHandles,
): CANNON.Body {
  const catalog = BLOCK_CATALOG[placement.type]
  const body = new CANNON.Body({
    mass: catalog.mass,
    shape: createBlockShape(placement.type),
    material: handles.materials.block,
  })
  body.position.set(
    def.center[0] + placement.position[0],
    def.topY + placement.position[1] + blockHalfHeight(placement.type, placement),
    def.center[1] + placement.position[2],
  )
  body.quaternion.copy(blockSpawnQuaternion(placement))
  body.allowSleep = !def.rotation
  return body
}

/**
 * Angular velocity (rad/s) of a platform's rotation driver at elapsed time t.
 * Oscillate follows angle(t) = A * sin(omega * t) with peak angular speed = speedDegPerSec,
 * so the driver stays velocity-continuous and friction carries the blocks.
 */
export function platformAngularVelocity(def: PlatformDef, elapsed: number): number {
  if (!def.rotation) {
    return 0
  }
  const speed = def.rotation.speedDegPerSec * DEG_TO_RAD
  if (def.rotation.mode === 'continuous') {
    return speed
  }
  const amplitude = Math.max(1e-3, (def.rotation.maxAngleDeg ?? 90) * DEG_TO_RAD)
  return speed * Math.cos((speed / amplitude) * elapsed)
}

export function buildLevelWorld(level: LevelDef): LevelWorld {
  const handles = createPhysicsWorld()
  const platforms: LevelPlatformBody[] = []
  const blocks: LevelBlockBody[] = []

  level.platforms.forEach((platformDef, platformIndex) => {
    const platformBody = createPlatformBody(platformDef, handles)
    handles.world.addBody(platformBody)
    platforms.push({ def: platformDef, body: platformBody })

    platformDef.blocks.forEach((placement, blockIndex) => {
      const body = createBlockBody(platformDef, placement, handles)
      handles.world.addBody(body)
      blocks.push({
        id: blockId(platformIndex, blockIndex),
        platformIndex,
        blockIndex,
        type: placement.type,
        body,
        spawnPosition: body.position.clone(),
      })
    })
  })

  const clearedBlockIds = new Set<string>()

  const levelWorld: LevelWorld = {
    handles,
    platforms,
    blocks,
    clearedBlockIds,
    elapsed: 0,
    step: (dt: number) => {
      levelWorld.elapsed += dt
      for (const platform of platforms) {
        if (platform.def.rotation) {
          platform.body.angularVelocity.set(0, platformAngularVelocity(platform.def, levelWorld.elapsed), 0)
        }
      }
      handles.world.step(PHYSICS_TIMESTEP, dt, PHYSICS_MAX_SUBSTEPS)
      for (const block of blocks) {
        if (clearedBlockIds.has(block.id)) {
          continue
        }
        const platform = level.platforms[block.platformIndex]
        const topY = platform ? platform.topY : 0
        if (isBlockCleared(block.body, topY, platforms)) {
          clearedBlockIds.add(block.id)
        }
      }
    },
  }

  return levelWorld
}
