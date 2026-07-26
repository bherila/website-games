import * as THREE from 'three'

import { CAR_COLORS, CAR_PATTERNS, type GameState, type Passenger } from '../../gameEngine'
import { PARKING_APRON_QUEUE_EDGE_Z } from '../builders/parkingRow'
import { createPassengerMesh } from '../builders/passengerMesh'
import { PARKING_SLOT_APPROACH_Z, QUEUE_Z } from '../sceneConstants'
import {
  parkingSlotPosition,
  passengerQueueLaneOffset,
  queueLayoutForState,
  queueVisualPosition,
} from '../sceneGeometry'
import type { BoardingPassengerRenderItem } from '../sceneTypes'
import { disposeObject } from '../threeUtils'

const WALK_Y = 0.12
/** Walking lane on the slab between its north curb and the slot rectangles. */
const SLOT_CORRIDOR_Z = PARKING_SLOT_APPROACH_Z

export function animateBoardingPassengers(passengers: BoardingPassengerRenderItem[], elapsed: number): void {
  for (let index = passengers.length - 1; index >= 0; index -= 1) {
    const passenger = passengers[index]
    if (!passenger) {
      continue
    }

    const progress = Math.min(1, Math.max(0, (elapsed - passenger.startedAt) / passenger.duration))
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - (Math.pow(-2 * progress + 2, 2) / 2)
    positionAlongPath(passenger, eased * passenger.totalLength)
    passenger.mesh.position.y = WALK_Y + Math.abs(Math.sin(eased * passenger.totalLength * 6)) * 0.05

    if (progress >= 1) {
      passenger.mesh.parent?.remove(passenger.mesh)
      disposeObject(passenger.mesh)
      passengers.splice(index, 1)
    }
  }
}

function positionAlongPath(passenger: BoardingPassengerRenderItem, distance: number): void {
  let remaining = Math.max(0, Math.min(distance, passenger.totalLength))
  for (let segment = 0; segment < passenger.segmentLengths.length; segment += 1) {
    const length = passenger.segmentLengths[segment] ?? 0
    const start = passenger.path[segment]
    const end = passenger.path[segment + 1]
    if (!start || !end) {
      break
    }

    if (remaining <= length || segment === passenger.segmentLengths.length - 1) {
      const t = length > 0 ? remaining / length : 1
      passenger.mesh.position.lerpVectors(start, end, Math.min(1, t))
      passenger.mesh.rotation.y = Math.atan2(end.x - start.x, end.z - start.z)

      return
    }

    remaining -= length
  }

  const last = passenger.path[passenger.path.length - 1]
  if (last) {
    passenger.mesh.position.copy(last)
  }
}

/**
 * Boarding passengers walk like people instead of flying diagonally across
 * the lot: out of the gate, straight down the crosswalk, along the corridor
 * behind the parking slots, then into their car's space.
 */
export function boardingWalkPath(
  from: THREE.Vector3,
  to: THREE.Vector3,
  capRadius: number,
): THREE.Vector3[] {
  const gateZ = QUEUE_Z + capRadius + 0.72
  const crosswalkExitZ = Math.max(gateZ, PARKING_APRON_QUEUE_EDGE_Z + 0.28)
  const corridorZ = Math.max(crosswalkExitZ, SLOT_CORRIDOR_Z)
  const candidates = [
    from.clone(),
    new THREE.Vector3(0, WALK_Y, gateZ),
    new THREE.Vector3(0, WALK_Y, crosswalkExitZ),
    new THREE.Vector3(to.x, WALK_Y, corridorZ),
    to.clone(),
  ]

  const path: THREE.Vector3[] = []
  for (const point of candidates) {
    const previous = path[path.length - 1]
    if (!previous || previous.distanceTo(point) > 0.05) {
      path.push(point)
    }
  }

  return path
}

export function startBoardingPassengerAnimations(
  previousState: GameState,
  state: GameState,
  passengerOffsets: Map<string, number>,
  passengerPhase: number,
  effects: THREE.Group,
  boardingPassengers: BoardingPassengerRenderItem[],
  colorblindMode = false,
): Map<string, number> {
  const currentPassengerIds = new Set(state.passengerQueue.map((passenger) => passenger.id))
  const removedPassengers = previousState.passengerQueue
    .filter((passenger) => !currentPassengerIds.has(passenger.id))
    .slice(0, 8)
  const queueLayout = queueLayoutForState(previousState)
  const boardingAssignments = boardingAssignmentsForTransition(previousState, state, removedPassengers)
  const departureDelays = new Map<string, number>()
  const now = performance.now() / 1000

  for (const assignment of boardingAssignments) {
    const offset = passengerOffsets.get(assignment.passenger.id) ?? 0
    const from = queueVisualPosition(
      passengerPhase + offset,
      queueLayout,
      passengerQueueLaneOffset(assignment.passenger.id),
    )
    from.y = WALK_Y
    const mesh = createPassengerMesh(CAR_COLORS[assignment.passenger.color].hex, {
      colorblindMode,
      pattern: CAR_PATTERNS[assignment.passenger.color],
    })
    mesh.position.copy(from)
    effects.add(mesh)
    const path = boardingWalkPath(from, assignment.to, queueLayout.capRadius)
    const segmentLengths = path.slice(1).map((point, segment) => point.distanceTo(path[segment] ?? point))
    const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0)
    const duration = Math.max(0.6, Math.min(1.6, totalLength * 0.18))
    boardingPassengers.push({
      carId: assignment.carId,
      mesh,
      path,
      segmentLengths,
      totalLength,
      startedAt: now,
      duration,
    })

    departureDelays.set(assignment.carId, Math.max(departureDelays.get(assignment.carId) ?? now, now + duration + 0.16))
  }

  return departureDelays
}

export function boardingAssignmentsForTransition(
  previousState: GameState,
  state: GameState,
  removedPassengers: Passenger[],
): Array<{ carId: string, passenger: Passenger, to: THREE.Vector3 }> {
  const pendingPassengers = [...removedPassengers]
  const assignments: Array<{ carId: string, passenger: Passenger, to: THREE.Vector3 }> = []
  const previousParkedCars = previousState.cars
    .filter((candidate) => candidate.status === 'parked' && candidate.parkingSlotId)
    .sort((left, right) => parkingSlotSortValue(previousState, left.parkingSlotId) - parkingSlotSortValue(previousState, right.parkingSlotId))

  for (const previousCar of previousParkedCars) {
    const currentCar = state.cars.find((candidate) => candidate.id === previousCar.id)
    const boardedDelta = Math.max(0, (currentCar?.boarded ?? previousCar.boarded) - previousCar.boarded)
    if (boardedDelta <= 0 || !previousCar.parkingSlotId) {
      continue
    }

    const slot = previousState.parkingSlots.find((candidate) => candidate.id === previousCar.parkingSlotId)
    if (!slot) {
      continue
    }

    for (let seat = 0; seat < boardedDelta; seat += 1) {
      const passenger = pendingPassengers.shift()
      if (!passenger) {
        return assignments
      }

      assignments.push({
        carId: previousCar.id,
        passenger,
        to: boardingSeatTarget(slot.index, slot.kind, previousCar.boarded + seat),
      })
    }
  }

  return assignments
}

export function boardingSeatTarget(index: number, kind: 'regular' | 'vip', boardedIndex: number): THREE.Vector3 {
  const position = parkingSlotPosition(index, kind)
  const sideOffset = boardedIndex % 2 === 0 ? -0.18 : 0.18
  const rowOffset = Math.floor(boardedIndex / 2) * 0.18

  return new THREE.Vector3(position.x + sideOffset, 0.14, position.z + 0.22 - rowOffset)
}

export function parkingSlotSortValue(state: GameState, slotId: string | null): number {
  const slot = state.parkingSlots.find((candidate) => candidate.id === slotId)
  if (!slot) {
    return 99
  }

  return slot.kind === 'vip' ? -1 : slot.index
}
