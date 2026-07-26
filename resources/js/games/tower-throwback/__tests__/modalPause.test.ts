/**
 * Item 7's pause is expressed as a ZERO STEP rather than a speed change. These
 * tests pin the two consequences that make that choice correct: no time or rng
 * advances, and queued commands still apply so the HUD keeps working behind the
 * modal. Because the player's `speed` is never mutated, "restore the prior
 * speed" is a non-operation — which is exactly what the last test asserts.
 */
import { stepEngine } from '../engine/engine'
import { buildScenario } from '../engine/scenarios'
import type { EngineState } from '../gameTypes'

const DT = 1 / 30

function fingerprint(state: EngineState): string {
  return JSON.stringify({
    day: state.clock.day,
    minute: state.clock.minute,
    rng: state.rng.state(),
    funds: state.funds,
    people: state.people.length,
    structureVersion: state.structureVersion,
    nextId: state.nextId,
  })
}

function busyTower(seed = 4_242): EngineState {
  const state = buildScenario('midgame', seed)
  stepEngine(state, [{ type: 'setSpeed', speed: 8 }], 0)
  return state
}

describe('pausing behind a blocking modal', () => {
  it('freezes the clock, rng, and population for as long as it is paused', () => {
    const state = busyTower()
    // Warm up so the tower is genuinely mid-simulation, not at rest.
    for (let i = 0; i < 120; i++) {
      stepEngine(state, [], DT)
    }
    const before = fingerprint(state)

    for (let i = 0; i < 600; i++) {
      stepEngine(state, [], 0)
    }

    expect(fingerprint(state)).toBe(before)
  })

  it('still applies queued commands while paused', () => {
    // Otherwise saving, answering a loan, or toggling disasters from inside a
    // modal would silently do nothing.
    const state = busyTower()

    stepEngine(state, [{ type: 'setDisastersEnabled', enabled: false }], 0)

    expect(state.options.disastersEnabled).toBe(false)
  })

  it('leaves the player speed selection untouched', () => {
    const state = busyTower()
    expect(state.speed).toBe(8)

    for (let i = 0; i < 100; i++) {
      stepEngine(state, [], 0)
    }

    // Nothing to restore on close: pausing never wrote to `speed`, so a crash
    // or an unmount mid-modal cannot strand the player at 0x.
    expect(state.speed).toBe(8)
  })

  it('resumes to exactly the state it paused at, including Fast mode', () => {
    const paused = busyTower()
    const control = busyTower()
    stepEngine(paused, [{ type: 'setFastMode', enabled: true }], 0)
    stepEngine(control, [{ type: 'setFastMode', enabled: true }], 0)

    // Pause the first tower for a while, then run BOTH the same number of
    // live steps. A pause that leaked time would desync them.
    for (let i = 0; i < 300; i++) {
      stepEngine(paused, [], 0)
    }
    for (let i = 0; i < 200; i++) {
      stepEngine(paused, [], DT)
      stepEngine(control, [], DT)
    }

    expect(paused.fastMode).toBe(true)
    expect(fingerprint(paused)).toBe(fingerprint(control))
  })

  it('is byte-identical to never having paused at all', () => {
    // The golden-log guarantee: interleaving pauses into a run must not change
    // its outcome by a single field.
    const interleaved = busyTower()
    const straight = busyTower()

    for (let i = 0; i < 400; i++) {
      stepEngine(interleaved, [], DT)
      if (i % 25 === 0) {
        stepEngine(interleaved, [], 0)
        stepEngine(interleaved, [], 0)
      }
      stepEngine(straight, [], DT)
    }

    expect(fingerprint(interleaved)).toBe(fingerprint(straight))
  })
})
