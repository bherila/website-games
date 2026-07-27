import type { EngineCommand, EngineState } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { createEngineState, stepEngine } from '../engine'
import { populationOf } from '../stars'
import { applyStarUp } from '../stars'

/**
 * 30-game-day soak at 4★ scale: a ~45-floor
 * mixed tower with hotel block, underground parking + subway + trash, 2
 * standard + 2 express + 1 service shafts, skylobbies, and security. Asserts
 * the solvency band, person-leak bounds, a generous step-time budget, and
 * same-seed determinism at scale.
 */

const CHUNK_REAL_SEC = 5 // at speed 4 → 40 game-minutes per chunk

function buildCommands(): EngineCommand[] {
  const commands: EngineCommand[] = []
  type PlaceKind = Extract<EngineCommand, { type: 'place' }>['kind']
  function place(kind: PlaceKind, floor: number, x: number, widthTiles?: number): void {
    commands.push(widthTiles === undefined ? { type: 'place', kind, floor, x } : { type: 'place', kind, floor, x, widthTiles })
  }

  place('lobby', 0, 100, 60)
  for (let f = 1; f <= 44; f++) {
    if (f === 15 || f === 30) {
      place('skylobby', f, 100, 20)
      place('slab', f, 120, 40)
    } else {
      place('slab', f, 100, 60)
    }
  }
  for (let f = -1; f >= -10; f--) {
    place('slab', f, 110, 32) // basement; the deep shaft rides its right edge
  }
  commands.push({ type: 'placeShaft', kind: 'standard', x: 140, bottomFloor: -10, topFloor: 15 })
  commands.push({ type: 'placeShaft', kind: 'standard', x: 124, bottomFloor: 15, topFloor: 44 })
  commands.push({ type: 'placeShaft', kind: 'express', x: 128, bottomFloor: 0, topFloor: 15 })
  commands.push({ type: 'placeShaft', kind: 'express', x: 132, bottomFloor: 15, topFloor: 40 })
  commands.push({ type: 'placeShaft', kind: 'service', x: 136, bottomFloor: -1, topFloor: 32 })

  for (const f of [1, 2, 3, 4, 5, 6]) {
    place('officeS', f, 100)
    place('officeS', f, 106)
    place('restroom', f, 112)
  }
  place('fastfood', 9, 100)
  place('securityOffice', 9, 148)
  for (const f of [16, 17, 18, 19]) {
    place('aptStudio', f, 100)
    place('aptStudio', f, 104)
    place('aptStudio', f, 108)
  }
  place('hotelReception', 31, 114) // abuts the upper standard shaft (stop adjacency)
  place('hotel1p', 31, 100)
  place('hotel1p', 31, 104)
  place('housekeeping', 32, 100)
  place('trashRoom', 32, 110)
  place('parkingRamp', -1, 110)
  place('parkingRamp', -2, 110)
  for (let i = 0; i < 4; i++) {
    place('parkingSpace', -2, 120 + i * 4)
  }
  place('subway', -10, 110)
  return commands
}

interface RunResult {
  state: EngineState
  settlements: Array<{ day: number; net: number }>
  fundsFloor: number
  peakPeople: number
  nightBaselines: number[]
  meanStepMs: number
  loanPrompted: boolean
}

function run30Days(seed: number): RunResult {
  const state = createEngineState({ seed, mapId: 'city-tower', lobbyHeight: 1 })
  applyStarUp(state, [])
  applyStarUp(state, [])
  applyStarUp(state, []) // 4★ — everything in the build is unlocked, +$900k bonuses
  const buildEvents = stepEngine(state, [{ type: 'setSpeed', speed: 4 }, ...buildCommands()], 0)
  // Staff the workhorse shafts like a real player would (3 cars each).
  for (const shaft of state.shafts.filter((sh) => sh.kind === 'standard')) {
    stepEngine(state, [{ type: 'addCar', shaftId: shaft.id }, { type: 'addCar', shaftId: shaft.id }], 0)
  }
  const failures = buildEvents.filter((e) => e.type === 'placementRejected' || e.type === 'loanPrompt')
  if (failures.length > 0) {
    throw new Error(`build failed: ${JSON.stringify(failures[0])} (funds ${state.funds})`)
  }

  const settlements: Array<{ day: number; net: number }> = []
  let fundsFloor = state.funds
  let peakPeople = 0
  const nightBaselines: number[] = []
  let stepMsTotal = 0
  let chunks = 0
  let loanPrompted = false
  let lastMinute = state.clock.minute

  const endDay = state.clock.day + 30
  while (state.clock.day < endDay) {
    const before = performance.now()
    const events = stepEngine(state, [], CHUNK_REAL_SEC)
    stepMsTotal += performance.now() - before
    chunks += 1

    for (const event of events) {
      if (event.type === 'settlement') {
        settlements.push({ day: event.day, net: event.net })
      }
      if (event.type === 'loanPrompt') {
        loanPrompted = true
      }
    }
    fundsFloor = Math.min(fundsFloor, state.funds)
    peakPeople = Math.max(peakPeople, state.people.length)
    // Sample the overnight baseline when a chunk crosses 03:00.
    if (lastMinute < 3 * 60 && state.clock.minute >= 3 * 60) {
      nightBaselines.push(state.people.length)
    }
    lastMinute = state.clock.minute
  }

  return { state, settlements, fundsFloor, peakPeople, nightBaselines, meanStepMs: stepMsTotal / chunks, loanPrompted }
}

describe('30-day soak at 4★ scale', () => {
  it(
    'stays solvent, leaks no people, meets the step budget, and is deterministic',
    () => {
      const first = run30Days(1234)

      // (a) Solvency band: no loan prompt (nothing spends post-build), funds
      // never clamp to zero after day 5, days 10–30 cumulatively profitable.
      expect(first.loanPrompted).toBe(false)
      const lateSettlements = first.settlements.filter((s) => s.day > 5)
      expect(first.state.funds).toBeGreaterThan(0)
      expect(first.fundsFloor).toBeGreaterThan(0)
      const netDays10to30 = first.settlements.filter((s) => s.day >= 10).reduce((sum, s) => sum + s.net, 0)
      expect(netDays10to30).toBeGreaterThan(0)
      expect(lateSettlements.length).toBeGreaterThanOrEqual(24)

      // (b) No person leaks: quiet nights, hard LOD ceiling.
      expect(first.nightBaselines.length).toBeGreaterThanOrEqual(25)
      for (const baseline of first.nightBaselines) {
        expect(baseline).toBeLessThan(50)
      }
      expect(first.peakPeople).toBeLessThanOrEqual(TUNING.people.maxActive)
      expect(first.peakPeople).toBeGreaterThan(20) // the tower actually lives

      // (c) Step budget: generous CI-hardware bound; each chunk simulates 40
      // game-minutes, so 50 ms/chunk ≈ 1.25 ms per game-minute at this scale.
      expect(first.meanStepMs).toBeLessThan(50)

      // (d) Determinism at scale.
      const second = run30Days(1234)
      expect(second.state.funds).toBe(first.state.funds)
      expect(second.state.star).toBe(first.state.star)
      expect(populationOf(second.state)).toBe(populationOf(first.state))

      // Handy numbers for the balance report (visible with --verbose).
      const nets = first.settlements.map((s) => s.net)
      console.log(
        `soak: funds ${Math.round(first.state.funds)}, pop ${populationOf(first.state)}, ` +
          `peak people ${first.peakPeople}, mean step ${first.meanStepMs.toFixed(1)}ms, ` +
          `net day2 ${nets[1]}, day15 ${nets[14]}, day30 ${nets[nets.length - 1]}`,
      )
    },
    600_000,
  )
})
