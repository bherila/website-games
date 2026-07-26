import type { EngineCommand, EngineState } from '../../gameTypes'
import { createEngineState, stepEngine } from '../engine'
import { applyStarUp } from '../stars'

/**
 * GL-4 — same-seed identity. A midgame tower (2 shafts, offices, food,
 * apartments across ~8 floors) stepped 10 game-hours from a fixed seed must
 * produce a byte-identical JSON event log; a different seed must not.
 */

function buildCommands(): EngineCommand[] {
  const commands: EngineCommand[] = [{ type: 'place', kind: 'lobby', floor: 0, x: 0, widthTiles: 60 }]
  for (let f = 1; f <= 8; f++) {
    commands.push({ type: 'place', kind: 'slab', floor: f, x: 0, widthTiles: 60 })
  }
  commands.push({ type: 'placeShaft', kind: 'standard', x: 24, bottomFloor: 0, topFloor: 8 })
  commands.push({ type: 'placeShaft', kind: 'standard', x: 40, bottomFloor: 0, topFloor: 8 })
  for (const floor of [1, 2, 3]) {
    commands.push({ type: 'place', kind: 'officeS', floor, x: 0 })
    commands.push({ type: 'place', kind: 'officeS', floor, x: 8 })
    commands.push({ type: 'place', kind: 'restroom', floor, x: 16 })
  }
  commands.push({ type: 'place', kind: 'fastfood', floor: 1, x: 44 })
  commands.push({ type: 'place', kind: 'shop', floor: 0, x: 44 })
  for (const floor of [4, 5]) {
    commands.push({ type: 'place', kind: 'aptStudio', floor, x: 0 })
    commands.push({ type: 'place', kind: 'aptStudio', floor, x: 6 })
  }
  return commands
}

function runScenario(seed: number): { log: string; state: EngineState } {
  const state = createEngineState({ seed, mapId: 'city-tower', lobbyHeight: 1 })
  const log: unknown[] = []
  log.push(...stepEngine(state, [{ type: 'setSpeed', speed: 4 }], 0))
  log.push(...stepEngine(state, buildCommands(), 0))
  // 10 game-hours at 4× (2 game-min per real second) = 75 real seconds.
  const dtSec = 1 / 30
  const steps = Math.ceil(75 / dtSec)
  for (let i = 0; i < steps; i++) {
    log.push(...stepEngine(state, [], dtSec))
  }
  return { log: JSON.stringify(log), state }
}

describe('GL-4 — same-seed identity', () => {
  it('seed 12345 twice → byte-identical logs; different seed → different log', () => {
    const first = runScenario(12345)
    const second = runScenario(12345)
    expect(second.log).toBe(first.log)

    // Sanity: the run actually simulated something.
    expect(first.log).toContain('unitLeased')
    expect(first.log).toContain('elevatorDing')
    expect(first.state.clock.day).toBe(1)
    expect(first.state.clock.minute).toBeGreaterThan(17 * 60 - 1)

    // …and rng genuinely flows into the log.
    const other = runScenario(54321)
    expect(other.log).not.toBe(first.log)
  })
})

/**
 * Phase 8 extension — a tower exercising the hotel loop, parking garage, and
 * subway runs 2 game-days byte-identically from the same seed.
 */

function buildPhase8Commands(): EngineCommand[] {
  const commands: EngineCommand[] = [{ type: 'place', kind: 'lobby', floor: 0, x: 100, widthTiles: 60 }]
  for (let f = 1; f <= 4; f++) {
    commands.push({ type: 'place', kind: 'slab', floor: f, x: 100, widthTiles: 60 })
  }
  for (let f = -1; f >= -10; f--) {
    commands.push({ type: 'place', kind: 'slab', floor: f, x: 110, widthTiles: 40 })
  }
  commands.push({ type: 'placeShaft', kind: 'standard', x: 142, bottomFloor: -10, topFloor: 3 })
  commands.push({ type: 'placeShaft', kind: 'service', x: 146, bottomFloor: -2, topFloor: 3 })
  commands.push({ type: 'place', kind: 'officeS', floor: 1, x: 100 })
  commands.push({ type: 'place', kind: 'officeS', floor: 1, x: 106 })
  commands.push({ type: 'place', kind: 'restroom', floor: 1, x: 114 })
  commands.push({ type: 'place', kind: 'fastfood', floor: 1, x: 120 })
  commands.push({ type: 'place', kind: 'hotelReception', floor: 2, x: 131 })
  for (let i = 0; i < 4; i++) {
    commands.push({ type: 'place', kind: 'hotel1p', floor: 2, x: 100 + i * 4 })
  }
  commands.push({ type: 'place', kind: 'housekeeping', floor: 3, x: 100 })
  commands.push({ type: 'place', kind: 'trashRoom', floor: 3, x: 110 })
  commands.push({ type: 'place', kind: 'parkingRamp', floor: -1, x: 110 })
  commands.push({ type: 'place', kind: 'parkingRamp', floor: -2, x: 110 })
  commands.push({ type: 'place', kind: 'parkingSpace', floor: -2, x: 120 })
  commands.push({ type: 'place', kind: 'parkingSpace', floor: -2, x: 124 })
  commands.push({ type: 'place', kind: 'subway', floor: -10, x: 110 })
  // Phase 9: an evening of diners and showtime crowds joins the determinism run.
  commands.push({ type: 'place', kind: 'restaurant', floor: 1, x: 132 })
  commands.push({ type: 'place', kind: 'movieTheater', floor: 3, x: 116 })
  return commands
}

function runPhase8Scenario(seed: number): string {
  const state = createEngineState({ seed, mapId: 'city-tower', lobbyHeight: 1 })
  applyStarUp(state, [])
  applyStarUp(state, []) // 3★ — hotel/underground/subway unlocked
  const log: unknown[] = []
  log.push(...stepEngine(state, [{ type: 'setSpeed', speed: 4 }], 0))
  log.push(...stepEngine(state, buildPhase8Commands(), 0))
  // 2 game-days at 4× (2 game-min per real second) = 360 real seconds.
  const dtSec = 1 / 15
  const steps = Math.ceil(360 / dtSec)
  for (let i = 0; i < steps; i++) {
    log.push(...stepEngine(state, [], dtSec))
  }
  return JSON.stringify(log)
}

describe('Phase 8 — hotel/parking/subway determinism', () => {
  it('2 game-days run byte-identically from the same seed', () => {
    const first = runPhase8Scenario(777)
    expect(first).not.toContain('placementRejected') // every 3★ placement validated
    expect(first).not.toContain('loanPrompt')
    expect(first).toContain('hotelReception') // the hotel actually got built
    expect(runPhase8Scenario(777)).toBe(first)
    expect(runPhase8Scenario(778)).not.toBe(first)
  })
})

/**
 * Review fix #13 — fast-forward speeds. Tick granularity differs by speed
 * (a person tick covers 1 game-min at 4× vs 4 at 16×), so end states may
 * legitimately diverge a little; we assert 16× stays deterministic, solvent,
 * and lands in the same ballpark as 4× rather than tick-identical.
 */
describe('16× fast-forward', () => {
  function runTwoDays(speed: 4 | 16, seed: number): { funds: number; star: number; people: number } {
    const state = createEngineState({ seed, mapId: 'city-tower', lobbyHeight: 1 })
    stepEngine(state, [{ type: 'setSpeed', speed }], 0)
    stepEngine(
      state,
      [
        { type: 'place', kind: 'lobby', floor: 0, x: 100, widthTiles: 40 },
        { type: 'place', kind: 'slab', floor: 1, x: 100, widthTiles: 40 },
        { type: 'placeShaft', kind: 'standard', x: 130, bottomFloor: 0, topFloor: 1 },
        { type: 'place', kind: 'officeS', floor: 1, x: 100 },
        { type: 'place', kind: 'restroom', floor: 1, x: 110 },
        { type: 'place', kind: 'fastfood', floor: 1, x: 116 },
      ],
      0,
    )
    const endDay = state.clock.day + 2
    let guard = 0
    while (state.clock.day < endDay) {
      stepEngine(state, [], 1)
      if (++guard > 50_000) {
        throw new Error('runTwoDays never finished')
      }
    }
    return { funds: state.funds, star: state.star, people: state.people.length }
  }

  it('is deterministic at 16× and lands near the 4× outcome', () => {
    const fast = runTwoDays(16, 99)
    expect(runTwoDays(16, 99)).toEqual(fast) // same-seed identity at 16×

    const slow = runTwoDays(4, 99)
    expect(fast.star).toBe(slow.star)
    expect(fast.funds).toBeGreaterThan(0)
    // Tick-granularity drift stays small (documented bound: within 5%).
    expect(Math.abs(fast.funds - slow.funds) / slow.funds).toBeLessThan(0.05)
    expect(fast.people).toBeLessThan(50) // no starvation pile-up at coarse ticks
  })
})
