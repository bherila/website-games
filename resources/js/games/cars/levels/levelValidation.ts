import {
  canMoveCar,
  createStateFromLevelDef,
  findSolvingOrder,
  type GameState,
  getCarOccupiedCells,
  moveCarToParking,
  validateParkingSolution,
} from '../gameEngine'
import { BOARD_HEIGHT, BOARD_WIDTH, type Direction, lengthForCapacity, STARTING_REGULAR_SLOTS } from '../gameTypes'
import type { LevelDef } from './levelTypes'

export interface LevelValidationResult {
  levelId: number
  errors: string[]
  state: GameState
}

/**
 * Structural + solvability audit for an authored level. Returns every problem
 * found so a broken layout reports all its issues in one test run.
 */
export function validateLevelDef(def: LevelDef): LevelValidationResult {
  const errors: string[] = []
  const board = { boardWidth: BOARD_WIDTH, boardHeight: BOARD_HEIGHT }

  const placed: SpanCar[] = []
  for (const [index, tunnel] of (def.tunnels ?? []).entries()) {
    const first = tunnel.cars[0]
    if (!first) {
      errors.push(`tunnel ${index + 1} has no cars`)
      continue
    }

    if (tunnel.cars.some((stackCar) => stackCar.capacity !== first.capacity)) {
      errors.push(`tunnel ${index + 1} mixes capacities; all stacked cars must share one footprint`)
    }

    placed.push({
      label: `tunnel ${index + 1}`,
      direction: tunnel.direction,
      length: lengthForCapacity(first.capacity),
      position: { x: tunnel.x, y: tunnel.y },
    })
  }

  for (const [index, carDef] of def.cars.entries()) {
    placed.push({
      label: `car ${index + 1} (${carDef.capacity}-seat ${carDef.direction} @${carDef.x},${carDef.y})`,
      direction: carDef.direction,
      length: lengthForCapacity(carDef.capacity),
      position: { x: carDef.x, y: carDef.y },
    })
  }

  const cellOwners = new Map<string, string>()
  for (const item of placed) {
    const footprint = getCarOccupiedCells(
      { direction: item.direction, length: item.length, position: item.position },
      board,
    )
    const rawCells = carCellSpan(item)
    if (rawCells.some((cell) => cell.x < 0 || cell.x >= BOARD_WIDTH || cell.y < 0 || cell.y >= BOARD_HEIGHT)) {
      errors.push(`${item.label} extends off the board`)
    }

    for (const cell of footprint) {
      const key = `${cell.x},${cell.y}`
      const owner = cellOwners.get(key)
      if (owner) {
        errors.push(`${item.label} overlaps ${owner} at (${cell.x},${cell.y})`)
      } else {
        cellOwners.set(key, item.label)
      }
    }
  }

  for (let left = 0; left < placed.length; left += 1) {
    for (let right = left + 1; right < placed.length; right += 1) {
      const a = placed[left]
      const b = placed[right]
      if (!a || !b) {
        continue
      }

      const gap = centerlineDistance(a, b)
      if (gap < MIN_VISUAL_CLEARANCE) {
        errors.push(`${a.label} visually collides with ${b.label} (centerline gap ${gap.toFixed(2)} cells)`)
      }
    }
  }

  const state = createStateFromLevelDef(def)

  const totalSeats = state.cars.reduce((sum, stateCar) => sum + stateCar.capacity, 0)
  if (state.passengerQueue.length !== totalSeats) {
    errors.push(`queue has ${state.passengerQueue.length} passengers for ${totalSeats} seats`)
  }

  if (def.queue) {
    const missingColor = def.cars.some((carDef) => !carDef.color)
      || (def.tunnels ?? []).some((tunnel) => tunnel.cars.some((stackCar) => !stackCar.color))
    if (missingColor) {
      errors.push('explicit-queue level must give every car a color')
    }
  }

  for (const [index, carDef] of def.cars.entries()) {
    if (carDef.colorHidden) {
      const stateCar = state.cars.find(
        (candidate) => candidate.position.x === carDef.x && candidate.position.y === carDef.y && candidate.tunnelId === null,
      )
      if (stateCar && canMoveCar(state, stateCar.id)) {
        errors.push(`car ${index + 1} is colorHidden but starts unblocked, so it reveals immediately`)
      }
    }
  }

  const order = findSolvingOrder(state)
  if (!order || order.length !== state.cars.length) {
    const stuck = greedyPeelRemainder(state)
      .map((stateCar) => `${stateCar.id} (${stateCar.capacity}-seat ${stateCar.direction} @${stateCar.position.x},${stateCar.position.y} ${stateCar.status})`)
    errors.push(`board solver cannot clear every car; deadlocked: ${stuck.join('; ')}`)
  } else if (!validateParkingSolution(state, order, { slotBudget: STARTING_REGULAR_SLOTS })) {
    errors.push(`no scripted solution finishes on the ${STARTING_REGULAR_SLOTS} starting slots`)
  }

  return { levelId: def.id, errors, state }
}

/**
 * Removes cars one at a time with no slot budget (each move immediately
 * departs) until nothing else can leave; whatever remains is the actual
 * deadlock knot for the error message.
 */
function greedyPeelRemainder(initial: GameState): GameState['cars'] {
  let state = structuredClone(initial)
  let progressMade = true
  while (progressMade) {
    progressMade = false
    for (const stateCar of state.cars) {
      if (stateCar.status !== 'field' || !canMoveCar(state, stateCar.id)) {
        continue
      }

      const next = structuredClone(moveCarToParking(state, stateCar.id))
      const moved = next.cars.find((candidate) => candidate.id === stateCar.id)
      if (!moved || moved.status !== 'parked') {
        continue
      }

      const slot = next.parkingSlots.find((candidate) => candidate.id === moved.parkingSlotId)
      if (slot) {
        slot.occupiedCarId = null
      }

      moved.status = 'departed'
      moved.parkingSlotId = null
      moved.boarded = moved.capacity
      next.failedLevel = null
      state = next
      progressMade = true
      break
    }
  }

  return state.cars.filter((stateCar) => stateCar.status !== 'departed')
}

/**
 * Minimum distance in cell units between two cars' centerline segments before
 * their rendered bodies (≈0.74 cells wide) visually brush. Diagonal cars in
 * adjacent lanes pass at 1/√2 ≈ 0.71 and look overlapped even though their
 * occupied cells are disjoint — this catches what the cell check cannot.
 */
const MIN_VISUAL_CLEARANCE = 0.8

interface SpanCar {
  label: string
  direction: Direction
  length: number
  position: { x: number, y: number }
}

function carCellSpan(item: SpanCar): { x: number, y: number }[] {
  const cells: { x: number, y: number }[] = []
  for (let offset = 0; offset < item.length; offset += 1) {
    if (item.direction === 'left' || item.direction === 'right') {
      cells.push({ x: item.position.x + offset, y: item.position.y })
    } else if (item.direction === 'up' || item.direction === 'down') {
      cells.push({ x: item.position.x, y: item.position.y + offset })
    } else if (item.direction === 'up-right' || item.direction === 'down-left') {
      cells.push({ x: item.position.x + offset, y: item.position.y + item.length - 1 - offset })
    } else {
      cells.push({ x: item.position.x + offset, y: item.position.y + offset })
    }
  }

  return cells
}

function centerlineDistance(a: SpanCar, b: SpanCar): number {
  const [a0, a1] = segmentEndpoints(a)
  const [b0, b1] = segmentEndpoints(b)

  return segmentToSegmentDistance(a0, a1, b0, b1)
}

function segmentEndpoints(item: SpanCar): [{ x: number, y: number }, { x: number, y: number }] {
  const cells = carCellSpan(item)
  const first = cells[0] ?? item.position
  const last = cells[cells.length - 1] ?? item.position

  return [first, last]
}

function segmentToSegmentDistance(
  a0: { x: number, y: number },
  a1: { x: number, y: number },
  b0: { x: number, y: number },
  b1: { x: number, y: number },
): number {
  if (segmentsIntersect(a0, a1, b0, b1)) {
    return 0
  }

  return Math.min(
    pointToSegmentDistance(a0, b0, b1),
    pointToSegmentDistance(a1, b0, b1),
    pointToSegmentDistance(b0, a0, a1),
    pointToSegmentDistance(b1, a0, a1),
  )
}

function segmentsIntersect(
  a0: { x: number, y: number },
  a1: { x: number, y: number },
  b0: { x: number, y: number },
  b1: { x: number, y: number },
): boolean {
  const d1 = cross(b0, b1, a0)
  const d2 = cross(b0, b1, a1)
  const d3 = cross(a0, a1, b0)
  const d4 = cross(a0, a1, b1)

  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function cross(o: { x: number, y: number }, a: { x: number, y: number }, b: { x: number, y: number }): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

function pointToSegmentDistance(
  point: { x: number, y: number },
  s0: { x: number, y: number },
  s1: { x: number, y: number },
): number {
  const dx = s1.x - s0.x
  const dy = s1.y - s0.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return Math.hypot(point.x - s0.x, point.y - s0.y)
  }

  const t = Math.max(0, Math.min(1, ((point.x - s0.x) * dx + (point.y - s0.y) * dy) / lengthSquared))

  return Math.hypot(point.x - (s0.x + t * dx), point.y - (s0.y + t * dy))
}
