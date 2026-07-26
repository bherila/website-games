import type { EngineState } from '../../gameTypes'
import { getSegments } from '../grid'
import { spawnPerson, stepPeople } from '../people'
import { applyDemolish } from '../placement'
import { findRoute, hasRouteToLobby } from '../routing'
import { injectUnit, makeTestState, place, placeShaft, placeSlabRow, setStars } from './testState'

describe('findRoute — segments and walks', () => {
  it('routes within one segment as a single walk (empty when already there)', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 30)
    expect(findRoute(state, 0, 2, 0, 20)).toEqual([{ type: 'walk', fromFloor: 0, fromX: 2, toFloor: 0, toX: 20 }])
    expect(findRoute(state, 0, 5, 0, 5)).toEqual([])
  })

  it('twin towers are isolated until connected', () => {
    const state = makeTestState()
    setStars(state, 4, 4)
    for (let f = 0; f <= 2; f++) {
      placeSlabRow(state, f, 0, 9)
      placeSlabRow(state, f, 20, 29)
    }
    expect(findRoute(state, 2, 0, 2, 25)).toBeNull()
    // A skybridge is slab-family: its tiles merge the floor's segments outright.
    place(state, 'skybridge', 2, 10, 10)
    const bridged = findRoute(state, 2, 0, 2, 25)
    expect(bridged).toEqual([{ type: 'walk', fromFloor: 2, fromX: 0, toFloor: 2, toX: 25 }])
  })
})

describe('findRoute — elevator leg budget', () => {
  function threeBandTower(): EngineState {
    const state = makeTestState()
    for (let f = 0; f <= 30; f++) {
      placeSlabRow(state, f, 0, 30)
    }
    placeShaft(state, 'standard', 2, 0, 10)
    placeShaft(state, 'standard', 6, 10, 20)
    placeShaft(state, 'standard', 12, 20, 30)
    return state
  }

  it('allows one transfer (2 legs) but never a third leg', () => {
    const state = threeBandTower()
    const oneLeg = findRoute(state, 0, 0, 5, 20)
    expect(oneLeg?.filter((l) => l.type === 'elevator')).toHaveLength(1)

    const twoLegs = findRoute(state, 0, 0, 20, 20)
    expect(twoLegs?.filter((l) => l.type === 'elevator')).toHaveLength(2)
    expect(twoLegs?.some((l) => l.type === 'elevator' && l.fromFloor === 10)).toBe(true)

    // 0 → 25 needs three bands → null.
    expect(findRoute(state, 0, 0, 25, 20)).toBeNull()
  })

  it('skylobby-style transfer floors work across shaft bands', () => {
    const state = threeBandTower()
    const route = findRoute(state, 0, 0, 20, 20)!
    const [first, second] = route.filter((l) => l.type === 'elevator')
    expect(first).toMatchObject({ fromFloor: 0, toFloor: 10 })
    expect(second).toMatchObject({ fromFloor: 10, toFloor: 20 })
  })
})

describe('findRoute — stairs and escalators', () => {
  function walkupTower(floors: number, kind: 'stairs' | 'escalator'): EngineState {
    const state = makeTestState()
    setStars(state, 2, 2)
    for (let f = 0; f <= floors; f++) {
      placeSlabRow(state, f, 0, 20)
    }
    for (let f = 0; f < floors; f++) {
      place(state, kind, f, 4)
    }
    return state
  }

  it('people willing to climb at most 4 floors of stairs', () => {
    const four = walkupTower(4, 'stairs')
    const route = findRoute(four, 0, 0, 4, 10)
    expect(route?.filter((l) => l.type === 'stairs')).toHaveLength(4)

    const five = walkupTower(5, 'stairs')
    expect(findRoute(five, 0, 0, 5, 10)).toBeNull()
  })

  it('escalator legs do not count against the stairs budget', () => {
    const state = walkupTower(5, 'escalator')
    const route = findRoute(state, 0, 0, 5, 10)
    expect(route?.filter((l) => l.type === 'escalator')).toHaveLength(5)
  })

  it('stairs are preferred over an elevator (fewer elevator legs wins)', () => {
    const state = walkupTower(2, 'stairs')
    placeShaft(state, 'standard', 10, 0, 2)
    const route = findRoute(state, 0, 0, 2, 15)!
    expect(route.some((l) => l.type === 'elevator')).toBe(false)
  })
})

describe('findRoute — service shafts', () => {
  it('excludes service shafts unless the journey is staff', () => {
    const state = makeTestState()
    for (let f = 0; f <= 5; f++) {
      placeSlabRow(state, f, 0, 20)
    }
    placeShaft(state, 'service', 4, 0, 5)
    expect(findRoute(state, 0, 0, 5, 10)).toBeNull()
    const staffRoute = findRoute(state, 0, 0, 5, 10, { staff: true })
    expect(staffRoute?.some((l) => l.type === 'elevator')).toBe(true)
  })
})

describe('findRoute — cache invalidation and avoidance', () => {
  it('a new shaft invalidates a cached null result', () => {
    const state = makeTestState()
    for (let f = 0; f <= 5; f++) {
      placeSlabRow(state, f, 0, 20)
    }
    expect(findRoute(state, 0, 0, 5, 10)).toBeNull()
    placeShaft(state, 'standard', 4, 0, 5) // bumps structureVersion
    expect(findRoute(state, 0, 0, 5, 10)).not.toBeNull()
  })

  it('avoidShaftId falls back to another shaft', () => {
    const state = makeTestState()
    for (let f = 0; f <= 5; f++) {
      placeSlabRow(state, f, 0, 20)
    }
    const a = placeShaft(state, 'standard', 2, 0, 5)
    const b = placeShaft(state, 'standard', 8, 0, 5)
    const preferred = findRoute(state, 0, 2, 5, 15)!
    expect(preferred.find((l) => l.type === 'elevator')?.shaftId).toBe(a)
    const rerouted = findRoute(state, 0, 2, 5, 15, { avoidShaftId: a })!
    expect(rerouted.find((l) => l.type === 'elevator')?.shaftId).toBe(b)
    expect(findRoute(state, 0, 2, 5, 15, { avoidShaftId: b })!.find((l) => l.type === 'elevator')?.shaftId).toBe(a)
  })
})

describe('hasRouteToLobby', () => {
  it('ground floor units always count; upper floors need a connection', () => {
    const state = makeTestState()
    for (let f = 0; f <= 3; f++) {
      placeSlabRow(state, f, 0, 20)
    }
    const ground = injectUnit(state, { kind: 'shop', floor: 0, x: 0, width: 8, storeys: 1 })
    const upper = injectUnit(state, { kind: 'aptStudio', floor: 3, x: 0, width: 4, storeys: 1 })
    expect(hasRouteToLobby(state, ground)).toBe(true)
    expect(hasRouteToLobby(state, upper)).toBe(false)
    placeShaft(state, 'standard', 10, 0, 3)
    expect(hasRouteToLobby(state, upper)).toBe(true)
  })
})

describe('skybridge — functional routing (Phase 12)', () => {
  /** Twin towers, each with its own shaft; optional bridge joins floor 8. */
  function twinTowers(bridged: boolean): { state: EngineState; bridgeId: number | null } {
    const state = makeTestState()
    setStars(state, 4, 4)
    for (let f = 0; f <= 8; f++) {
      placeSlabRow(state, f, 0, 9)
      placeSlabRow(state, f, 20, 29)
    }
    placeShaft(state, 'standard', 2, 0, 8)
    placeShaft(state, 'standard', 24, 0, 8)
    let bridgeId: number | null = null
    if (bridged) {
      bridgeId = place(state, 'skybridge', 8, 10, 10)
    }
    return { state, bridgeId }
  }

  it('merges the bridged floor into one segment and routes across with ≤2 elevator legs', () => {
    const dry = twinTowers(false)
    expect(findRoute(dry.state, 0, 0, 0, 26)).toBeNull() // towers isolated

    const { state } = twinTowers(true)
    // The bridge tiles paint the slab layer: floor 8 becomes ONE walkable run.
    expect(getSegments(state).get(8)).toEqual([{ floor: 8, x0: 0, x1: 29 }])

    const route = findRoute(state, 0, 0, 0, 26)
    expect(route).not.toBeNull()
    const elevatorLegs = route!.filter((l) => l.type === 'elevator')
    expect(elevatorLegs).toHaveLength(2) // up tower A, across, down tower B
    expect(elevatorLegs[0]).toMatchObject({ fromFloor: 0, toFloor: 8 })
    expect(elevatorLegs[1]).toMatchObject({ fromFloor: 8, toFloor: 0 })
    // The crossing is a plain walk leg on the bridged floor ('skybridge' leg
    // type stays reserved for rendering — the slab merge makes it a walk).
    const crossing = route!.find((l) => l.type === 'walk' && l.fromFloor === 8)
    expect(crossing).toMatchObject({ fromX: 2, toX: 24 })
  })

  it('demolishing the bridge severs the route again', () => {
    const { state, bridgeId } = twinTowers(true)
    expect(findRoute(state, 0, 0, 0, 26)).not.toBeNull()
    applyDemolish(state, { type: 'demolishUnit', unitId: bridgeId! })
    expect(findRoute(state, 0, 0, 0, 26)).toBeNull()
    expect(getSegments(state).get(8)).toHaveLength(2) // split back into two runs
  })

  it('foot traffic across the bridge credits pass-by sales', () => {
    const { state } = twinTowers(true)
    injectUnit(state, { kind: 'fastfood', floor: 8, x: 20, width: 12, storeys: 1, occupied: true })
    const before = state.funds
    for (let i = 0; i < 40; i++) {
      spawnPerson(state, { tier: 'low', floor: 8, x: 0, toFloor: 8, toX: 29, purpose: 'errand' })
      for (let t = 0; t < 4; t++) {
        stepPeople(state, 0.25, [])
      }
    }
    expect(state.funds).toBeGreaterThan(before) // impulse buys while crossing
    expect(state.ledgerToday.lines['sales.commerce']).toBe(state.funds - before)
  })
})
