import type { EngineCommand, EngineEvent, EngineState } from '../../gameTypes'
import { createEngineState, stepEngine } from '../engine'
import { injectUnit, makeTestState, placeShaft, placeSlabRow, setStars } from './testState'

/**
 * A shaft serves the floors its column gains after it was built. Every site
 * that can give an existing shaft a new landing is enumerated here:
 *   1. a slab laid through a standard shaft's span,
 *   2. a slab laid beside a glass elevator,
 *   3. a skylobby added inside an express shaft's span (stop cap kept),
 *   4. an extension of the shaft itself (resize).
 * In each case the new landing starts enabled, like a freshly placed shaft's,
 * and the player's existing disabled landings stay disabled.
 */

function run(state: EngineState, commands: EngineCommand[]): EngineEvent[] {
  const events = stepEngine(state, commands, 0)
  const rejected = events.find((event) => event.type === 'placementRejected')
  if (rejected) {
    throw new Error(`rejected: ${JSON.stringify(rejected)}`)
  }
  return events
}

function advanceDays(state: EngineState, days: number): void {
  state.speed = 16
  const end = state.clock.day + days
  while (state.clock.day < end) {
    stepEngine(state, [], 1 / 60)
  }
}

describe('shaft landings follow the floors built after the shaft', () => {
  it('serves a floor slabbed after a standard elevator was built, so its tenants lease', () => {
    const state = createEngineState({ seed: 3, mapId: 'city-tower', lobbyHeight: 1 })
    run(state, [{ type: 'place', kind: 'lobby', floor: 0, x: 100, widthTiles: 40 }])
    run(state, [{ type: 'place', kind: 'slab', floor: 1, x: 100, widthTiles: 40 }])
    // The player drags the elevator up to floor 5 before those floors exist.
    run(state, [{ type: 'placeShaft', kind: 'standard', x: 120, bottomFloor: 0, topFloor: 5 }])
    const shaft = state.shafts[0]!
    expect(shaft.stops).toEqual([0, 1])
    run(state, [{ type: 'setStopEnabled', shaftId: shaft.id, floor: 1, enabled: false }])

    for (const floor of [2, 3]) {
      run(state, [{ type: 'place', kind: 'slab', floor, x: 100, widthTiles: 40 }])
    }

    expect(shaft.stops).toEqual([0, 1, 2, 3])
    expect(shaft.enabledStops).toEqual([0, 2, 3])

    run(state, [{ type: 'place', kind: 'aptStudio', floor: 3, x: 102 }])
    advanceDays(state, 1)
    const studio = state.units.find((unit) => unit.kind === 'aptStudio')!
    expect(studio.flags.noRoute).toBe(false)
    expect(studio.occupied).toBe(true)
  })

  it('gains a glass-elevator landing from a slab laid beside its exterior column', () => {
    const state = makeTestState()
    setStars(state, 4, 4)
    for (let floor = 0; floor <= 2; floor += 1) {
      placeSlabRow(state, floor, 0, 19)
    }
    const shaftId = placeShaft(state, 'glass', 20, 0, 4)
    const shaft = state.shafts.find((candidate) => candidate.id === shaftId)!
    expect(shaft.stops).toEqual([0, 1, 2])

    run(state, [{ type: 'place', kind: 'slab', floor: 3, x: 0, widthTiles: 20 }])

    expect(shaft.stops).toEqual([0, 1, 2, 3])
    expect(shaft.enabledStops).toEqual([0, 1, 2, 3])
  })

  it('gains later top-floor and skylobby stops on an express shaft without exceeding its stop cap', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 40)
    for (let floor = 1; floor <= 19; floor += 1) {
      placeSlabRow(state, floor, 0, 30)
    }
    // The express is dragged to floor 20 before that floor is built.
    const shaftId = placeShaft(state, 'express', 10, 0, 20)
    const shaft = state.shafts.find((candidate) => candidate.id === shaftId)!
    expect(shaft.stops).toEqual([0])
    for (const floor of [5, 10, 15]) {
      injectUnit(state, { kind: 'skylobby', floor, x: 0, width: 12, storeys: 1 })
    }

    run(state, [{ type: 'place', kind: 'slab', floor: 20, x: 0, widthTiles: 31 }])
    expect(shaft.stops).toEqual([0, 5, 10, 15, 20])
    expect(shaft.enabledStops).toEqual([0, 5, 10, 15, 20])

    // Unrelated construction preserves the complete five-stop set.
    run(state, [{ type: 'place', kind: 'slab', floor: 1, x: 31, widthTiles: 3 }])
    expect(shaft.stops).toEqual([0, 5, 10, 15, 20])
    expect(shaft.enabledStops).toEqual([0, 5, 10, 15, 20])
  })

  it('enables the landings a resize adds while keeping the player’s disabled ones', () => {
    const state = makeTestState()
    for (let floor = 0; floor <= 6; floor += 1) {
      placeSlabRow(state, floor, 0, 30)
    }
    const shaftId = placeShaft(state, 'standard', 10, 0, 3)
    run(state, [{ type: 'setStopEnabled', shaftId, floor: 2, enabled: false }])

    run(state, [{ type: 'resizeShaft', shaftId, bottomFloor: 0, topFloor: 6 }])

    const shaft = state.shafts.find((candidate) => candidate.id === shaftId)!
    expect(shaft.stops).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(shaft.enabledStops).toEqual([0, 1, 3, 4, 5, 6])
  })

  it('draws no rng when a later slab adds a landing', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 30)
    placeSlabRow(state, 1, 0, 30)
    placeShaft(state, 'standard', 10, 0, 4)
    const before = state.rng.state()
    run(state, [{ type: 'place', kind: 'slab', floor: 2, x: 0, widthTiles: 31 }])
    expect(state.rng.state()).toBe(before)
    expect(state.shafts[0]!.enabledStops).toEqual([0, 1, 2])
  })
})
