import { computeDroneInput } from '../engine/droneAi'
import { stepEngine } from '../engine/engine'
import { DT } from '../gameTypes'
import type { InputState } from '../input/inputState'
import { corridorMap, makeFlag, makeState, openMap } from './fixtures'

const IDLE: InputState = { thrust: 0, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false }

function simulateUntil(state: ReturnType<typeof makeState>, predicate: () => boolean, maxSeconds: number): number {
  const steps = Math.round(maxSeconds / DT)
  for (let i = 0; i < steps; i++) {
    stepEngine(state, IDLE, DT)
    if (predicate()) {
      return i * DT
    }
  }
  return -1
}

describe('hover drone AI', () => {
  test('drives to and collects a red flag on an open map', () => {
    const state = makeState(openMap, {
      flags: [makeFlag(openMap, 0, 'blue', { col: 1, row: 5 }), makeFlag(openMap, 1, 'red', { col: 2, row: 4 })],
    })

    const elapsed = simulateUntil(state, () => state.flags.every((flag) => flag.team !== 'red' || flag.collected), 20)
    expect(elapsed).toBeGreaterThanOrEqual(0)
  })

  test('navigates around a high wall via A*', () => {
    const state = makeState(corridorMap, {
      flags: [makeFlag(corridorMap, 0, 'blue', { col: 7, row: 3 }), makeFlag(corridorMap, 1, 'red', { col: 1, row: 3 })],
    })

    const elapsed = simulateUntil(state, () => state.flags.every((flag) => flag.team !== 'red' || flag.collected), 30)
    expect(elapsed).toBeGreaterThanOrEqual(0)
    expect(state.outcome).toBe('lost')
  })

  test('collects red flags one after another (retargets)', () => {
    const state = makeState(openMap, {
      flags: [
        makeFlag(openMap, 0, 'blue', { col: 1, row: 5 }),
        makeFlag(openMap, 1, 'red', { col: 5, row: 2 }),
        makeFlag(openMap, 2, 'red', { col: 2, row: 4 }),
      ],
    })

    const elapsed = simulateUntil(state, () => state.outcome === 'lost', 40)
    expect(elapsed).toBeGreaterThanOrEqual(0)
  })

  test('idles with neutral input when no red flags remain', () => {
    const state = makeState(openMap, {
      flags: [makeFlag(openMap, 0, 'blue', { col: 1, row: 5 })],
    })

    const input = computeDroneInput(state, DT)
    expect(input).toEqual({ thrust: 0, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false })
  })

  test('backs out after stalling against an obstacle', () => {
    const state = makeState(openMap, {
      flags: [makeFlag(openMap, 0, 'blue', { col: 1, row: 5 }), makeFlag(openMap, 1, 'red', { col: 2, row: 4 })],
    })
    // Pretend the drone already has a path but is wedged (zero speed).
    computeDroneInput(state, DT)
    expect(state.droneBrain.path.length).toBeGreaterThan(0)

    let sawReverse = false
    for (let i = 0; i < 30; i++) {
      state.drone.vel = { x: 0, z: 0 }
      const input = computeDroneInput(state, 0.1)
      if (input.thrust < 0) {
        sawReverse = true
        break
      }
    }
    expect(sawReverse).toBe(true)
  })
})
