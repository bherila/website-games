import * as CANNON from 'cannon-es'

import { cellCenter, placementWalls, type WorldWall } from '../board/grid'
import type { LevelDef, PiecePlacement } from '../levels/levelTypes'
import { type PieceBehavior, PIECES, type SurfaceMaterial, type Vec2 } from '../pieces/pieceCatalog'
import {
  ANGULAR_DAMPING,
  BEHAVIOR_COOLDOWN_S,
  CONTACT_MATERIALS,
  FIXED_STEP_S,
  GRAVITY_Y,
  LINEAR_DAMPING,
  MARBLE_MASS,
  MARBLE_RADIUS,
  MAX_SPEED,
  PATH_SAMPLE_EVERY,
  TRAMPOLINE_MIN_IMPACT,
} from './constants'
import { createRunTracker, type RunStatus, type RunTracker, updateRunTracker } from './runOutcome'

/** Basket walls in cell-local coordinates (origin bottom-left, +y up). */
export const BASKET_WALL: readonly Vec2[] = [[0.1, 0.7], [0.1, 0.06], [0.9, 0.06], [0.9, 0.7]]
export const BASKET_INNER = { left: 0.1, right: 0.9, bottom: 0.06, top: 0.7 } as const
export const PEG_RADIUS = 0.12

/**
 * Pegs sit a little off-centre (alternating by cell parity) so a marble dropped
 * dead-centre glances off instead of balancing on top.
 */
export function pegPosition(level: LevelDef, peg: { col: number; row: number }): Vec2 {
  const [x, y] = cellCenter(level, peg)

  return [x + ((peg.col + peg.row) % 2 === 0 ? 0.12 : -0.12), y]
}

export type RunEvent =
  | { kind: 'launch'; placementIndex: number }
  | { kind: 'bounce'; placementIndex: number }

export interface RunWorld {
  world: CANNON.World
  marble: CANNON.Body
  tracker: RunTracker
  /** Marble centre samples, every PATH_SAMPLE_EVERY steps. */
  path: Vec2[]
  /** Advances exactly one fixed step; returns the run status after it. */
  tick: (onEvent?: (event: RunEvent) => void) => RunStatus
}

/** Marble spawn point: centre of the dropper cell. */
export function marbleSpawn(level: LevelDef): Vec2 {
  return cellCenter(level, level.start)
}

/** Every static wall in a level with the player's placements (fixed pieces first). */
export function levelWalls(level: LevelDef, placements: readonly PiecePlacement[]): WorldWall[] {
  const walls: WorldWall[] = []
  for (const fixed of level.fixed) {
    walls.push(...placementWalls(level, fixed))
  }
  for (const placement of placements) {
    walls.push(...placementWalls(level, placement))
  }
  walls.push(...basketWalls(level))

  return walls
}

export function basketWalls(level: LevelDef): WorldWall[] {
  const left = level.goal.col
  const bottom = level.rows - level.goal.row - 1

  return [{
    points: BASKET_WALL.map(([x, y]) => [left + x, bottom + y] as Vec2),
    thickness: 0.08,
    material: 'basket',
  }]
}

function createMaterials(world: CANNON.World): { marble: CANNON.Material; surfaces: Record<SurfaceMaterial, CANNON.Material> } {
  const marble = new CANNON.Material('marble')
  const surfaces = {} as Record<SurfaceMaterial, CANNON.Material>
  for (const key of Object.keys(CONTACT_MATERIALS) as SurfaceMaterial[]) {
    const material = new CANNON.Material(key)
    surfaces[key] = material
    world.addContactMaterial(new CANNON.ContactMaterial(marble, material, CONTACT_MATERIALS[key]))
  }

  return { marble, surfaces }
}

/** Adds one wall polyline to `body` as thin boxes, each sitting on the solid side of its edge. */
export function addWallShapes(body: CANNON.Body, wall: WorldWall, material: CANNON.Material): void {
  for (let i = 0; i < wall.points.length - 1; i += 1) {
    const [x0, y0] = wall.points[i] as Vec2
    const [x1, y1] = wall.points[i + 1] as Vec2
    const dx = x1 - x0
    const dy = y1 - y0
    const length = Math.hypot(dx, dy)
    if (length < 1e-6) {
      continue
    }

    // Right-hand normal of the travel direction points into the solid.
    const nx = dy / length
    const ny = -dx / length
    const half = wall.thickness / 2
    const shape = new CANNON.Box(new CANNON.Vec3((length / 2) + 0.004, half, 0.5))
    shape.material = material
    const offset = new CANNON.Vec3(((x0 + x1) / 2) + (nx * half), ((y0 + y1) / 2) + (ny * half), 0)
    const orientation = new CANNON.Quaternion()
    orientation.setFromEuler(0, 0, Math.atan2(dy, dx))
    body.addShape(shape, offset, orientation)
  }
}

interface BehaviorBody {
  body: CANNON.Body
  behavior: PieceBehavior
  direction: 1 | -1
  placementIndex: number
  cooldown: number
  pendingImpactVy: number | null
}

/**
 * Builds the cannon-es world for one run. Deterministic: the same level + placements
 * always produce the same trajectory, so tests can prove each level's reference solution.
 */
export function buildRunWorld(level: LevelDef, placements: readonly PiecePlacement[]): RunWorld {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY_Y, 0) })
  world.broadphase = new CANNON.NaiveBroadphase()
  world.allowSleep = false
  world.defaultContactMaterial.friction = 0.2
  world.defaultContactMaterial.restitution = 0.1
  const materials = createMaterials(world)

  const [spawnX, spawnY] = marbleSpawn(level)
  // cannon-es only consults per-shape contact materials when *both* shapes carry one,
  // so the marble's sphere needs its material on the shape, not just the body.
  const marbleShape = new CANNON.Sphere(MARBLE_RADIUS)
  marbleShape.material = materials.marble
  const marble = new CANNON.Body({
    mass: MARBLE_MASS,
    shape: marbleShape,
    material: materials.marble,
    position: new CANNON.Vec3(spawnX, spawnY, 0),
    linearDamping: LINEAR_DAMPING,
    angularDamping: ANGULAR_DAMPING,
  })
  marble.linearFactor.set(1, 1, 0)
  marble.angularFactor.set(0, 0, 1)
  marble.allowSleep = false
  world.addBody(marble)

  const statics = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC })
  const behaviors: BehaviorBody[] = []

  const addPlacement = (placement: PiecePlacement, placementIndex: number): void => {
    const piece = PIECES[placement.pieceId]
    const walls = placementWalls(level, placement)
    if (!piece.behavior) {
      for (const wall of walls) {
        addWallShapes(statics, wall, materials.surfaces[wall.material])
      }

      return
    }

    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC })
    for (const wall of walls) {
      addWallShapes(body, wall, materials.surfaces[wall.material])
    }
    world.addBody(body)
    const entry: BehaviorBody = {
      body,
      behavior: piece.behavior,
      direction: placement.flipped ? -1 : 1,
      placementIndex,
      cooldown: 0,
      pendingImpactVy: null,
    }
    body.addEventListener('collide', () => {
      // Fired during narrowphase, before the solver: marble velocity is still pre-impact.
      if (entry.cooldown <= 0 && entry.pendingImpactVy === null) {
        entry.pendingImpactVy = marble.velocity.y
      }
    })
    behaviors.push(entry)
  }

  // Fixed pieces report negative indices (-1, -2, …) so events can tell them apart.
  level.fixed.forEach((fixed, index) => addPlacement(fixed, -(index + 1)))
  placements.forEach((placement, index) => addPlacement(placement, index))

  for (const wall of basketWalls(level)) {
    addWallShapes(statics, wall, materials.surfaces.basket)
  }

  for (const block of level.blocks) {
    const shape = new CANNON.Box(new CANNON.Vec3(block.w / 2, block.h / 2, 0.5))
    shape.material = materials.surfaces.obstacle
    statics.addShape(shape, new CANNON.Vec3(block.col + (block.w / 2), level.rows - block.row - (block.h / 2), 0))
  }

  for (const peg of level.pegs) {
    const [x, y] = pegPosition(level, peg)
    const shape = new CANNON.Sphere(PEG_RADIUS)
    shape.material = materials.surfaces.obstacle
    statics.addShape(shape, new CANNON.Vec3(x, y, 0))
  }

  world.addBody(statics)


  const goalLeft = level.goal.col
  const goalBottom = level.rows - level.goal.row - 1
  const tracker = createRunTracker()
  const path: Vec2[] = [[spawnX, spawnY]]
  let steps = 0

  const tick = (onEvent?: (event: RunEvent) => void): RunStatus => {
    if (tracker.status !== 'running') {
      return tracker.status
    }

    world.step(FIXED_STEP_S)
    steps += 1

    for (const entry of behaviors) {
      entry.cooldown = Math.max(0, entry.cooldown - FIXED_STEP_S)
      const impactVy = entry.pendingImpactVy
      entry.pendingImpactVy = null
      if (impactVy === null) {
        continue
      }

      if (entry.behavior.kind === 'launcher') {
        const angle = (entry.behavior.angleDeg * Math.PI) / 180
        const vx = Math.cos(angle) * entry.behavior.speed * entry.direction
        marble.velocity.set(vx, Math.sin(angle) * entry.behavior.speed, 0)
        // Spin to match the launch so pad friction on the way out cannot bleed off speed.
        marble.angularVelocity.set(0, 0, -vx / MARBLE_RADIUS)
        entry.cooldown = BEHAVIOR_COOLDOWN_S
        onEvent?.({ kind: 'launch', placementIndex: entry.placementIndex })
      } else if (impactVy < -TRAMPOLINE_MIN_IMPACT) {
        marble.velocity.y = (-impactVy * entry.behavior.keep) + entry.behavior.boost
        entry.cooldown = BEHAVIOR_COOLDOWN_S
        onEvent?.({ kind: 'bounce', placementIndex: entry.placementIndex })
      }
    }

    const speed = marble.velocity.length()
    if (speed > MAX_SPEED) {
      marble.velocity.scale(MAX_SPEED / speed, marble.velocity)
    }

    const x = marble.position.x
    const y = marble.position.y
    if (steps % PATH_SAMPLE_EVERY === 0) {
      path.push([x, y])
    }

    const inGoal = x > goalLeft + BASKET_INNER.left
      && x < goalLeft + BASKET_INNER.right
      && y > goalBottom + BASKET_INNER.bottom
      && y < goalBottom + BASKET_INNER.top

    return updateRunTracker(tracker, level, { x, y, speed: Math.min(speed, MAX_SPEED), inGoal }, FIXED_STEP_S)
  }

  return { world, marble, tracker, path, tick }
}

/** Runs a level headlessly to completion (tests, solution proofs). */
export function simulateRun(level: LevelDef, placements: readonly PiecePlacement[]): { status: RunStatus; path: Vec2[]; elapsed: number } {
  const run = buildRunWorld(level, placements)
  let status: RunStatus = 'running'
  while (status === 'running') {
    status = run.tick()
  }

  return { status, path: run.path, elapsed: run.tracker.elapsed }
}
