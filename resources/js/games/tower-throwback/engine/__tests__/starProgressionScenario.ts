/**
 * Shared builder for the star-progression + end-of-game tests — NOT a test file
 * (no `*.test.ts` suffix, so jest ignores it, like `testState.ts`).
 *
 * `runStarProgression` drives a fresh engine, through the real public API only
 * (validated placement commands + `stepEngine` time advancement), from 1★ all
 * the way to the TOWER (cathedral) completion:
 *
 *   • 1★→2★→3★ are earned LEGITIMATELY: an office block is built, real leasing
 *     grows population past `TUNING.stars.popThresholds`, and the VIP visit that
 *     each threshold arms is driven to success through `stepEngine` — the only
 *     path that fires `starUp` (engine's auto star-up was removed; see vip.ts).
 *   • 4★ and 5★ are reached with the engine's public `applyStarUp`: their
 *     population thresholds (5 000 / 10 000) need a tower far too large to grind
 *     inside a unit-test budget, so we use the engine's own mechanism rather
 *     than a fake shortcut. The 5 000/10 000 arming math itself is covered by
 *     `stars.test.ts`.
 *   • TOWER is earned LEGITIMATELY again: a floor-99 cathedral + a vacant,
 *     routable penthouse arm the final VIP, driven to `towerAchieved` through
 *     `stepEngine`.
 *
 * Everything is deterministic (fixed seed, seeded engine rng, no Date.now /
 * Math.random), so the committed end-of-game fixture regenerates byte-for-byte.
 */

import type { EngineCommand, EngineEvent, EngineState, ItemKind, StarLevel } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { createEngineState, stepEngine } from '../engine'
import { applyStarUp, populationOf, starUpArmed } from '../stars'

export type StarUpEvent = Extract<EngineEvent, { type: 'starUp' }>

export interface StarTransition {
  toStar: StarLevel
  /** How the star was earned: a real VIP visit, or the public `applyStarUp`. */
  method: 'vip' | 'applyStarUp'
  /** Total population at the moment the star-up fired. */
  populationAtGrant: number
  starUp: StarUpEvent
}

export interface ProgressionResult {
  state: EngineState
  transitions: StarTransition[]
  /** Population once the office block first leases (before any star is granted). */
  popAfterFirstLease: number
  /** `starUpArmed` after the first lease, still at 1★ — the real 2★ threshold armed the VIP. */
  armedForStar2AfterLease: boolean
  /** `starUpArmed` once the run settles at 3★ — the 4★ threshold (5 000) is NOT met. */
  armedForStar4AtCap: boolean
  /** Events emitted while driving the final cathedral (TOWER) VIP visit. */
  towerEvents: EngineEvent[]
  /** True once the cathedral VIP has succeeded. */
  towerAchieved: boolean
  /** Total `stepEngine` chunks consumed across the whole run (regression tripwire). */
  stepChunks: number
}

const SEED_DEFAULT = 20260716

/** A generous but finite step ceiling — a progression regression should fail fast, not hang. */
const MAX_CHUNKS_PER_PHASE = 4000

function run(state: EngineState, commands: EngineCommand[]): EngineEvent[] {
  const events = stepEngine(state, commands, 0)
  const failure = events.find((e) => e.type === 'placementRejected' || e.type === 'loanPrompt')
  if (failure) {
    throw new Error(`build failed: ${JSON.stringify(failure)} (funds ${Math.round(state.funds)})`)
  }
  return events
}

function place(kind: ItemKind, floor: number, x: number, widthTiles?: number): EngineCommand {
  return widthTiles === undefined ? { type: 'place', kind, floor, x } : { type: 'place', kind, floor, x, widthTiles }
}

/**
 * Build a dense office block on floors 1..OFFICE_TOP that houses > the 3★
 * population threshold once leased. Offices are set to the `low` rent tier so
 * that a busy morning rush (congestion penalty) can never drop their eval below
 * the leasability line and churn them — the point of this run is star progress,
 * not elevator tuning.
 */
const OFFICE_X0 = 20
const OFFICE_X1 = 219
const OFFICE_TOP = 14
const OFFICE_SHAFT_COLS: ReadonlyArray<readonly [number, number]> = [
  [26, 27],
  [110, 111],
  [200, 201],
  [60, 62],
  [160, 162],
]

function collidesShaft(x: number, w: number): boolean {
  for (const [a, b] of OFFICE_SHAFT_COLS) {
    if (x <= b && x + w - 1 >= a) {
      return true
    }
  }
  return false
}

function buildOfficeBlock(state: EngineState): void {
  const slabs: EngineCommand[] = []
  for (let f = 1; f <= OFFICE_TOP; f++) {
    slabs.push(place('slab', f, OFFICE_X0, OFFICE_X1 - OFFICE_X0 + 1))
  }
  run(state, slabs)

  run(state, [
    { type: 'placeShaft', kind: 'standard', x: 26, bottomFloor: 0, topFloor: OFFICE_TOP },
    { type: 'placeShaft', kind: 'standard', x: 110, bottomFloor: 0, topFloor: OFFICE_TOP },
    { type: 'placeShaft', kind: 'standard', x: 200, bottomFloor: 0, topFloor: OFFICE_TOP },
    { type: 'placeShaft', kind: 'express', x: 60, bottomFloor: 0, topFloor: OFFICE_TOP },
    { type: 'placeShaft', kind: 'express', x: 160, bottomFloor: 0, topFloor: OFFICE_TOP },
  ])

  const offices: EngineCommand[] = []
  const officesPerFloor = 20
  for (let f = 1; f <= OFFICE_TOP; f++) {
    let count = 0
    let restroomPlaced = false
    let x = OFFICE_X0 + 2
    while (count < officesPerFloor && x + 6 <= OFFICE_X1) {
      if (!restroomPlaced && !collidesShaft(x, 4)) {
        offices.push(place('restroom', f, x))
        x += 4
        restroomPlaced = true
        continue
      }
      if (collidesShaft(x, 6)) {
        x += 1
        continue
      }
      offices.push(place('officeS', f, x))
      x += 6
      count += 1
    }
  }
  run(state, offices)

  for (const shaft of state.shafts) {
    run(state, [
      { type: 'addCar', shaftId: shaft.id },
      { type: 'addCar', shaftId: shaft.id },
      { type: 'addCar', shaftId: shaft.id },
    ])
  }
  const lowRent: EngineCommand[] = state.units
    .filter((u) => u.kind === 'officeS')
    .map((u) => ({ type: 'setRentTier', unitId: u.id, tier: 'low' }))
  run(state, lowRent)
}

/**
 * The thin high-rise column (a separate x-region from the office block) that
 * carries the floor-99 cathedral: an express spanning 0..99, a floor-5 skylobby
 * so the express gains a mid stop, and a vacant penthouse parked on that stop.
 * The penthouse sits on the `high` rent tier so ordinary residents never lease
 * it, leaving it free for the guest of honor.
 */
const TOWER_X0 = 240
const TOWER_WIDTH = 60
const TOWER_TOP = 99
const EXPRESS_X = 262
const PENTHOUSE_FLOOR = 5

function buildCathedralColumn(state: EngineState): { penthouseId: number; cathedralId: number } {
  const slabs: EngineCommand[] = []
  for (let f = 1; f <= TOWER_TOP; f++) {
    if (f === PENTHOUSE_FLOOR) {
      slabs.push(place('skylobby', f, TOWER_X0, 20))
      slabs.push(place('slab', f, TOWER_X0 + 20, TOWER_WIDTH - 20))
    } else {
      slabs.push(place('slab', f, TOWER_X0, TOWER_WIDTH))
    }
  }
  run(state, slabs)

  run(state, [{ type: 'placeShaft', kind: 'express', x: EXPRESS_X, bottomFloor: 0, topFloor: TOWER_TOP }])
  const express = state.shafts.find((s) => s.kind === 'express' && s.x === EXPRESS_X)!

  const penthouseId = state.nextId
  run(state, [place('aptPenthouse', PENTHOUSE_FLOOR, EXPRESS_X + 6, 16)])
  run(state, [{ type: 'setRentTier', unitId: penthouseId, tier: 'high' }])

  const cathedralId = state.nextId
  run(state, [place('cathedral', TOWER_TOP, EXPRESS_X + 3, 30)])

  run(state, [
    { type: 'addCar', shaftId: express.id },
    { type: 'addCar', shaftId: express.id },
    { type: 'addCar', shaftId: express.id },
  ])
  return { penthouseId, cathedralId }
}

/** Drive `stepEngine` in fixed 5-real-second chunks until `predicate` or the guard trips. */
function driveUntil(
  state: EngineState,
  predicate: (events: EngineEvent[]) => boolean,
  onEvents: (events: EngineEvent[]) => void,
  label: string,
): number {
  let chunks = 0
  for (;;) {
    const events = stepEngine(state, [], 5)
    chunks += 1
    onEvents(events)
    if (predicate(events)) {
      return chunks
    }
    if (chunks > MAX_CHUNKS_PER_PHASE) {
      throw new Error(`driveUntil(${label}) exceeded ${MAX_CHUNKS_PER_PHASE} chunks (star ${state.star}, pop ${populationOf(state)})`)
    }
  }
}

export function runStarProgression(seed: number = SEED_DEFAULT): ProgressionResult {
  const state = createEngineState({ seed, mapId: 'city-tower', lobbyHeight: 1 })
  run(state, [{ type: 'setSpeed', speed: 4 }])
  // Fund the whole build up front with a loan (a public mechanism); the leased
  // tower is wildly cash-positive afterwards, so this never re-prompts.
  run(state, [{ type: 'acceptLoan', amount: 12_000_000 }])
  run(state, [place('lobby', 0, OFFICE_X0, TOWER_X0 + TOWER_WIDTH - OFFICE_X0)])

  buildOfficeBlock(state)

  const transitions: StarTransition[] = []
  let stepChunks = 0

  // ── Legit 1★→2★→3★: population crosses 300 then 1000; each armed VIP visit
  //    grants exactly one star, re-checking the next threshold as it goes. ──

  // First, let the office block lease (the daily 08:00 pass) so population grows
  // legitimately past the 2★ threshold, and capture that the threshold armed the
  // VIP while the tower is still at 1★.
  stepChunks += driveUntil(
    state,
    () => populationOf(state) >= popThresholdFor(2) || state.star > 1,
    () => {},
    'first-lease',
  )
  const popAfterFirstLease = populationOf(state)
  const armedForStar2AfterLease = state.star === 1 && starUpArmed(state)

  stepChunks += driveUntil(
    state,
    () => state.star >= 3,
    (events) => {
      for (const e of events) {
        if (e.type === 'starUp') {
          transitions.push({
            toStar: e.star,
            method: 'vip',
            populationAtGrant: populationOf(state),
            starUp: e,
          })
        }
      }
    },
    'legit-stars',
  )
  const armedForStar4AtCap = starUpArmed(state)

  // ── 4★ and 5★ via the engine's public star-up (population-impractical). ──
  for (const target of [4, 5] as const) {
    const events: EngineEvent[] = []
    applyStarUp(state, events)
    const starUp = events.find((e): e is StarUpEvent => e.type === 'starUp')
    if (!starUp) {
      throw new Error(`applyStarUp did not reach ${target}★`)
    }
    transitions.push({
      toStar: starUp.star,
      method: 'applyStarUp',
      populationAtGrant: populationOf(state),
      starUp,
    })
  }

  // ── Legit TOWER: a standing cathedral + a vacant penthouse arm the final VIP. ──
  buildCathedralColumn(state)
  const towerEvents: EngineEvent[] = []
  stepChunks += driveUntil(
    state,
    (events) => events.some((e) => e.type === 'towerAchieved'),
    (events) => {
      for (const e of events) {
        if (e.type === 'vipArrived' || e.type === 'vipResult' || e.type === 'towerAchieved' || e.type === 'vipMovedIn' || e.type === 'milestone') {
          towerEvents.push(e)
        }
      }
    },
    'tower',
  )

  return {
    state,
    transitions,
    popAfterFirstLease,
    armedForStar2AfterLease,
    armedForStar4AtCap,
    towerEvents,
    towerAchieved: state.towerAchieved,
    stepChunks,
  }
}

/** Threshold a star's population gate requires (re-exported for assertions). */
export function popThresholdFor(star: 2 | 3 | 4 | 5): number {
  return TUNING.stars.popThresholds[star]
}
