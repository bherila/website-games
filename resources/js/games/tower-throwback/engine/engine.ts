/**
 * Engine orchestrator: command dispatch + fixed-step time advancement.
 *
 * Owns the seams between placement/economy/occupancy/stars (and, from Phase 4,
 * elevators/people). All funds movement flows through economy.ts so the
 * never-negative invariant holds; placement/demolish stay funds-agnostic.
 */

import currency from 'currency.js'

import type {
  EngineCommand,
  EngineEvent,
  EngineState,
  HudSnapshot,
  PlacementCommand,
  Shaft,
  StarLevel,
  Unit,
  VipGoalStatus,
  VipTarget,
} from '../gameTypes'
import { TUNING } from '../gameTypes'
import { itemDef, shaftDef } from './catalog'
import { advanceClock, isWeekend, phaseOf } from './clock'
import { acceptLoan, accrue, declineLoan, postImmediate, requestSpend, settleMidnight } from './economy'
import { stepElevators } from './elevators'
import { createGridLayers, rebuildGrid } from './grid'
import { pestControl, repairUnit, resolveBombThreat, respondToFire } from './incidents'
import { endgamePlacementFloors, floorLabelFor } from './mapGeometry'
import { getMap } from './maps'
import { occupancyPass, vacateUnroutableUnits } from './occupancy'
import { stepPeople } from './people'
import {
  applyDemolish,
  applyPlacement,
  applyShaftResize,
  validateDemolish,
  validatePlacement,
  validateShaftResize,
} from './placement'
import { createRng } from './rng'
import { stepSchedules } from './schedules'
import { populationOf } from './stars'
import { applyUpgrade, validateUpgrade } from './upgrades'
import { stepVips } from './vip'

/** Real-seconds accumulator for the 8 Hz person tick, per engine instance. */
const personTickAccumulator = new WeakMap<EngineState, number>()

export function personTickAccumulatorOf(state: EngineState): number {
  return personTickAccumulator.get(state) ?? 0
}

export function restorePersonTickAccumulator(state: EngineState, value: number): void {
  personTickAccumulator.set(state, value)
}

export interface CreateEngineOptions {
  seed: number
  mapId: string
  lobbyHeight: 1 | 2 | 3
}

const START_MINUTE = 7 * 60

export function createEngineState(opts: CreateEngineOptions): EngineState {
  getMap(opts.mapId)
  const state: EngineState = {
    mapId: opts.mapId,
    seed: opts.seed,
    rng: createRng(opts.seed),
    clock: { day: 1, minute: START_MINUTE },
    speed: 1,
    fastMode: false,
    options: { disastersEnabled: true },
    funds: TUNING.economy.startingFunds,
    loans: [],
    lobbyHeight: opts.lobbyHeight,
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
  }
  rebuildGrid(state)
  return state
}

/** Fast mode triples the selected speed (8×→24×, 16×→48×), capped at 48×. */
const FAST_MODE_MULTIPLIER = 3
const FAST_MODE_MAX_SPEED = 48
/** Only boosts from 8×/16× — below that the player is watching closely. */
const FAST_MODE_MIN_SPEED = 8
/** Above this many active people, even a mid-day tower is "busy". */
const FAST_MODE_ACTIVITY_LIMIT = 40
/** Non-rush phases where a quiet tower can safely fast-forward. */
const LOW_ACTIVITY_PHASES = new Set<string>(['night', 'day', 'lunch', 'afternoon'])

/**
 * Whether the tower is quiet enough to fast-forward: a non-rush phase, no active
 * incident/request/loan prompt, no VIP visit, nobody queued for an elevator, and
 * a modest population. Pure function of state, so fast mode stays deterministic.
 */
export function isTowerLowActivity(state: EngineState): boolean {
  if (!LOW_ACTIVITY_PHASES.has(phaseOf(state.clock.minute))) {
    return false
  }
  if (state.activeBombThreat !== null || state.activeFire !== null || state.activeRequest !== null || state.pendingLoanPrompt !== null) {
    return false
  }
  if (state.people.length > FAST_MODE_ACTIVITY_LIMIT) {
    return false
  }
  for (const person of state.people) {
    if (person.state === 'queued' || person.vip) {
      return false
    }
  }
  return true
}

/** The speed multiplier actually applied this step, factoring in dynamic fast mode. */
export function effectiveSpeed(state: EngineState): number {
  if (state.fastMode && state.speed >= FAST_MODE_MIN_SPEED && isTowerLowActivity(state)) {
    return Math.min(FAST_MODE_MAX_SPEED, state.speed * FAST_MODE_MULTIPLIER)
  }
  return state.speed
}

export function stepEngine(state: EngineState, commands: EngineCommand[], dtSec: number): EngineEvent[] {
  const events: EngineEvent[] = []
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index]
    if (!command) {
      continue
    }
    if (isPlacementCommand(command)) {
      index = dispatchPlacementBatch(state, commands, index, events)
      continue
    }
    dispatch(state, command, events)
  }
  if (state.speed === 0 || dtSec <= 0) {
    return events
  }

  // One multiplier per step, used at BOTH scaling sites below so the clock/schedule
  // advance and the per-tick elevator/people advance never desync (determinism).
  const speedMultiplier = effectiveSpeed(state)
  const gameMinutes = dtSec * TUNING.time.gameMinutesPerRealSecond * speedMultiplier
  const crossed = advanceClock(state, gameMinutes)
  if (crossed.crossedMidnight) {
    settleMidnight(state, events)
  }
  if (crossed.crossedHour08) {
    occupancyPass(state, events)
    // VIP visits gate star-ups: arming + deferred move-ins run here (08:00);
    // visit progression rides schedules' minute tick (vip.stepVipMinute).
    stepVips(state, events)
  }
  // Schedules fire on minute boundaries; elevators and people INTERLEAVE at
  // the 8 Hz person cadence. Elevator time is sliced per person tick (with any
  // remainder consumed at the end) so a large real-time chunk — a CI soak step
  // or a hitchy frame — can't run a whole chunk of elevator service before the
  // people spawned within it ever reach a queue. At 60 fps the slices collapse
  // to the old behavior.
  stepSchedules(state, state.clock.minute - gameMinutes, state.clock.minute, events)
  const personTick = 1 / TUNING.time.personTickHz
  const minutesPerTick = personTick * TUNING.time.gameMinutesPerRealSecond * speedMultiplier
  let acc = (personTickAccumulator.get(state) ?? 0) + dtSec
  let elevatorMinutesLeft = gameMinutes
  while (acc >= personTick) {
    acc -= personTick
    const slice = Math.min(elevatorMinutesLeft, minutesPerTick)
    elevatorMinutesLeft -= slice
    stepElevators(state, slice, events)
    stepPeople(state, minutesPerTick, events)
  }
  personTickAccumulator.set(state, acc)
  if (elevatorMinutesLeft > 0) {
    stepElevators(state, elevatorMinutesLeft, events)
  }
  return events
}

function dispatch(state: EngineState, cmd: EngineCommand, events: EngineEvent[]): void {
  switch (cmd.type) {
    case 'place':
    case 'placeShaft':
      return
    case 'resizeShaft': {
      const verdict = validateShaftResize(state, cmd)
      const shaft = findShaft(state, cmd.shaftId)
      if (!verdict.ok) {
        events.push({ type: 'placementRejected', kind: shaft?.kind ?? 'standard', reason: verdict.reason })
        return
      }
      const netCost = currency(verdict.cost).subtract(verdict.refund).value
      if (netCost > 0) {
        if (!requestSpend(state, netCost, events)) {
          state.pendingLoanCommands.push(cmd) // replayed by acceptLoan, like a bulk placement
          return
        }
      } else if (netCost < 0) {
        state.funds = currency(state.funds).subtract(netCost).value
        events.push({ type: 'cash', amount: currency(netCost).multiply(-1).value })
      }
      accrue(state, 'construction', -verdict.cost)
      accrue(state, 'demolition.refund', verdict.refund)
      applyShaftResize(state, cmd, verdict)
      if (verdict.removedStops.length > 0) {
        vacateUnroutableUnits(state, events) // severed floors evict immediately
      }
      return
    }
    case 'demolishUnit':
    case 'demolishShaft': {
      const verdict = validateDemolish(state, cmd)
      if (!verdict.ok) {
        const kind =
          cmd.type === 'demolishUnit'
            ? (findUnit(state, cmd.unitId)?.kind ?? 'slab')
            : (findShaft(state, cmd.shaftId)?.kind ?? 'standard')
        events.push({ type: 'placementRejected', kind, reason: verdict.reason })
        return
      }
      const demolishEvents = applyDemolish(state, cmd)
      const refund = demolishEvents.find((e) => e.type === 'demolished')
      if (refund && refund.type === 'demolished' && refund.refund > 0) {
        postImmediate(state, 'demolition.refund', refund.refund)
      }
      events.push(...demolishEvents)
      vacateUnroutableUnits(state, events)
      return
    }
    case 'addCar': {
      const shaft = findShaft(state, cmd.shaftId)
      if (!shaft) {
        return
      }
      const def = shaftDef(shaft.kind)
      if (shaft.cars.length >= def.maxCars) {
        events.push({ type: 'placementRejected', kind: shaft.kind, reason: 'Shaft already has its maximum cars' })
        return
      }
      if (!requestSpend(state, def.carCost, events)) {
        return
      }
      accrue(state, 'construction', -def.carCost)
      shaft.cars.push({
        index: shaft.cars.length,
        y: shaft.bottomFloor,
        dir: 0,
        state: 'idle',
        doorTimer: 0,
        homeFloor: null,
        passengerIds: [],
      })
      events.push({ type: 'placed', kind: shaft.kind, cost: def.carCost, shaftId: shaft.id })
      return
    }
    case 'setRentTier': {
      const unit = findUnit(state, cmd.unitId)
      if (unit) {
        unit.rentTier = cmd.tier
      }
      return
    }
    case 'setShaftProgram': {
      const shaft = findShaft(state, cmd.shaftId)
      if (shaft) {
        shaft.program = {
          ...cmd.program,
          idleAnswerThreshold: clamp(cmd.program.idleAnswerThreshold, 0, TUNING.elevators.idleAnswerMax),
          doorDwellSec: clamp(cmd.program.doorDwellSec, 0, TUNING.elevators.doorDwellMaxSec),
        }
      }
      return
    }
    case 'setStopEnabled': {
      const shaft = findShaft(state, cmd.shaftId)
      if (!shaft) {
        return
      }
      const def = shaftDef(shaft.kind)
      if (!shaft.stops.includes(cmd.floor)) {
        events.push({ type: 'placementRejected', kind: shaft.kind, reason: 'That floor is not a landing for this elevator' })
        return
      }
      const enabled = new Set(shaft.enabledStops)
      if (cmd.enabled) {
        enabled.add(cmd.floor)
      } else {
        enabled.delete(cmd.floor)
      }
      if (enabled.size === 0) {
        events.push({ type: 'placementRejected', kind: shaft.kind, reason: 'An elevator must keep at least one enabled stop' })
        return
      }
      if (def.maxStops !== undefined && enabled.size > def.maxStops) {
        events.push({ type: 'placementRejected', kind: shaft.kind, reason: `${def.name} can have at most ${def.maxStops} enabled stops` })
        return
      }
      shaft.enabledStops = [...enabled].sort((a, b) => a - b)
      state.structureVersion += 1
      if (!cmd.enabled) {
        vacateUnroutableUnits(state, events) // severed floors evict immediately
      }
      return
    }
    case 'setCarHomeFloor': {
      const shaft = findShaft(state, cmd.shaftId)
      const car = shaft?.cars[cmd.carIndex]
      if (shaft && car && (cmd.floor === null || shaft.enabledStops.includes(cmd.floor))) {
        car.homeFloor = cmd.floor
      }
      return
    }
    case 'setSpeed':
      state.speed = cmd.speed
      return
    case 'setFastMode':
      state.fastMode = cmd.enabled
      return
    case 'setDisastersEnabled':
      state.options.disastersEnabled = cmd.enabled
      return
    case 'acceptLoan':
      acceptLoan(state, cmd.amount, events)
      resumePendingLoanCommands(state, events)
      return
    case 'declineLoan':
      declineLoan(state)
      state.pendingLoanCommands = []
      return
    case 'applyUpgrade': {
      const verdict = validateUpgrade(state, cmd.unitId, cmd.upgradeId)
      if (!verdict.ok) {
        const kind = findUnit(state, cmd.unitId)?.kind ?? 'slab'
        events.push({ type: 'placementRejected', kind, reason: verdict.reason })
        return
      }
      if (!requestSpend(state, verdict.cost, events)) {
        return
      }
      accrue(state, 'construction', -verdict.cost)
      applyUpgrade(state, cmd.unitId, cmd.upgradeId, events)
      return
    }
    case 'resolveBombThreat':
      resolveBombThreat(state, cmd.choice, events)
      return
    case 'respondToFire':
      respondToFire(state, cmd.choice, events)
      return
    case 'pestControl':
      pestControl(state, cmd.unitId, events)
      return
    case 'repairUnit':
      repairUnit(state, cmd.unitId, events)
      return
  }
}

function isPlacementCommand(command: EngineCommand): command is PlacementCommand {
  return command.type === 'place' || command.type === 'placeShaft'
}

/** A bulk drag emits contiguous same-kind placement commands in deterministic bottom-to-top order. */
function placementBatchEnd(commands: EngineCommand[], start: number): number {
  const first = commands[start]
  if (!first || !isPlacementCommand(first)) {
    return start
  }
  let end = start + 1
  while (end < commands.length) {
    const candidate = commands[end]
    if (!candidate || !isPlacementCommand(candidate) || candidate.type !== first.type || candidate.kind !== first.kind) {
      break
    }
    end += 1
  }
  return end
}

function dispatchPlacementBatch(state: EngineState, commands: EngineCommand[], start: number, events: EngineEvent[]): number {
  const end = placementBatchEnd(commands, start)
  const batch = commands.slice(start, end).filter(isPlacementCommand)

  for (let index = 0; index < batch.length; index += 1) {
    const command = batch[index]
    if (!command) {
      continue
    }
    const verdict = validatePlacement(state, command)
    if (!verdict.ok) {
      events.push({ type: 'placementRejected', kind: command.kind, reason: verdict.reason })
      continue
    }
    if (state.funds >= verdict.cost) {
      requestSpend(state, verdict.cost, events)
      accrue(state, 'construction', -verdict.cost)
      events.push(...applyPlacement(state, command))
      continue
    }

    const pending = planRemainingPlacements(state, batch.slice(index))
    if (batch.length > 1 && pending.commands.length > 0) {
      state.pendingLoanCommands.push(...pending.commands)
      requestSpend(state, pending.totalCost, events)
    } else {
      requestSpend(state, verdict.cost, events)
      events.push({ type: 'placementRejected', kind: command.kind, reason: 'Insufficient funds' })
    }
    return end - 1
  }

  return end - 1
}

function planRemainingPlacements(state: EngineState, commands: PlacementCommand[]): { commands: PlacementCommand[]; totalCost: number } {
  const planningState = clonePlacementState(state)
  const planned: PlacementCommand[] = []
  let totalCost = 0

  for (const command of commands) {
    const verdict = validatePlacement(planningState, command)
    if (!verdict.ok) {
      continue
    }
    planned.push(command)
    totalCost += verdict.cost
    applyPlacement(planningState, command)
  }

  return { commands: planned, totalCost }
}

function clonePlacementState(state: EngineState): EngineState {
  const clone: EngineState = {
    ...state,
    units: state.units.map((unit) => ({ ...unit, population: { ...unit.population }, flags: { ...unit.flags } })),
    shafts: state.shafts.map((shaft) => ({
      ...shaft,
      stops: [...shaft.stops],
      enabledStops: [...shaft.enabledStops],
      cars: shaft.cars.map((car) => ({ ...car, passengerIds: [...car.passengerIds] })),
      program: {
        weekday: { ...shaft.program.weekday },
        weekend: { ...shaft.program.weekend },
        idleAnswerThreshold: shaft.program.idleAnswerThreshold,
        doorDwellSec: shaft.program.doorDwellSec,
      },
      stats: { ...shaft.stats },
    })),
    pendingLoanCommands: [...state.pendingLoanCommands],
    grid: createGridLayers(),
  }
  // validatePlacement reads the painted grid layers (slabAt/unitIdAt/shaftIdAt);
  // planning against fresh empty layers would reject every support-dependent
  // cell (and miss every overlap) until the first applyPlacement repaints.
  rebuildGrid(clone)
  return clone
}

function resumePendingLoanCommands(state: EngineState, events: EngineEvent[]): void {
  if (state.pendingLoanCommands.length === 0) {
    return
  }
  const commands = state.pendingLoanCommands
  state.pendingLoanCommands = []
  let index = 0
  while (index < commands.length) {
    const command = commands[index]
    if (!command) {
      index += 1
    } else if (isPlacementCommand(command)) {
      index = dispatchPlacementBatch(state, commands, index, events) + 1
    } else {
      dispatch(state, command, events)
      index += 1
    }
  }
}

export function buildHudSnapshot(state: EngineState): HudSnapshot {
  const yesterday = state.ledgerHistory[0]
  const netYesterday = yesterday ? Object.values(yesterday.lines).reduce((sum, v) => sum + (v ?? 0), 0) : 0
  const population = populationOf(state)
  const starProgress = buildStarProgress(state.star, population)
  const appliedSpeed = effectiveSpeed(state)
  const activePeople = state.people.length
  const peopleCap = { active: activePeople, max: TUNING.people.maxActive, atCap: activePeople >= TUNING.people.maxActive }
  const map = getMap(state.mapId)
  const endgameKind = map.endgameItem
  const endgameFloorLabel = endgamePlacementFloors(map).map((floor) => floorLabelFor(map, floor)).join(' or ')
  return {
    mapId: state.mapId,
    funds: state.funds,
    netYesterday,
    population,
    star: state.star,
    maxStarReached: state.maxStarReached,
    starProgress,
    vipGoal: buildVipGoalSnapshot(state, starProgress),
    towerAchieved: state.towerAchieved,
    endgame: {
      kind: endgameKind,
      name: itemDef(endgameKind).name,
      floorLabel: endgameFloorLabel,
      built: state.units.some((unit) => unit.kind === endgameKind),
    },
    day: state.clock.day,
    minute: state.clock.minute,
    phase: phaseOf(state.clock.minute),
    weekend: isWeekend(state.clock.day),
    speed: state.speed,
    fastMode: state.fastMode,
    effectiveSpeed: appliedSpeed,
    fastModeActive: appliedSpeed > state.speed,
    disastersEnabled: state.options.disastersEnabled,
    activePeople,
    peopleCap,
    trafficUnderstated: peopleCap.atCap,
    vipInBuilding: state.people.some((p) => p.vip),
    pendingLoanPrompt: state.pendingLoanPrompt,
    activeIncident: state.activeBombThreat ? 'bombThreat' : state.activeFire ? 'fire' : state.units.some((u) => u.infested) ? 'cockroach' : null,
  }
}

function buildStarProgress(star: StarLevel, population: number): HudSnapshot['starProgress'] {
  if (star >= 5) {
    return null
  }
  const nextStar = (star + 1) as StarLevel
  const threshold = TUNING.stars.popThresholds[nextStar as 2 | 3 | 4 | 5]
  return {
    nextStar,
    threshold,
    remaining: Math.max(0, threshold - population),
    progress: Math.min(1, population / threshold),
  }
}

function buildVipGoalSnapshot(state: EngineState, starProgress: HudSnapshot['starProgress']): HudSnapshot['vipGoal'] {
  if (!starProgress) {
    return null
  }
  const target = starProgress.nextStar as VipTarget
  const record = state.vips.find((vip) => vip.target === target)
  const status: VipGoalStatus = vipGoalStatus(record?.state, record?.cooldownUntilDay ?? null, state.clock.day, starProgress.remaining)
  return {
    target,
    status,
    blockedReason: record?.lastReport.length ? record.lastReport.join('; ') : null,
    cooldownUntilDay: record?.cooldownUntilDay ?? null,
  }
}

function vipGoalStatus(
  state: 'pending' | 'visiting' | 'resident' | 'movedOut' | undefined,
  cooldownUntilDay: number | null,
  day: number,
  remaining: number,
): VipGoalStatus {
  if (cooldownUntilDay !== null && day < cooldownUntilDay) {
    return 'cooldown'
  }
  if (state) {
    return state
  }
  return remaining === 0 ? 'armed' : 'notArmed'
}

function findUnit(state: EngineState, id: number): Unit | undefined {
  return state.units.find((u) => u.id === id)
}

function findShaft(state: EngineState, id: number): Shaft | undefined {
  return state.shafts.find((s) => s.id === id)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
