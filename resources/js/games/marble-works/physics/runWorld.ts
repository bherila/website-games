import * as CANNON from 'cannon-es'

import { cellCenter, placementWalls, type WorldWall } from '../board/grid'
import type { Cell, LevelDef, PiecePlacement } from '../levels/levelTypes'
import { type PieceBehavior, PIECES, type SurfaceMaterial, type Vec2 } from '../pieces/pieceCatalog'
import {
  ANGULAR_DAMPING,
  BEHAVIOR_COOLDOWN_S,
  CONTACT_MATERIALS,
  FIRST_RELEASE_S,
  FIXED_STEP_S,
  GEM_PICKUP_RADIUS,
  GRAVITY_Y,
  LINEAR_DAMPING,
  MARBLE_CONTACT,
  MAX_SPEED,
  PATH_SAMPLE_EVERY,
  RELEASE_INTERVAL_S,
  RUN_TIMEOUT_S,
  SHATTER_KEEP,
  TRAMPOLINE_MIN_IMPACT,
} from './constants'
import { impulseSpeedScale, MARBLE_KIND_ORDER, MARBLE_KINDS, type MarbleKind } from './marbles'
import {
  createMarbleTracker,
  judgeRun,
  type MarbleTracker,
  type RunStatus,
  updateMarbleTracker,
} from './runOutcome'

/** Basket walls in cell-local coordinates (origin bottom-left, +y up). */
export const BASKET_WALL: readonly Vec2[] = [[0.1, 0.7], [0.1, 0.06], [0.9, 0.06], [0.9, 0.7]]
export const BASKET_INNER = { left: 0.1, right: 0.9, bottom: 0.06, top: 0.7 } as const
export const PEG_RADIUS = 0.12

/**
 * Pegs sit a little off-centre (alternating by cell parity) so a marble dropped
 * dead-centre glances off instead of balancing on top.
 */
export function pegPosition(level: LevelDef, peg: Cell): Vec2 {
  const [x, y] = cellCenter(level, peg)

  return [x + ((peg.col + peg.row) % 2 === 0 ? 0.12 : -0.12), y]
}

export type RunEvent =
  | { kind: 'release'; marble: number }
  | { kind: 'launch'; placementIndex: number; marble: number }
  | { kind: 'bounce'; placementIndex: number; marble: number }
  | { kind: 'toggle'; placementIndex: number; flipped: boolean }
  | { kind: 'shatter'; placementIndex: number; marble: number }
  | { kind: 'gem'; gem: number; marble: number }
  | { kind: 'home'; marble: number; basket: number }

/** One marble in a run, in release order. */
export interface RunMarble {
  index: number
  kind: MarbleKind
  dropper: number
  /** Seconds after Go when it falls. */
  releaseAt: number
  body: CANNON.Body
  tracker: MarbleTracker
  /** Centre samples, every PATH_SAMPLE_EVERY steps after release. */
  path: Vec2[]
  /** Fixed step at which each `path` sample was taken. */
  pathSteps: number[]
}

/** Live state of a toggle or fragile piece, for the renderer. */
export interface PieceState {
  placementIndex: number
  /** Toggle: current orientation (starts at the placement's `flipped`). */
  flipped: boolean
  /** Fragile: shattered this run. */
  broken: boolean
}

export interface RunWorld {
  world: CANNON.World
  marbles: RunMarble[]
  /** Toggle and fragile pieces keyed by placement index (fixed pieces are -1, -2, …). */
  pieceStates: Map<number, PieceState>
  /** Gem indices collected so far. */
  gems: Set<number>
  /** Fixed step at which each placement (by index) was first touched by any marble. */
  firstContacts: Map<number, number>
  elapsed: number
  steps: number
  status: RunStatus
  /** Seconds after Go at which the run times out. */
  timeoutAt: number
  /** Advances exactly one fixed step; returns the run status after it. */
  tick: (onEvent?: (event: RunEvent) => void) => RunStatus
}

/** Spawn point for a dropper: its cell centre. */
export function dropperSpawn(level: LevelDef, dropper: number): Vec2 {
  const cell = level.droppers[dropper]?.cell ?? { col: 0, row: 0 }

  return cellCenter(level, cell)
}

/** Every marble in the level, in the order they fall (ties: dropper order). */
export function marbleSchedule(level: LevelDef): { kind: MarbleKind; dropper: number; releaseAt: number }[] {
  const schedule = level.droppers.flatMap((dropper, dropperIndex) => dropper.marbles.map((kind, index) => ({
    kind,
    dropper: dropperIndex,
    releaseAt: FIRST_RELEASE_S + (dropper.delay ?? 0) + (index * (dropper.interval ?? RELEASE_INTERVAL_S)),
  })))

  return schedule.sort((a, b) => (a.releaseAt - b.releaseAt) || (a.dropper - b.dropper))
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
  level.baskets.forEach((_, index) => walls.push(...basketWalls(level, index)))

  return walls
}

export function basketWalls(level: LevelDef, basket = 0): WorldWall[] {
  const cell = level.baskets[basket]?.cell ?? { col: 0, row: 0 }
  const left = cell.col
  const bottom = level.rows - cell.row - 1

  return [{
    points: BASKET_WALL.map(([x, y]) => [left + x, bottom + y] as Vec2),
    thickness: 0.08,
    material: 'basket',
  }]
}

interface Materials {
  marbles: Record<MarbleKind, CANNON.Material>
  surfaces: Record<SurfaceMaterial, CANNON.Material>
}

function createMaterials(world: CANNON.World): Materials {
  const surfaces = {} as Record<SurfaceMaterial, CANNON.Material>
  for (const key of Object.keys(CONTACT_MATERIALS) as SurfaceMaterial[]) {
    surfaces[key] = new CANNON.Material(key)
  }
  const marbles = {} as Record<MarbleKind, CANNON.Material>
  for (const kind of MARBLE_KIND_ORDER) {
    const material = new CANNON.Material(`marble-${kind}`)
    marbles[kind] = material
    for (const key of Object.keys(CONTACT_MATERIALS) as SurfaceMaterial[]) {
      const contact = key === 'rubber'
        ? { ...CONTACT_MATERIALS.rubber, restitution: MARBLE_KINDS[kind].rubberRestitution }
        : CONTACT_MATERIALS[key]
      world.addContactMaterial(new CANNON.ContactMaterial(material, surfaces[key], contact))
    }
  }
  for (const [i, a] of MARBLE_KIND_ORDER.entries()) {
    for (const b of MARBLE_KIND_ORDER.slice(i)) {
      world.addContactMaterial(new CANNON.ContactMaterial(marbles[a], marbles[b], MARBLE_CONTACT))
    }
  }

  return { marbles, surfaces }
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

/**
 * Collision-filter bits. Scenery is group 1; each marble kind has its own bit so a
 * sieve can let small marbles through. Switched-off toggle halves and shattered glass
 * use group 0, which collides with nothing.
 */
const SOLID_GROUP = 1
const MARBLE_GROUPS: Readonly<Record<MarbleKind, number>> = { glass: 2, mini: 4, steel: 8 }

function setSolid(body: CANNON.Body, solid: boolean, mask = -1): void {
  body.collisionFilterGroup = solid ? SOLID_GROUP : 0
  body.collisionFilterMask = solid ? mask : 0
}

/** Mask for a sieve: every marble kind except those small enough to fall through. */
function sieveMask(maxRadius: number): number {
  return MARBLE_KIND_ORDER.reduce((mask, kind) => (MARBLE_KINDS[kind].radius <= maxRadius ? mask & ~MARBLE_GROUPS[kind] : mask), -1)
}

interface PieceEntry {
  placementIndex: number
  behavior: PieceBehavior | undefined
  /** `bodies[0]` as placed; toggles add `bodies[1]`, their mirror image. */
  bodies: CANNON.Body[]
  direction: 1 | -1
  footprint: { left: number; right: number; bottom: number; top: number }
  state: PieceState | null
  /** Per marble: cool-down left, and the pre-impact velocity of a new contact. */
  cooldown: Map<number, number>
  pending: Map<number, { vx: number; vy: number }>
  /** Toggle: marbles that touched it and have not left its footprint yet. */
  riders: Set<number>
}

function footprintRect(level: LevelDef, placement: PiecePlacement): PieceEntry['footprint'] {
  const variant = PIECES[placement.pieceId].variants[placement.variant % PIECES[placement.pieceId].variants.length]
  const w = variant?.w ?? 1
  const h = variant?.h ?? 1
  const bottom = level.rows - placement.row - h

  return { left: placement.col, right: placement.col + w, bottom, top: bottom + h }
}

/**
 * Builds the cannon-es world for one run. Deterministic: the same level + placements
 * always produce the same trajectories, so tests can prove each level's reference solution.
 */
export function buildRunWorld(level: LevelDef, placements: readonly PiecePlacement[]): RunWorld {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY_Y, 0) })
  world.broadphase = new CANNON.NaiveBroadphase()
  world.allowSleep = false
  world.defaultContactMaterial.friction = 0.2
  world.defaultContactMaterial.restitution = 0.1
  const materials = createMaterials(world)

  /** Placement index by body id, for contact attribution. */
  const pieceByBody = new Map<number, PieceEntry>()
  /** Marble index by body id. */
  const marbleByBody = new Map<number, number>()

  const marbles: RunMarble[] = marbleSchedule(level).map((entry, index) => {
    const def = MARBLE_KINDS[entry.kind]
    const [x, y] = dropperSpawn(level, entry.dropper)
    // cannon-es only consults per-shape contact materials when *both* shapes carry one,
    // so the marble's sphere needs its material on the shape, not just the body.
    const shape = new CANNON.Sphere(def.radius)
    shape.material = materials.marbles[entry.kind]
    const body = new CANNON.Body({
      mass: def.mass,
      shape,
      material: materials.marbles[entry.kind],
      position: new CANNON.Vec3(x, y, 0),
      linearDamping: LINEAR_DAMPING,
      angularDamping: ANGULAR_DAMPING,
    })
    body.linearFactor.set(1, 1, 0)
    body.angularFactor.set(0, 0, 1)
    body.allowSleep = false
    body.collisionFilterGroup = MARBLE_GROUPS[entry.kind]
    marbleByBody.set(body.id, index)

    return { index, kind: entry.kind, dropper: entry.dropper, releaseAt: entry.releaseAt, body, tracker: createMarbleTracker(), path: [], pathSteps: [] }
  })

  const statics = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC })
  const pieces: PieceEntry[] = []
  const pieceStates = new Map<number, PieceState>()

  const addPlacement = (placement: PiecePlacement, placementIndex: number): void => {
    const piece = PIECES[placement.pieceId]
    const orientations = piece.behavior?.kind === 'toggle' ? [placement, { ...placement, flipped: !placement.flipped }] : [placement]
    const bodies = orientations.map((orientation, index) => {
      const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC })
      for (const wall of placementWalls(level, orientation)) {
        addWallShapes(body, wall, materials.surfaces[wall.material])
      }
      setSolid(body, index === 0, piece.behavior?.kind === 'sieve' ? sieveMask(piece.behavior.maxRadius) : -1)
      world.addBody(body)

      return body
    })
    const stateful = piece.behavior?.kind === 'toggle' || piece.behavior?.kind === 'fragile'
    const entry: PieceEntry = {
      placementIndex,
      behavior: piece.behavior,
      bodies,
      direction: placement.flipped ? -1 : 1,
      footprint: footprintRect(level, placement),
      state: stateful ? { placementIndex, flipped: placement.flipped, broken: false } : null,
      cooldown: new Map(),
      pending: new Map(),
      riders: new Set(),
    }
    if (entry.state) {
      pieceStates.set(placementIndex, entry.state)
    }
    for (const body of bodies) {
      pieceByBody.set(body.id, entry)
      if (piece.behavior && piece.behavior.kind !== 'sieve') {
        body.addEventListener('collide', (event: { body: CANNON.Body }) => {
          // Fired during narrowphase, before the solver: the marble's velocity is still pre-impact.
          const marble = marbleByBody.get(event.body.id)
          if (marble !== undefined && !entry.pending.has(marble) && (entry.cooldown.get(marble) ?? 0) <= 0) {
            entry.pending.set(marble, { vx: event.body.velocity.x, vy: event.body.velocity.y })
          }
        })
      }
    }
    pieces.push(entry)
  }

  // Fixed pieces report negative indices (-1, -2, …) so events can tell them apart.
  level.fixed.forEach((fixed, index) => addPlacement(fixed, -(index + 1)))
  placements.forEach((placement, index) => addPlacement(placement, index))

  level.baskets.forEach((_, index) => {
    for (const wall of basketWalls(level, index)) {
      addWallShapes(statics, wall, materials.surfaces.basket)
    }
  })

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

  if (statics.shapes.length > 0) {
    world.addBody(statics)
  }

  const baskets = level.baskets.map((basket) => {
    const left = basket.cell.col
    const bottom = level.rows - basket.cell.row - 1

    return {
      accepts: basket.accepts,
      capacity: basket.capacity ?? Number.POSITIVE_INFINITY,
      held: 0,
      left: left + BASKET_INNER.left,
      right: left + BASKET_INNER.right,
      bottom: bottom + BASKET_INNER.bottom,
      top: bottom + BASKET_INNER.top,
    }
  })
  const gemCenters = level.gems.map((gem) => cellCenter(level, gem))
  const lastRelease = marbles.reduce((latest, marble) => Math.max(latest, marble.releaseAt), 0)

  const run: RunWorld = {
    world,
    marbles,
    pieceStates,
    gems: new Set(),
    firstContacts: new Map(),
    elapsed: 0,
    steps: 0,
    status: 'running',
    timeoutAt: lastRelease + RUN_TIMEOUT_S,
    tick: () => run.status,
  }

  const isActive = (marble: RunMarble): boolean => marble.tracker.status === 'rolling'

  const applyBehaviors = (onEvent?: (event: RunEvent) => void): void => {
    for (const entry of pieces) {
      for (const [marble, left] of entry.cooldown) {
        entry.cooldown.set(marble, Math.max(0, left - FIXED_STEP_S))
      }
      if (entry.pending.size === 0) {
        continue
      }
      const pending = [...entry.pending]
      entry.pending.clear()
      for (const [index, impact] of pending) {
        const marble = marbles[index]
        if (!marble || !isActive(marble)) {
          continue
        }
        const { body } = marble
        const def = MARBLE_KINDS[marble.kind]
        const behavior = entry.behavior
        if (behavior?.kind === 'launcher') {
          const angle = (behavior.angleDeg * Math.PI) / 180
          const speed = Math.min(MAX_SPEED, behavior.speed * impulseSpeedScale(def.mass))
          const vx = Math.cos(angle) * speed * entry.direction
          body.velocity.set(vx, Math.sin(angle) * speed, 0)
          // Spin to match the launch so pad friction on the way out cannot bleed off speed.
          body.angularVelocity.set(0, 0, -vx / def.radius)
          entry.cooldown.set(index, BEHAVIOR_COOLDOWN_S)
          onEvent?.({ kind: 'launch', placementIndex: entry.placementIndex, marble: index })
        } else if (behavior?.kind === 'trampoline' && impact.vy < -TRAMPOLINE_MIN_IMPACT) {
          // A heavy ball squashes the spring and gets less of its fall back; a mini one more.
          body.velocity.y = ((-impact.vy * behavior.keep) + behavior.boost) * Math.sqrt(impulseSpeedScale(def.mass))
          entry.cooldown.set(index, BEHAVIOR_COOLDOWN_S)
          onEvent?.({ kind: 'bounce', placementIndex: entry.placementIndex, marble: index })
        } else if (behavior?.kind === 'toggle') {
          entry.riders.add(index)
        } else if (behavior?.kind === 'fragile' && def.breaksGlass && entry.state && !entry.state.broken) {
          entry.state.broken = true
          for (const pieceBody of entry.bodies) {
            setSolid(pieceBody, false)
          }
          // Crash straight through: undo the solver's bounce, minus what the glass absorbed.
          body.velocity.set(impact.vx * SHATTER_KEEP, impact.vy * SHATTER_KEEP, 0)
          onEvent?.({ kind: 'shatter', placementIndex: entry.placementIndex, marble: index })
        }
      }
    }
  }

  const updateToggles = (onEvent?: (event: RunEvent) => void): void => {
    for (const entry of pieces) {
      if (entry.behavior?.kind !== 'toggle' || entry.riders.size === 0 || !entry.state) {
        continue
      }
      for (const index of [...entry.riders]) {
        const marble = marbles[index]
        if (!marble) {
          entry.riders.delete(index)
          continue
        }
        const { x, y } = marble.body.position
        const { left, right, bottom, top } = entry.footprint
        // A marble riding in from the row above sits above the footprint, so the
        // exit test allows a margin of one marble radius.
        const margin = MARBLE_KINDS[marble.kind].radius + 0.06
        const inside = x > left - margin && x < right + margin && y > bottom - margin && y < top + margin
        if (inside && isActive(marble)) {
          continue
        }
        entry.riders.delete(index)
        entry.state.flipped = !entry.state.flipped
        const showing = entry.bodies[0]?.collisionFilterGroup === SOLID_GROUP ? 1 : 0
        entry.bodies.forEach((body, bodyIndex) => setSolid(body, bodyIndex === showing))
        onEvent?.({ kind: 'toggle', placementIndex: entry.placementIndex, flipped: entry.state.flipped })
      }
    }
  }

  const recordContacts = (): void => {
    for (const contact of world.contacts) {
      const a = pieceByBody.get(contact.bi.id) ?? pieceByBody.get(contact.bj.id)
      if (a && !run.firstContacts.has(a.placementIndex)) {
        run.firstContacts.set(a.placementIndex, run.steps)
      }
    }
  }

  run.tick = (onEvent?: (event: RunEvent) => void): RunStatus => {
    if (run.status !== 'running') {
      return run.status
    }

    for (const marble of marbles) {
      if (marble.tracker.status === 'waiting' && run.elapsed + 1e-9 >= marble.releaseAt) {
        marble.tracker.status = 'rolling'
        world.addBody(marble.body)
        marble.path.push([marble.body.position.x, marble.body.position.y])
        marble.pathSteps.push(run.steps)
        onEvent?.({ kind: 'release', marble: marble.index })
      }
    }

    world.step(FIXED_STEP_S)
    run.steps += 1
    run.elapsed += FIXED_STEP_S
    recordContacts()
    applyBehaviors(onEvent)
    updateToggles(onEvent)

    for (const marble of marbles) {
      if (!isActive(marble)) {
        continue
      }
      const { body } = marble
      const speed = body.velocity.length()
      if (speed > MAX_SPEED) {
        body.velocity.scale(MAX_SPEED / speed, body.velocity)
      }
      const x = body.position.x
      const y = body.position.y
      if (run.steps % PATH_SAMPLE_EVERY === 0) {
        marble.path.push([x, y])
        marble.pathSteps.push(run.steps)
      }

      gemCenters.forEach(([gx, gy], gem) => {
        if (!run.gems.has(gem) && Math.hypot(x - gx, y - gy) < GEM_PICKUP_RADIUS) {
          run.gems.add(gem)
          onEvent?.({ kind: 'gem', gem, marble: marble.index })
        }
      })

      const basket = baskets.findIndex((candidate) => x > candidate.left && x < candidate.right && y > candidate.bottom && y < candidate.top)
      const target = baskets[basket]
      const refusal = !target ? null : target.accepts !== undefined && target.accepts !== marble.kind ? 'wrong' : target.held >= target.capacity ? 'full' : null
      const status = updateMarbleTracker(marble.tracker, level, {
        x,
        y,
        speed: Math.min(speed, MAX_SPEED),
        basket,
        refusal,
      }, FIXED_STEP_S)
      if (status === 'home' && target) {
        target.held += 1
        // Settled marbles drop out of the world so later ones never pile up on them.
        world.removeBody(body)
        marble.path.push([x, y])
        marble.pathSteps.push(run.steps)
        onEvent?.({ kind: 'home', marble: marble.index, basket: marble.tracker.basket })
      }
    }

    run.status = judgeRun(marbles.map((marble) => marble.tracker.status), run.elapsed, run.timeoutAt)

    return run.status
  }

  return run
}

export interface RunResult {
  status: RunStatus
  /** Index of the marble whose failure ended the run, else -1. */
  failedMarble: number
  paths: Vec2[][]
  pathSteps: number[][]
  elapsed: number
  gems: number
  allGems: boolean
  /** Marbles that reached an accepting basket. */
  home: number
  firstContacts: Map<number, number>
}

/** Runs a level headlessly to completion (tests, solution proofs, the level search). */
export function simulateRun(level: LevelDef, placements: readonly PiecePlacement[]): RunResult {
  const run = buildRunWorld(level, placements)
  let status: RunStatus = 'running'
  while (status === 'running') {
    status = run.tick()
  }

  return summarizeRun(level, run)
}

export function summarizeRun(level: LevelDef, run: RunWorld): RunResult {
  const failed = run.marbles.find((marble) => marble.tracker.status === run.status)

  return {
    status: run.status,
    failedMarble: run.status === 'won' || run.status === 'timeout' ? -1 : failed?.index ?? -1,
    paths: run.marbles.map((marble) => marble.path),
    pathSteps: run.marbles.map((marble) => marble.pathSteps),
    elapsed: run.elapsed,
    gems: run.gems.size,
    allGems: run.gems.size === level.gems.length,
    home: run.marbles.filter((marble) => marble.tracker.status === 'home').length,
    firstContacts: run.firstContacts,
  }
}
