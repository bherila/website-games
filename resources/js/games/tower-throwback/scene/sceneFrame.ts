import type { EngineState, Shaft, Unit } from '../gameTypes'
import { isDwellingVisitor } from './dwellSlots'

export const CAR_VISUAL_FLOORS_PER_SEC = 8
export const CAR_SNAP_FLOORS = 14
export const PERSON_VISUAL_TILES_PER_SEC = 14
export const PERSON_SNAP_TILES = 30
export const PERSON_VISUAL_FLOORS_PER_SEC = 3.5
export const PERSON_SNAP_FLOORS = 8

export interface CarVisual {
  y: number
}

/** Render-only car state shared by every scene renderer for a controller. */
export interface CarGlideStore {
  carVisual: Map<string, CarVisual>
  shaftIndexVersion: number
  shaftsById: Map<number, Shaft>
}

export interface SceneFrame {
  unitsById: ReadonlyMap<number, Unit>
  activeVisitorUnitIds: ReadonlySet<number>
  shaftsById: ReadonlyMap<number, Shaft>
  carVisual: ReadonlyMap<string, CarVisual>
  riderY: ReadonlyMap<number, number>
  queueRankByPersonId: ReadonlyMap<number, number>
}

export function createCarGlideStore(): CarGlideStore {
  return { carVisual: new Map(), shaftIndexVersion: -1, shaftsById: new Map() }
}

/** Pure easing: step `current` toward `target` by <= maxStep; snap when far. */
export function approach(current: number, target: number, maxStep: number, snapThreshold: number): number {
  const delta = target - current
  if (Math.abs(delta) > snapThreshold || Math.abs(delta) <= maxStep) {
    return target
  }
  return current + Math.sign(delta) * maxStep
}

/** Prepare one presentation frame shared by dynamic pools and atlas art. */
export function prepareSceneFrame(state: EngineState, carGlides: CarGlideStore, dtSec: number): SceneFrame {
  const unitsById = new Map(state.units.map((unit) => [unit.id, unit]))
  const activeVisitorUnitIds = new Set<number>()
  const riderY = new Map<number, number>()
  const queueRankByPersonId = new Map<number, number>()
  const queueCounts = new Map<string, number>()
  const seenCars = new Set<string>()
  const carStep = CAR_VISUAL_FLOORS_PER_SEC * dtSec

  if (carGlides.shaftIndexVersion !== state.structureVersion) {
    carGlides.shaftsById.clear()
    for (const shaft of state.shafts) {
      carGlides.shaftsById.set(shaft.id, shaft)
    }
    carGlides.shaftIndexVersion = state.structureVersion
  }

  for (const shaft of state.shafts) {
    for (const car of shaft.cars) {
      const key = `${shaft.id}:${car.index}`
      seenCars.add(key)
      let visual = carGlides.carVisual.get(key)
      if (!visual) {
        visual = { y: car.y }
        carGlides.carVisual.set(key, visual)
      }
      visual.y = approach(visual.y, car.y, carStep, CAR_SNAP_FLOORS)
      for (const personId of car.passengerIds) {
        riderY.set(personId, visual.y)
      }
    }
  }

  for (const key of carGlides.carVisual.keys()) {
    if (!seenCars.has(key)) {
      carGlides.carVisual.delete(key)
    }
  }

  for (const person of state.people) {
    if (isDwellingVisitor(person)) {
      activeVisitorUnitIds.add(person.destUnitId)
    }
    if (person.state !== 'queued') {
      continue
    }
    const leg = person.legs[person.legIndex]
    const shaftId = leg?.type === 'elevator' ? leg.shaftId : undefined
    if (shaftId === undefined || !carGlides.shaftsById.has(shaftId)) {
      continue
    }
    const key = `${shaftId}:${person.floor}`
    const rank = queueCounts.get(key) ?? 0
    queueRankByPersonId.set(person.id, rank)
    queueCounts.set(key, rank + 1)
  }

  return {
    unitsById,
    activeVisitorUnitIds,
    shaftsById: carGlides.shaftsById,
    carVisual: carGlides.carVisual,
    riderY,
    queueRankByPersonId,
  }
}
