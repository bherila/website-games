/**
 * Shared test fixtures — NOT a test file (no `*.test.ts` suffix, so the jest
 * node project ignores it). `makeTestState` builds a minimal valid EngineState;
 * `place` / `placeSlabRow` / `placeShaft` run validate+apply and throw on
 * rejection so scaffolding a scenario fails loudly.
 */

import type { EngineCommand, EngineState, ItemKind, ShaftKind, StarLevel, Unit } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { createGridLayers, rebuildGrid } from '../grid'
import { CITY_TOWER } from '../maps'
import { applyPlacement, validatePlacement } from '../placement'
import { createRng } from '../rng'

export function makeTestState(overrides: Partial<EngineState> = {}): EngineState {
  const seed = overrides.seed ?? 1
  return {
    mapId: CITY_TOWER.id,
    seed,
    rng: createRng(seed),
    clock: { day: 1, minute: 0 },
    speed: 1,
    fastMode: false,
    options: { disastersEnabled: true },
    funds: TUNING.economy.startingFunds,
    loans: [],
    lobbyHeight: 1,
    star: 1,
    maxStarReached: 1,
    towerAchieved: false,
    units: [],
    shafts: [],
    people: [],
    vips: [],
    activeBombThreat: null,
    activeFire: null,
    activeRequest: null,
    ledgerToday: { day: 1, lines: {} },
    ledgerHistory: [],
    milestonesEarned: ['started'],
    pendingLoanPrompt: null,
    pendingLoanCommands: [],
    structureVersion: 0,
    nextId: 1,
    grid: createGridLayers(),
    ...overrides,
  }
}

export function place(state: EngineState, kind: ItemKind, floor: number, x: number, widthTiles?: number): number {
  const cmd: Extract<EngineCommand, { type: 'place' }> =
    widthTiles === undefined
      ? { type: 'place', kind, floor, x }
      : { type: 'place', kind, floor, x, widthTiles }
  const result = validatePlacement(state, cmd)
  if (!result.ok) {
    throw new Error(`place(${kind}, floor=${floor}, x=${x}) rejected: ${result.reason}`)
  }
  const id = state.nextId
  applyPlacement(state, cmd)
  return id
}

export function placeSlabRow(state: EngineState, floor: number, x0: number, x1: number): number {
  return place(state, 'slab', floor, x0, x1 - x0 + 1)
}

export function placeShaft(state: EngineState, kind: ShaftKind, x: number, bottomFloor: number, topFloor: number): number {
  const cmd = { type: 'placeShaft', kind, x, bottomFloor, topFloor } as const
  const result = validatePlacement(state, cmd)
  if (!result.ok) {
    throw new Error(`placeShaft(${kind}, x=${x}, ${bottomFloor}..${topFloor}) rejected: ${result.reason}`)
  }
  const id = state.nextId
  applyPlacement(state, cmd)
  return id
}

export function setStars(state: EngineState, star: StarLevel, maxStarReached: StarLevel = star): void {
  state.star = star
  state.maxStarReached = maxStarReached
}

/** Push a unit entity directly (bypassing validation) to stage states unreachable via placement. */
export function injectUnit(
  state: EngineState,
  partial: Pick<Unit, 'kind' | 'floor' | 'x' | 'width' | 'storeys'> & Partial<Unit>,
): Unit {
  const unit: Unit = {
    id: state.nextId,
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
    ...partial,
  }
  state.units.push(unit)
  state.nextId += 1
  rebuildGrid(state)
  return unit
}
