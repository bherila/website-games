/**
 * Placement & demolition — pure validate/apply.
 *
 * `validatePlacement` is a first-failing-predicate check returning either
 * `{ ok, cost }` or `{ ok: false, reason }`; `applyPlacement` assumes a valid
 * command, mints the entity, rebuilds the grid, bumps `structureVersion`, and
 * emits a `placed` event. Affordability is NOT checked here — the economy layer
 * (later phase) reads the returned cost and handles funds / loan prompts.
 *
 * Design notes:
 * - Slab-family kinds (slab/lobby/skylobby/skybridge) are `Unit` entities; the
 *   grid's slab layer records their coverage (see grid.ts).
 * - Lobby height is carried on `EngineState.lobbyHeight` (immutable, set at
 *   new-game). The lobby entity gets `storeys = lobbyHeight`: floor 0 is the
 *   walkable slab layer, floors 1..h−1 are the atrium — painted into the unit
 *   layer so nothing can be built inside the open space, while shafts may still
 *   cross them (slab-family unit overlaps are exempt from the shaft rule).
 *   Cost = $300 × width × height.
 * - Each map's two-storey prestige structure starts on its terminal floor, so
 *   its crown pokes one storey past the playable range. Catalog metadata owns
 *   that narrow exception; the grid remains clamped to global storage bounds.
 * - Shaft base cost includes the first car; extra cars cost `carCost` via addCar
 *   (later phase). A shaft's stops are its slabbed floors (glass: floors whose
 *   neighbouring column is slabbed, since the exterior glass column has no slab
 *   of its own); a non-glass shaft may pass through unslabbed floors with no
 *   stop there. Express seeds stops from bottom + top + in-span skylobbies.
 */

import currency from 'currency.js'

import type {
  Car,
  EngineCommand,
  EngineEvent,
  EngineState,
  ItemKind,
  PlacementResult,
  Shaft,
  ShaftKind,
  Unit,
} from '../gameTypes'
import { defaultShaftProgram, GRID_WIDTH, type MapDefinition, TUNING } from '../gameTypes'
import { EXCAVATION_COST, isItemAvailable, isShaftAvailable, itemDef, shaftDef } from './catalog'
import { isSlabFamily, nearestShaftStopDistance, rebuildGrid, shaftIdAt, slabAt, slabOwnerAt, unitIdAt } from './grid'
import {
  cantileverFacing,
  endgamePlacementFloors,
  excavationExtreme,
  floorLabelFor,
  intersectingBuildExclusion,
  inwardNeighbour,
  isAnchorFloor,
  isBelowAnchor,
  isBeyond,
  isExcavated,
  isOnBuildSide,
  meetsMinimumDepth,
  outwardNeighbour,
  supportFloorFor,
  terminalFloor,
} from './mapGeometry'
import { getMap } from './maps'
import { releaseShaftOccupants, replanShaftAfterResize } from './people'

type PlaceCommand = Extract<EngineCommand, { type: 'place' }>
type PlaceShaftCommand = Extract<EngineCommand, { type: 'placeShaft' }>
type ResizeShaftCommand = Extract<EngineCommand, { type: 'resizeShaft' }>
type PlacementCommand = PlaceCommand | PlaceShaftCommand
type DemolishCommand = Extract<EngineCommand, { type: 'demolishUnit' } | { type: 'demolishShaft' }>

function err(reason: string): PlacementResult {
  return { ok: false, reason }
}

function ok(cost: number): PlacementResult {
  return { ok: true, cost }
}

interface Footprint {
  width: number
  storeys: 1 | 2 | 3
  floorLo: number
  floorHi: number
  xLo: number
  xHi: number
}

function itemFootprint(state: EngineState, cmd: PlaceCommand): Footprint {
  const def = itemDef(cmd.kind)
  const width = def.perTile ? Math.max(1, cmd.widthTiles ?? 1) : def.width
  const storeys = cmd.kind === 'lobby' ? state.lobbyHeight : def.storeys
  return {
    width,
    storeys,
    floorLo: cmd.floor,
    floorHi: cmd.floor + storeys - 1,
    xLo: cmd.x,
    xHi: cmd.x + width - 1,
  }
}

function observationDeckFacing(map: MapDefinition, fp: Footprint): Unit['facing'] | null {
  return cantileverFacing(map, fp.xLo, fp.xHi + 1, itemDef('observationDeck').cantileverTiles ?? 0)
}

function validateHorizontalBuildGeometry(map: MapDefinition, cmd: PlaceCommand, fp: Footprint): string | null {
  if (cmd.kind === 'observationDeck' && map.horizontalBuildExclusions && observationDeckFacing(map, fp) === null) {
    return 'Observation Deck must cantilever toward the Waterfall gap'
  }
  const exclusion = intersectingBuildExclusion(map, fp.xLo, fp.xHi + 1)
  if (!exclusion) {
    return null
  }
  if (cmd.kind === 'skybridge' && fp.xLo <= exclusion.xMin && fp.xHi + 1 >= exclusion.xMaxExclusive) {
    return null
  }
  if (cmd.kind === 'observationDeck' && observationDeckFacing(map, fp) !== null) {
    return null
  }
  return `${exclusion.label} — use a Skybridge to cross`
}

function glassColumnAt(state: EngineState, floor: number, x: number): boolean {
  const id = shaftIdAt(state, floor, x)
  if (id === 0) {
    return false
  }
  const shaft = state.shafts.find((s) => s.id === id - 1)
  return shaft?.kind === 'glass'
}

function unitKindAt(state: EngineState, floor: number, x: number): ItemKind | null {
  const id = unitIdAt(state, floor, x)
  if (id === 0) {
    return null
  }
  return state.units.find((u) => u.id === id - 1)?.kind ?? null
}

// ── Item placement ──────────────────────────────────────────────────────────

function validateVertical(map: MapDefinition, cmd: PlaceCommand): string | null {
  const def = itemDef(cmd.kind)
  if (cmd.kind === map.endgameItem) {
    const floors = endgamePlacementFloors(map)
    return floors.includes(cmd.floor)
      ? null
      : `${def.name} may only be placed on ${floors.map((floor) => `floor ${floorLabelFor(map, floor)}`).join(' or ')}`
  }
  if (cmd.kind === 'skylobby') {
    // A distance FROM THE LOBBY, not an absolute floor — "five floors out"
    // survives the build axis flipping.
    if (!meetsMinimumDepth(map, cmd.floor, TUNING.grid.skylobbyMinFloor)) {
      return `Skylobby must be on floor ${TUNING.grid.skylobbyMinFloor} or higher`
    }
    return null
  }
  switch (def.vertical) {
    case 'groundOnly':
      return isAnchorFloor(map, cmd.floor) ? null : `${def.name} may only be placed on the lobby floor`
    case 'undergroundOnly':
      // Geometric, not economic: parking and recycling belong below the lobby
      // whether or not that counts as excavation on this map.
      return isBelowAnchor(map, cmd.floor) ? null : `${def.name} may only be placed underground`
    case 'b10Only':
      return cmd.floor === excavationExtreme(map) ? null : `${def.name} may only be placed on floor ${floorLabelFor(map, excavationExtreme(map))}`
    case 'terminalFloor':
      return cmd.floor === terminalFloor(map) ? null : `${def.name} may only be placed on floor ${floorLabelFor(map, terminalFloor(map))}`
    case 'undergroundAllowed':
    case 'anyFloor':
      return null
    default:
      return isOnBuildSide(map, cmd.floor) ? null : `${def.name} may only be placed above ground`
  }
}

function validateSupport(map: MapDefinition, state: EngineState, cmd: PlaceCommand, fp: Footprint): string | null {
  if (cmd.kind === 'skybridge') {
    if (!slabAt(state, cmd.floor, fp.xLo - 1) || !slabAt(state, cmd.floor, fp.xHi + 1)) {
      return 'Skybridge must connect a structure at each end'
    }
    return null
  }
  if (isSlabFamily(cmd.kind)) {
    // The anchor needs no support and anchors BOTH directions.
    if (isAnchorFloor(map, cmd.floor)) {
      return null
    }
    const supportFloor = supportFloorFor(map, cmd.floor)
    for (let x = fp.xLo; x <= fp.xHi; x++) {
      // A tall lobby's atrium storeys live in the unit layer; the top one
      // supports the floor above it (the overlap rule still blocks building
      // INSIDE the atrium, so accepting any slab-family storey here is safe).
      const kindBelow = unitKindAt(state, supportFloor, x)
      const atriumBelow = kindBelow !== null && isSlabFamily(kindBelow)
      if (!slabAt(state, supportFloor, x) && !atriumBelow) {
        // "Below"/"above" describe where the support SITS, which is always the
        // side nearer the anchor.
        return supportFloor < cmd.floor
          ? 'Needs a floor directly below for support'
          : 'Needs a floor directly above for support'
      }
    }
    return null
  }
  const def = itemDef(cmd.kind)
  const topFloor = Math.min(fp.floorHi, map.floorRange.max)
  const connector = cmd.kind === 'stairs' || cmd.kind === 'escalator'
  const cantileverTiles = def.cantileverTiles ?? 0
  const facing = cmd.kind === 'observationDeck' ? observationDeckFacing(map, fp) : 'right'
  const supportXLo = facing === 'left' ? fp.xLo + cantileverTiles : fp.xLo
  const supportXHi = facing === 'left' ? fp.xHi : fp.xHi - cantileverTiles
  for (let floor = fp.floorLo; floor <= topFloor; floor++) {
    for (let x = supportXLo; x <= supportXHi; x++) {
      if (!slabAt(state, floor, x)) {
        // Direction-neutral: the supported span is the LAST N tiles for a
        // left-facing deck and the first N for a right-facing one.
        return cantileverTiles > 0
          ? `${def.name} needs floor beneath its ${fp.width - cantileverTiles} anchored tiles`
          : 'Needs a floor beneath every tile'
      }
      const owner = slabOwnerAt(state, floor, x)
      if (!connector && owner !== null && owner.kind !== 'slab') {
        return 'Can only be built on plain floor space'
      }
    }
    const cantileverXLo = facing === 'left' ? fp.xLo : supportXHi + 1
    const cantileverXHi = facing === 'left' ? supportXLo - 1 : fp.xHi
    for (let x = cantileverXLo; x <= cantileverXHi; x++) {
      if (slabAt(state, floor, x)) {
        return `${def.name}'s ${cantileverTiles} cantilevered tiles must extend beyond the building edge`
      }
    }
  }
  return null
}

function validateOverlap(state: EngineState, cmd: PlaceCommand, fp: Footprint): string | null {
  if (isSlabFamily(cmd.kind)) {
    for (let floor = fp.floorLo; floor <= fp.floorHi; floor++) {
      for (let x = fp.xLo; x <= fp.xHi; x++) {
        if (slabAt(state, floor, x)) {
          return 'Overlaps an existing floor'
        }
        if (unitIdAt(state, floor, x) !== 0) {
          return 'Overlaps an existing unit'
        }
        if (glassColumnAt(state, floor, x)) {
          return 'Blocked by a glass elevator column'
        }
      }
    }
    return null
  }
  for (let floor = fp.floorLo; floor <= fp.floorHi; floor++) {
    for (let x = fp.xLo; x <= fp.xHi; x++) {
      if (unitIdAt(state, floor, x) !== 0) {
        return 'Overlaps an existing unit'
      }
      if (shaftIdAt(state, floor, x) !== 0) {
        return 'Overlaps an elevator shaft'
      }
    }
  }
  return null
}

function validateItemPlacement(state: EngineState, cmd: PlaceCommand): PlacementResult {
  const map = getMap(state.mapId)
  const def = itemDef(cmd.kind)
  const fp = itemFootprint(state, cmd)

  if (!isItemAvailable(cmd.kind, state.maxStarReached, map)) {
    if (map.disallowedItems.includes(cmd.kind)) {
      return err(`${def.name} is not available on this map`)
    }
    return err(`${def.name} requires ${def.starRequired}★`)
  }

  if (cmd.x < 0 || fp.xHi >= GRID_WIDTH) {
    return err('Out of bounds')
  }
  if (fp.floorLo < map.floorRange.min) {
    return err('Out of bounds')
  }
  if (fp.floorHi > map.floorRange.max && !def.allowsFloorRangeOverhang) {
    return err('Out of bounds')
  }

  const horizontalReason = validateHorizontalBuildGeometry(map, cmd, fp)
  if (horizontalReason) {
    return err(horizontalReason)
  }

  const verticalReason = validateVertical(map, cmd)
  if (verticalReason) {
    return err(verticalReason)
  }

  if (cmd.kind === 'skylobby' && fp.width < TUNING.grid.skylobbyMinWidth) {
    return err(`Skylobby must be at least ${TUNING.grid.skylobbyMinWidth} tiles wide`)
  }

  if (isExcavated(map, fp.floorLo) && !map.undergroundAllowed) {
    return err('Underground building is not available on this map')
  }
  if (isExcavated(map, fp.floorLo) && state.maxStarReached < TUNING.stars.undergroundStar) {
    return err(`Underground building unlocks at ${TUNING.stars.undergroundStar}★`)
  }

  if (cmd.kind === map.endgameItem) {
    if (state.star < 5 || state.maxStarReached < 5) {
      return err(`${def.name} requires a full 5★ rating`)
    }
    if (state.units.some((u) => u.kind === map.endgameItem)) {
      return err(`Only one ${def.name.toLowerCase()} may be built`)
    }
  }

  // An endgame structure with a SINGLE legal position crowns the build direction
  // and seals everything past it. One that may sit at either extreme (Niagara's
  // deck, B30 or 15) defines no "beyond" to seal — a B30 deck would otherwise
  // lock the whole map. Derived from the map's own placement floors rather than
  // its id, so the lockout stays defensive wherever the structure actually is.
  const endgameStructure = state.units.find((u) => u.kind === map.endgameItem)
  if (
    endgameStructure
    && endgamePlacementFloors(map).length === 1
    && isSlabFamily(cmd.kind)
    && isBeyond(map, fp.floorLo, endgameStructure.floor)
  ) {
    return err(`Building above the ${itemDef(endgameStructure.kind).name.toLowerCase()} is locked`)
  }

  const supportReason = validateSupport(map, state, cmd, fp)
  if (supportReason) {
    return err(supportReason)
  }

  const overlapReason = validateOverlap(state, cmd, fp)
  if (overlapReason) {
    return err(overlapReason)
  }

  if (cmd.kind === 'hotelReception' || cmd.kind === map.endgameItem) {
    let nearest = Infinity
    for (let x = fp.xLo; x <= fp.xHi; x++) {
      nearest = Math.min(nearest, nearestShaftStopDistance(state, cmd.floor, x))
    }
    if (nearest > TUNING.grid.adjacencyTiles) {
      return err(`${def.name} must be within ${TUNING.grid.adjacencyTiles} tiles of an elevator stop`)
    }
  }

  return ok(itemCost(state, cmd, fp))
}

/** THE pricing formula — charge (placement) and refund (demolition) share it. */
function unitBuildCost(state: EngineState, kind: ItemKind, floor: number, width: number): number {
  const def = itemDef(kind)
  if (kind === 'slab') {
    return (isExcavated(getMap(state.mapId), floor) ? EXCAVATION_COST : def.cost) * width
  }
  if (kind === 'lobby') {
    return def.cost * width * state.lobbyHeight
  }
  return def.perTile ? def.cost * width : def.cost
}

function itemCost(state: EngineState, cmd: PlaceCommand, fp: Footprint): number {
  return unitBuildCost(state, cmd.kind, fp.floorLo, fp.width)
}

// ── Shaft placement ───────────────────────────────────────────────────────────

function shaftColumnsSlabbed(state: EngineState, x: number, width: number, floor: number): boolean {
  for (let c = x; c < x + width; c++) {
    if (!slabAt(state, floor, c)) {
      return false
    }
  }
  return true
}

function glassFloorReachable(state: EngineState, x: number, width: number, floor: number): boolean {
  return slabAt(state, floor, x - 1) || slabAt(state, floor, x + width)
}

function computeShaftStops(state: EngineState, cmd: PlaceShaftCommand): number[] {
  const width = shaftDef(cmd.kind).width
  const landing = (floor: number): boolean =>
    cmd.kind === 'glass'
      ? glassFloorReachable(state, cmd.x, width, floor)
      : shaftColumnsSlabbed(state, cmd.x, width, floor)

  const slabbed: number[] = []
  for (let floor = cmd.bottomFloor; floor <= cmd.topFloor; floor++) {
    if (landing(floor)) {
      slabbed.push(floor)
    }
  }

  if (cmd.kind !== 'express') {
    return slabbed
  }

  const skylobbyFloors = state.units
    .filter((u) => u.kind === 'skylobby' && u.floor >= cmd.bottomFloor && u.floor <= cmd.topFloor)
    .map((u) => u.floor)
  const candidates = new Set<number>([cmd.bottomFloor, cmd.topFloor, ...skylobbyFloors])
  const slabbedSet = new Set(slabbed)
  const stops = [...candidates].filter((f) => slabbedSet.has(f)).sort((a, b) => a - b)
  const maxStops = shaftDef('express').maxStops ?? stops.length
  return stops.slice(0, maxStops)
}

function validateShaftPlacement(state: EngineState, cmd: PlaceShaftCommand, ignoreShaftId?: number): PlacementResult {
  const map = getMap(state.mapId)
  const def = shaftDef(cmd.kind)

  if (!isShaftAvailable(cmd.kind, state.maxStarReached, map)) {
    if (map.disallowedItems.includes(cmd.kind)) {
      return err(`${def.name} is not available on this map`)
    }
    return err(`${def.name} is not available yet`)
  }

  if (cmd.x < 0 || cmd.x + def.width > GRID_WIDTH) {
    return err('Out of bounds')
  }
  if (cmd.bottomFloor < map.floorRange.min || cmd.topFloor > map.floorRange.max) {
    return err('Out of bounds')
  }
  const exclusion = intersectingBuildExclusion(map, cmd.x, cmd.x + def.width)
  if (exclusion) {
    return err(`${exclusion.label} — use a Skybridge to cross`)
  }
  if (cmd.bottomFloor >= cmd.topFloor) {
    return err('Shaft must span at least two floors')
  }
  if (isExcavated(map, cmd.bottomFloor) && !map.undergroundAllowed) {
    return err('Underground building is not available on this map')
  }
  if (isExcavated(map, cmd.bottomFloor) && state.maxStarReached < TUNING.stars.undergroundStar) {
    return err(`Underground building unlocks at ${TUNING.stars.undergroundStar}★`)
  }

  const span = cmd.topFloor - cmd.bottomFloor
  if (def.maxReachFloors !== undefined && span > def.maxReachFloors) {
    return err(`${def.name} can span at most ${def.maxReachFloors} floors`)
  }

  for (let floor = cmd.bottomFloor; floor <= cmd.topFloor; floor++) {
    for (let x = cmd.x; x < cmd.x + def.width; x++) {
      const crossedKind = unitKindAt(state, floor, x)
      if (crossedKind !== null && !isSlabFamily(crossedKind)) {
        return err('Shaft would run through a unit')
      }
      const overlappingShaftId = shaftIdAt(state, floor, x) - 1
      if (overlappingShaftId >= 0 && overlappingShaftId !== ignoreShaftId) {
        return err('Overlaps an existing shaft')
      }
    }
  }

  const stops = computeShaftStops(state, cmd)
  if (stops.length === 0) {
    return err('Shaft needs at least one landing')
  }
  if (def.maxStops !== undefined && stops.length > def.maxStops) {
    return err(`${def.name} can serve at most ${def.maxStops} stops`)
  }

  return ok(shaftCost(cmd))
}

export type ShaftResizeResult =
  | { ok: true; cost: number; refund: number; stops: number[]; enabledStops: number[]; removedStops: number[] }
  | { ok: false; reason: string }

export function validateShaftResize(state: EngineState, cmd: ResizeShaftCommand): ShaftResizeResult {
  const shaft = state.shafts.find((candidate) => candidate.id === cmd.shaftId)
  if (!shaft) {
    return { ok: false, reason: 'No such shaft' }
  }
  const placementCommand: PlaceShaftCommand = {
    type: 'placeShaft',
    kind: shaft.kind,
    x: shaft.x,
    bottomFloor: cmd.bottomFloor,
    topFloor: cmd.topFloor,
  }
  const placementVerdict = validateShaftPlacement(state, placementCommand, shaft.id)
  if (!placementVerdict.ok) {
    return placementVerdict
  }

  const stops = computeShaftStops(state, placementCommand)
  const enabledStops = shaft.enabledStops.filter((floor) => stops.includes(floor))
  if (enabledStops.length === 0) {
    return { ok: false, reason: 'A resized elevator must keep at least one enabled stop' }
  }

  let addedFloors = 0
  for (let floor = cmd.bottomFloor; floor <= cmd.topFloor; floor += 1) {
    if (floor < shaft.bottomFloor || floor > shaft.topFloor) {
      addedFloors += 1
    }
  }
  let removedFloors = 0
  for (let floor = shaft.bottomFloor; floor <= shaft.topFloor; floor += 1) {
    if (floor < cmd.bottomFloor || floor > cmd.topFloor) {
      removedFloors += 1
    }
  }
  const removedStops = shaft.stops.filter((floor) => !stops.includes(floor))
  const cost = currency(shaftDef(shaft.kind).costPerFloor).multiply(addedFloors).value
  const removedFloorCost = currency(shaftDef(shaft.kind).costPerFloor).multiply(removedFloors).value
  const refund = refundOf(removedFloorCost)
  return { ok: true, cost, refund, stops, enabledStops, removedStops }
}

export function applyShaftResize(
  state: EngineState,
  cmd: ResizeShaftCommand,
  verdict: Extract<ShaftResizeResult, { ok: true }>,
): void {
  const shaft = state.shafts.find((candidate) => candidate.id === cmd.shaftId)
  if (!shaft) {
    return
  }
  shaft.bottomFloor = cmd.bottomFloor
  shaft.topFloor = cmd.topFloor
  shaft.stops = [...verdict.stops]
  shaft.enabledStops = [...verdict.enabledStops]
  for (const car of shaft.cars) {
    car.y = Math.max(cmd.bottomFloor, Math.min(cmd.topFloor, car.y))
    if (car.homeFloor !== null && !shaft.enabledStops.includes(car.homeFloor)) {
      car.homeFloor = null
    }
  }
  state.structureVersion += 1
  rebuildGrid(state)
  replanShaftAfterResize(state, shaft, verdict.removedStops)
}

/** THE shaft pricing formula — charge and refund share it. */
function shaftSpanCost(kind: ShaftKind, bottomFloor: number, topFloor: number): number {
  const def = shaftDef(kind)
  return def.baseCost + def.costPerFloor * (topFloor - bottomFloor)
}

function shaftCost(cmd: PlaceShaftCommand): number {
  return shaftSpanCost(cmd.kind, cmd.bottomFloor, cmd.topFloor)
}

// ── Public validate/apply ─────────────────────────────────────────────────────

export function validatePlacement(state: EngineState, cmd: PlacementCommand): PlacementResult {
  return cmd.type === 'place' ? validateItemPlacement(state, cmd) : validateShaftPlacement(state, cmd)
}

function newUnit(id: number, cmd: PlaceCommand, fp: Footprint, map: MapDefinition): Unit {
  return {
    id,
    kind: cmd.kind,
    floor: cmd.floor,
    x: cmd.x,
    width: fp.width,
    ...(cmd.kind === 'observationDeck' ? { facing: observationDeckFacing(map, fp) ?? 'right' } : {}),
    storeys: fp.storeys,
    grade: 'standard',
    rentTier: 'avg',
    occupied: false,
    population: { low: 0, med: 0, high: 0, vip: 0 },
    evalScore: 0,
    stressMarks: 0,
    lowEvalDays: 0,
    vacancyReason: null,
    flags: { noRestroom: false, noRoute: false, noReception: false, trashOverflow: false },
    dirty: false,
    infested: false,
    offline: false,
    damageKind: null,
    incidentPenaltyUntilDay: null,
  }
}

function newShaft(id: number, cmd: PlaceShaftCommand, stops: number[]): Shaft {
  const car: Car = {
    index: 0,
    y: stops[0] ?? cmd.bottomFloor,
    dir: 0,
    state: 'idle',
    doorTimer: 0,
    homeFloor: null,
    passengerIds: [],
  }
  return {
    id,
    kind: cmd.kind,
    x: cmd.x,
    bottomFloor: cmd.bottomFloor,
    topFloor: cmd.topFloor,
    stops: [...stops],
    enabledStops: [...stops],
    cars: [car],
    program: defaultShaftProgram(),
    stats: { avgWaitGameMin: 0, peakWaitGameMin: 0 },
  }
}

export function applyPlacement(state: EngineState, cmd: PlacementCommand): EngineEvent[] {
  const id = state.nextId
  state.nextId += 1
  let cost: number
  let event: EngineEvent
  if (cmd.type === 'place') {
    const fp = itemFootprint(state, cmd)
    cost = itemCost(state, cmd, fp)
    state.units.push(newUnit(id, cmd, fp, getMap(state.mapId)))
    event = { type: 'placed', kind: cmd.kind, cost, unitId: id }
  } else {
    cost = shaftCost(cmd)
    state.shafts.push(newShaft(id, cmd, computeShaftStops(state, cmd)))
    event = { type: 'placed', kind: cmd.kind, cost, shaftId: id }
  }
  state.structureVersion += 1
  rebuildGrid(state)
  return [event]
}

// ── Demolition ────────────────────────────────────────────────────────────────

function refundOf(cost: number): number {
  return Math.round(TUNING.economy.demolitionRefundRate * cost)
}

function unitRestsOnSlab(state: EngineState, slab: Unit): boolean {
  return state.units.some((u) => {
    if (u.id === slab.id || isSlabFamily(u.kind)) {
      return false
    }
    const uHi = u.floor + u.storeys - 1
    const floorOverlap = slab.floor >= u.floor && slab.floor <= uHi
    const xOverlap = u.x <= slab.x + slab.width - 1 && u.x + u.width - 1 >= slab.x
    return floorOverlap && xOverlap
  })
}

/**
 * Symmetric with the support rule: removing a slab-family run may not strand
 * slab coverage that vertically depends on it (the floor above at ground+,
 * the floor below underground — and floor 0 anchors both directions).
 */
function slabHasDependents(state: EngineState, unit: Unit): boolean {
  const map = getMap(state.mapId)
  const topStorey = unit.floor + unit.storeys - 1
  const outward = outwardNeighbour(map, unit.floor, topStorey)
  const inward = inwardNeighbour(map, unit.floor, topStorey)
  for (let x = unit.x; x < unit.x + unit.width; x++) {
    // The anchor satisfies BOTH sides, which is what makes it anchor both
    // build directions — keep the two checks independent, not exclusive.
    if (isOnBuildSide(map, unit.floor) && slabAt(state, outward, x)) {
      return true
    }
    if (!isOnBuildSide(map, unit.floor) || isAnchorFloor(map, unit.floor)) {
      if (slabAt(state, inward, x)) {
        return true
      }
    }
  }
  return false
}

export function validateDemolish(state: EngineState, cmd: DemolishCommand): PlacementResult {
  if (cmd.type === 'demolishUnit') {
    const unit = state.units.find((u) => u.id === cmd.unitId)
    if (!unit) {
      return err('No such unit')
    }
    if (isSlabFamily(unit.kind) && unitRestsOnSlab(state, unit)) {
      return err('Cannot demolish a floor while a unit rests on it')
    }
    if (isSlabFamily(unit.kind) && slabHasDependents(state, unit)) {
      return err('Cannot demolish a floor that supports another')
    }
    return ok(refundOf(unitBuildCost(state, unit.kind, unit.floor, unit.width)))
  }
  const shaft = state.shafts.find((s) => s.id === cmd.shaftId)
  if (!shaft) {
    return err('No such shaft')
  }
  return ok(refundOf(shaftSpanCost(shaft.kind, shaft.bottomFloor, shaft.topFloor)))
}

export function applyDemolish(state: EngineState, cmd: DemolishCommand): EngineEvent[] {
  let refund = 0
  if (cmd.type === 'demolishUnit') {
    const unit = state.units.find((u) => u.id === cmd.unitId)
    if (unit) {
      refund = refundOf(unitBuildCost(state, unit.kind, unit.floor, unit.width))
      state.units = state.units.filter((u) => u.id !== cmd.unitId)
    }
  } else {
    const shaft = state.shafts.find((s) => s.id === cmd.shaftId)
    if (shaft) {
      refund = refundOf(shaftSpanCost(shaft.kind, shaft.bottomFloor, shaft.topFloor))
      state.shafts = state.shafts.filter((s) => s.id !== cmd.shaftId)
      state.structureVersion += 1
      rebuildGrid(state)
      // With the shaft gone (and routes recomputed), set riders down and
      // re-plan every journey that referenced it.
      releaseShaftOccupants(state, shaft)
      return [{ type: 'demolished', refund }]
    }
  }
  state.structureVersion += 1
  rebuildGrid(state)
  return [{ type: 'demolished', refund }]
}
