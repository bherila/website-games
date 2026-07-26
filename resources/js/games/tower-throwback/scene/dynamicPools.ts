/**
 * Per-frame dynamic pass — fixed-cap InstancedMesh pools for person dots,
 * elevator cars, queue-overflow badges, full-car badges, and occupancy bars. Instances beyond
 * the live count are hidden by clamping `mesh.count` (equivalent to the
 * zero-scale convention, with fewer vertices submitted). 5 draw calls.
 *
 * PRESENTATION LAYER: the sim is authoritative but its motion is not framerate
 * art — cars cover 20 floors/real-second at 1× and far more at 8×/16×, which
 * reads as teleporting. Each car and person keeps render-only visual state
 * that GLIDES toward the sim position at a capped, followable speed and snaps
 * when the sim has run far ahead. This never feeds back into the engine
 * (determinism untouched); entries snap on first sight, are dropped when the
 * entity disappears, and keep settling while the sim is paused. Riders render
 * at their car's VISUAL y so they stay inside the gliding cabin.
 *
 * Queues longer than QUEUE_RENDER_MAX at one stop draw the first
 * QUEUE_RENDER_MAX dots plus one badge marker (text-free for now).
 */

import * as THREE from 'three'

import { itemDef, shaftDef } from '../engine/catalog'
import { getMap } from '../engine/maps'
import type { Car, EngineState } from '../gameTypes'
import { dwellRenderSlot, isDwellingVisitor } from './dwellSlots'
import {
  QUEUE_ICON_HEIGHT,
  QUEUE_ICON_WIDTH,
  QUEUE_ICON_Z,
  QUEUE_RENDER_MAX,
  queueOverflowBadgeX,
  queueSlotX,
  resolveQueuedRender,
} from './elevatorQueues'
import { FLOOR_H, getPalette, personColor } from './palette'
import {
  approach,
  PERSON_SNAP_FLOORS,
  PERSON_SNAP_TILES,
  PERSON_VISUAL_FLOORS_PER_SEC,
  PERSON_VISUAL_TILES_PER_SEC,
  type SceneFrame,
} from './sceneFrame'
import { disposeObject, hexColor } from './threeUtils'

export const PERSON_CAP = 4000
export const CAR_CAP = 256
export const BADGE_CAP = 256
export const FULL_BADGE_CAP = 256
export const BAR_CAP = 2048
export { QUEUE_RENDER_MAX } from './elevatorQueues'

const Z_PERSON = 1
const Z_CAR = 0.9
const Z_BADGE = 1.2
const Z_FULL_BADGE = 1.25
const Z_BAR = 1.1
const FULL_BADGE_SIZE = 1.3
export const FULL_BADGE_COLOR = 0xe0442a

export function carIsFull(capacity: number, car: Pick<Car, 'passengerIds'>): boolean {
  return car.passengerIds.length >= capacity
}

export interface DynamicPools {
  group: THREE.Group
  persons: THREE.InstancedMesh
  cars: THREE.InstancedMesh
  badges: THREE.InstancedMesh
  fullBadges: THREE.InstancedMesh
  bars: THREE.InstancedMesh
  /** Render-only person glide state, keyed by person id. */
  personVisual: Map<number, { x: number; floor: number }>
}

export interface PoolUsage {
  used: number
  needed: number
  cap: number
  overflow: number
  atCap: boolean
}

export interface DynamicPoolUtilization {
  persons: PoolUsage
  cars: PoolUsage
  badges: PoolUsage
  fullBadges: PoolUsage
  bars: PoolUsage
}

interface DynamicUsageCounts {
  persons: number
  cars: number
  badges: number
  fullBadges: number
  bars: number
}

const QUAD = new THREE.PlaneGeometry(1, 1)
QUAD.userData.cached = true

function pool(cap: number, z: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(QUAD, new THREE.MeshBasicMaterial(), cap)
  mesh.count = 0
  mesh.position.z = z
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false
  return mesh
}

function fullBadgeMaterial(): THREE.MeshBasicMaterial {
  const fallback = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: FULL_BADGE_COLOR })
  if (typeof document === 'undefined') {
    return fallback()
  }

  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  let context: CanvasRenderingContext2D | null
  try {
    context = canvas.getContext('2d')
  } catch {
    return fallback()
  }
  if (!context) {
    return fallback()
  }

  context.fillStyle = hexColor(FULL_BADGE_COLOR)
  context.beginPath()
  context.moveTo(12, 4)
  context.lineTo(52, 4)
  context.quadraticCurveTo(60, 4, 60, 12)
  context.lineTo(60, 52)
  context.quadraticCurveTo(60, 60, 52, 60)
  context.lineTo(12, 60)
  context.quadraticCurveTo(4, 60, 4, 52)
  context.lineTo(4, 12)
  context.quadraticCurveTo(4, 4, 12, 4)
  context.closePath()
  context.fill()
  context.fillStyle = '#ffffff'
  context.font = 'bold 44px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('F', 32, 35)

  const texture = new THREE.CanvasTexture(canvas)
  return new THREE.MeshBasicMaterial({ depthWrite: false, map: texture, transparent: true })
}

function fullBadgePool(): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(QUAD, fullBadgeMaterial(), FULL_BADGE_CAP)
  mesh.count = 0
  mesh.position.z = Z_FULL_BADGE
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false
  return mesh
}

export function createDynamicPools(scene: THREE.Scene): DynamicPools {
  const group = new THREE.Group()
  const persons = pool(PERSON_CAP, Z_PERSON)
  const cars = pool(CAR_CAP, Z_CAR)
  const badges = pool(BADGE_CAP, Z_BADGE)
  const fullBadges = fullBadgePool()
  const bars = pool(BAR_CAP, Z_BAR)
  group.add(persons, cars, badges, fullBadges, bars)
  scene.add(group)
  return { group, persons, cars, badges, fullBadges, bars, personVisual: new Map() }
}

const dummy = new THREE.Object3D()
const colorScratch = new THREE.Color()

function put(mesh: THREE.InstancedMesh, i: number, x: number, y: number, w: number, h: number, color: number, z = 0): void {
  dummy.position.set(x, y, z)
  dummy.scale.set(w, h, 1)
  dummy.rotation.set(0, 0, 0)
  dummy.updateMatrix()
  mesh.setMatrixAt(i, dummy.matrix)
  mesh.setColorAt(i, colorScratch.setHex(color))
}

function commit(mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = count
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true
  }
}

function poolUsage(used: number, needed: number, cap: number): PoolUsage {
  return {
    used,
    needed,
    cap,
    overflow: Math.max(0, needed - cap),
    atCap: used >= cap,
  }
}

function countDynamicUsage(state: EngineState): DynamicUsageCounts {
  const queueTally = new Map<string, number>()
  let personCount = 0
  for (const person of state.people) {
    if (person.state === 'queued') {
      const leg = person.legs[person.legIndex]
      const key = `${leg?.shaftId ?? -1}:${person.floor}`
      const tally = (queueTally.get(key) ?? 0) + 1
      queueTally.set(key, tally)
      if (tally > QUEUE_RENDER_MAX) {
        continue
      }
    }
    personCount += 1
  }

  let badgeCount = 0
  for (const count of queueTally.values()) {
    if (count <= QUEUE_RENDER_MAX) {
      continue
    }
    badgeCount += 1
  }

  let barCount = 0
  for (const unit of state.units) {
    const capacity = itemDef(unit.kind).capacity
    if (!unit.occupied || capacity === undefined || capacity === 0) {
      continue
    }
    const pop = unit.population
    const fill = Math.min(1, (pop.low + pop.med + pop.high + pop.vip) / capacity)
    if (fill <= 0) {
      continue
    }
    barCount += 1
  }

  const carCount = state.shafts.reduce((sum, shaft) => sum + shaft.cars.length, 0)
  const fullBadgeCount = state.shafts.reduce(
    (sum, shaft) => sum + shaft.cars.filter((car) => carIsFull(shaftDef(shaft.kind).carCapacity, car)).length,
    0,
  )

  return {
    persons: personCount,
    cars: carCount,
    badges: badgeCount,
    fullBadges: fullBadgeCount,
    bars: barCount,
  }
}

export function measureDynamicPoolUtilization(state: EngineState, personCap = PERSON_CAP): DynamicPoolUtilization {
  const needed = countDynamicUsage(state)
  return {
    persons: poolUsage(Math.min(needed.persons, personCap), needed.persons, personCap),
    cars: poolUsage(Math.min(needed.cars, CAR_CAP), needed.cars, CAR_CAP),
    badges: poolUsage(Math.min(needed.badges, BADGE_CAP), needed.badges, BADGE_CAP),
    fullBadges: poolUsage(Math.min(needed.fullBadges, FULL_BADGE_CAP), needed.fullBadges, FULL_BADGE_CAP),
    bars: poolUsage(Math.min(needed.bars, BAR_CAP), needed.bars, BAR_CAP),
  }
}

/**
 * @param drawPeopleAndCars When true (the default, and the atlas-not-loaded
 *   fallback), this pool draws colored person/car quads. When the style-gate
 *   atlas is active it owns people + cars, so the controller passes `false` and
 *   this pool renders only queue badges + occupancy bars — preventing the
 *   double-draw where the colored quads shadowed the textured sprites.
 */
export function syncDynamic(
  pools: DynamicPools,
  state: EngineState,
  frame: SceneFrame,
  dtSec = 0,
  drawPeopleAndCars = true,
): void {
  const palette = getPalette(getMap(state.mapId).paletteTheme)
  const walkStep = PERSON_VISUAL_TILES_PER_SEC * dtSec
  const climbStep = PERSON_VISUAL_FLOORS_PER_SEC * dtSec

  // Rider y positions come from their car's VISUAL glide; tallies drive badges.
  let carCount = 0
  let fullBadgeCount = 0
  for (const shaft of state.shafts) {
    const def = shaftDef(shaft.kind)
    for (const car of shaft.cars) {
      const key = `${shaft.id}:${car.index}`
      const visual = frame.carVisual.get(key)
      if (!visual) {
        continue
      }
      if (carIsFull(def.carCapacity, car) && fullBadgeCount < FULL_BADGE_CAP) {
        put(
          pools.fullBadges,
          fullBadgeCount,
          shaft.x + def.width / 2,
          visual.y * FLOOR_H + FLOOR_H * 1.15,
          FULL_BADGE_SIZE,
          FULL_BADGE_SIZE,
          0xffffff,
        )
        fullBadgeCount += 1
      }
      if (drawPeopleAndCars && carCount < CAR_CAP) {
        // Bright cabin against the darker rail; doors-open flashes lighter.
        put(
          pools.cars,
          carCount,
          shaft.x + def.width / 2,
          visual.y * FLOOR_H + FLOOR_H * 0.4,
          def.width - 0.4,
          FLOOR_H * 0.8,
          car.state === 'doors' ? palette.carCabinDoors : palette.carCabin,
        )
        carCount += 1
      }
    }
  }
  commit(pools.cars, carCount)
  commit(pools.fullBadges, fullBadgeCount)

  const seenPeople = new Set<number>()
  let personCount = 0
  let badgeCount = 0
  for (const person of state.people) {
    let targetX = person.x
    let targetFloor = person.floor
    let queued = false
    const riding = person.state === 'riding'
    if (riding) {
      const carY = frame.riderY.get(person.id)
      if (carY !== undefined) {
        targetFloor = carY
      }
    } else if (isDwellingVisitor(person)) {
      const unit = frame.unitsById.get(person.destUnitId)
      if (unit) {
        const slot = dwellRenderSlot(person.id, unit)
        targetX = slot.x
        targetFloor = slot.floor
      }
    } else if (person.state === 'queued') {
      const queuedRender = resolveQueuedRender(person, frame)
      if (!queuedRender) {
        continue
      }
      const { shaft, rank } = queuedRender
      if (rank === QUEUE_RENDER_MAX && badgeCount < BADGE_CAP) {
        put(pools.badges, badgeCount, queueOverflowBadgeX(shaft), person.floor * FLOOR_H + 1.6, 1.4, 1.4, palette.queueBadge)
        badgeCount += 1
      }
      if (rank >= QUEUE_RENDER_MAX) {
        continue
      }
      queued = true
      targetX = queueSlotX(shaft, rank)
    }
    if (drawPeopleAndCars && personCount < PERSON_CAP) {
      seenPeople.add(person.id)
      let visual = pools.personVisual.get(person.id)
      if (!visual) {
        visual = { x: targetX, floor: targetFloor } // first sight → snap
        pools.personVisual.set(person.id, visual)
      }
      visual.x = approach(visual.x, targetX, walkStep, PERSON_SNAP_TILES)
      // Riders track the cabin's glide exactly; walkers/climbers stroll.
      visual.floor = riding ? targetFloor : approach(visual.floor, targetFloor, climbStep, PERSON_SNAP_FLOORS)
      put(
        pools.persons,
        personCount,
        visual.x,
        visual.floor * FLOOR_H + 0.65,
        queued ? QUEUE_ICON_WIDTH : 0.6,
        queued ? QUEUE_ICON_HEIGHT : 1.2,
        personColor(palette, person),
        queued ? QUEUE_ICON_Z - Z_PERSON : 0,
      )
      personCount += 1
    }
  }
  for (const id of pools.personVisual.keys()) {
    if (!seenPeople.has(id)) {
      pools.personVisual.delete(id)
    }
  }
  commit(pools.persons, personCount)

  commit(pools.badges, badgeCount)

  let barCount = 0
  for (const unit of state.units) {
    if (barCount >= BAR_CAP) {
      break
    }
    const capacity = itemDef(unit.kind).capacity
    if (!unit.occupied || capacity === undefined || capacity === 0) {
      continue
    }
    const pop = unit.population
    const fill = Math.min(1, (pop.low + pop.med + pop.high + pop.vip) / capacity)
    if (fill <= 0) {
      continue
    }
    put(
      pools.bars,
      barCount,
      unit.x + (unit.width * fill) / 2,
      (unit.floor + unit.storeys) * FLOOR_H - 0.25,
      unit.width * fill,
      0.25,
      palette.occupancyBar,
    )
    barCount += 1
  }
  commit(pools.bars, barCount)
}

export function disposeDynamicPools(pools: DynamicPools): void {
  pools.group.parent?.remove(pools.group)
  disposeObject(pools.group)
}
