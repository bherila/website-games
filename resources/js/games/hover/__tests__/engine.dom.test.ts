import { createEngineState, stepEngine } from '../engine/engine'
import { createRng } from '../engine/rng'
import { currentFlagValue, mapBonusForCycle } from '../engine/scoring'
import type { EngineEvent } from '../gameTypes'
import {
  DRONE_MAX_SPEED_SCALE,
  droneSpeedScaleForRound,
  DT,
  FLAG_MIN_VALUE,
  FLAG_START_VALUE,
  POD_RESPAWN_SEC,
  SPEED_BOOST_MULTIPLIER,
} from '../gameTypes'
import type { InputState } from '../input/inputState'
import { makeFlag, makePod, makeState, openMap } from './fixtures'

const IDLE: InputState = { thrust: 0, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false }

function runSeconds(state: ReturnType<typeof makeState>, input: InputState, seconds: number): EngineEvent[] {
  const events: EngineEvent[] = []
  const steps = Math.round(seconds / DT)
  for (let i = 0; i < steps && state.outcome === 'playing'; i++) {
    events.push(...stepEngine(state, input, DT))
  }
  return events
}

describe('hover engine', () => {
  test('createEngineState spawns a playable round', () => {
    const state = createEngineState({ roundIndex: 0, rng: createRng(99) })
    expect(state.map.id).toBe('castle')
    expect(state.cycle).toBe(1)
    expect(state.flags.filter((flag) => flag.team === 'blue').length).toBeGreaterThan(0)
    expect(state.outcome).toBe('playing')
    expect(state.score).toBe(0)
  })

  test('scoring decays over time down to the floor', () => {
    expect(currentFlagValue(0)).toBe(FLAG_START_VALUE)
    expect(currentFlagValue(10)).toBe(FLAG_START_VALUE - 40)
    expect(currentFlagValue(100000)).toBe(FLAG_MIN_VALUE)
  })

  test('player collecting all blue flags wins and banks value + map bonus', () => {
    // One blue flag two cells straight ahead of the player spawn (facing map center).
    const state = makeState(openMap, {
      flags: [makeFlag(openMap, 0, 'blue', { col: 3, row: 3 }), makeFlag(openMap, 1, 'red', { col: 6, row: 5 })],
    })
    const target = 3.5 * openMap.cellSize
    state.player.heading = Math.atan2(-(target - state.player.pos.x), -(target - state.player.pos.z))

    const events = runSeconds(state, { thrust: 1, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false }, 5)

    expect(state.outcome).toBe('won')
    expect(events.some((event) => event.kind === 'flagBlue')).toBe(true)
    expect(events.some((event) => event.kind === 'win')).toBe(true)
    expect(state.score).toBeGreaterThanOrEqual(FLAG_MIN_VALUE + mapBonusForCycle(1))
    expect(state.mapScore).toBe(state.score)
  })

  test('drone collecting all red flags loses the round', () => {
    const state = makeState(openMap, {
      flags: [makeFlag(openMap, 0, 'blue', { col: 1, row: 5 }), makeFlag(openMap, 1, 'red', { col: 5, row: 2 })],
    })

    const events = runSeconds(state, IDLE, 30)

    expect(state.outcome).toBe('lost')
    expect(events.some((event) => event.kind === 'flagRed')).toBe(true)
    expect(events.some((event) => event.kind === 'lose')).toBe(true)
    expect(state.score).toBe(0)
  })

  test('pods grant effects and respawn after the cooldown', () => {
    const state = makeState(openMap, {
      flags: [makeFlag(openMap, 0, 'blue', { col: 1, row: 5 }), makeFlag(openMap, 1, 'red', { col: 6, row: 5 })],
      pods: [makePod(openMap, 0, 'speedUp', openMap.playerSpawn)],
    })

    const events = runSeconds(state, IDLE, 0.5)
    expect(events.some((event) => event.kind === 'pod' && event.podKind === 'speedUp' && event.actor === 'player')).toBe(true)
    expect(state.player.speedEffect?.kind).toBe('boost')
    expect(state.player.speedEffect?.multiplier).toBe(SPEED_BOOST_MULTIPLIER)
    const pod = state.pods[0]
    expect(pod?.active).toBe(false)
    expect(pod?.respawnSec).toBeGreaterThan(POD_RESPAWN_SEC - 1)

    // Move the player off the pod cell, shorten the cooldown, and let it tick.
    if (pod) {
      pod.respawnSec = 0.2
    }
    state.player.pos = { x: openMap.cellSize * 2.5, z: openMap.cellSize * 2.5 }
    state.player.vel = { x: 0, z: 0 }
    runSeconds(state, IDLE, 0.5)
    expect(pod?.active).toBe(true)
  })

  test('jump pod grants charges instead of a speed effect', () => {
    const state = makeState(openMap, {
      flags: [makeFlag(openMap, 0, 'blue', { col: 1, row: 5 }), makeFlag(openMap, 1, 'red', { col: 6, row: 5 })],
      pods: [makePod(openMap, 0, 'jump', openMap.playerSpawn)],
    })

    runSeconds(state, IDLE, 0.5)
    expect(state.player.hasJumpPower).toBe(true)
    expect(state.player.speedEffect).toBeNull()

    const pod = state.pods[0]
    expect(pod?.active).toBe(false)

    // Jump pods are one-shot: unlike other pods, they never respawn.
    state.player.pos = { x: openMap.cellSize * 2.5, z: openMap.cellSize * 2.5 }
    state.player.vel = { x: 0, z: 0 }
    runSeconds(state, IDLE, POD_RESPAWN_SEC + 1)
    expect(pod?.active).toBe(false)
  })

  test('droneSpeedScaleForRound ramps up with round index and caps at the max', () => {
    const early = droneSpeedScaleForRound(0)
    const mid = droneSpeedScaleForRound(6)
    const late = droneSpeedScaleForRound(13)

    expect(early).toBeLessThan(mid)
    expect(mid).toBeLessThan(late)
    expect(droneSpeedScaleForRound(100000)).toBe(DRONE_MAX_SPEED_SCALE)
  })

  test('steps are no-ops once the round is decided', () => {
    const state = makeState(openMap, {
      flags: [makeFlag(openMap, 0, 'blue', { col: 1, row: 5 }), makeFlag(openMap, 1, 'red', { col: 5, row: 2 })],
    })
    runSeconds(state, IDLE, 30)
    expect(state.outcome).toBe('lost')

    const snapshot = JSON.stringify(state)
    expect(stepEngine(state, IDLE, DT)).toHaveLength(0)
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})
