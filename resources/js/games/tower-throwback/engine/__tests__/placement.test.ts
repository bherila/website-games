import type { EngineState } from '../../gameTypes'
import { EXCAVATION_COST } from '../catalog'
import { stepElevators } from '../elevators'
import { spawnPerson, stepPeople } from '../people'
import { applyDemolish, validateDemolish, validatePlacement } from '../placement'
import { applyStarLoss } from '../stars'
import { injectUnit, makeTestState, place, placeShaft, placeSlabRow, setStars } from './testState'

function reason(state: EngineState, cmd: Parameters<typeof validatePlacement>[1]): string {
  const result = validatePlacement(state, cmd)
  if (result.ok) {
    throw new Error('expected rejection')
  }
  return result.reason
}

describe('lobby placement', () => {
  it('accepts a lobby on floor 0 and rejects it elsewhere', () => {
    const state = makeTestState()
    expect(validatePlacement(state, { type: 'place', kind: 'lobby', floor: 0, x: 0, widthTiles: 10 }).ok).toBe(true)
    expect(reason(state, { type: 'place', kind: 'lobby', floor: 1, x: 0, widthTiles: 10 })).toMatch(/lobby floor/)
  })

  it('allows a discontiguous lobby (twin towers)', () => {
    const state = makeTestState()
    place(state, 'lobby', 0, 0, 10)
    expect(validatePlacement(state, { type: 'place', kind: 'lobby', floor: 0, x: 20, widthTiles: 10 }).ok).toBe(true)
    place(state, 'lobby', 0, 20, 10)
    expect(state.units).toHaveLength(2)
  })
})

describe('shaft vs unit layer', () => {
  it('allows a shaft over a lobby but not over an office', () => {
    const state = makeTestState()
    place(state, 'lobby', 0, 0, 20)
    placeSlabRow(state, 0, 20, 40)
    expect(validatePlacement(state, { type: 'placeShaft', kind: 'standard', x: 2, bottomFloor: 0, topFloor: 5 }).ok).toBe(true)

    place(state, 'officeS', 0, 22) // occupies 22..27 in the unit layer, on plain slab
    expect(reason(state, { type: 'placeShaft', kind: 'standard', x: 23, bottomFloor: 0, topFloor: 5 })).toMatch(/through a unit/)
  })
})

describe('express default stops', () => {
  it('caps seeded stops at 5 (bottom + top + skylobbies)', () => {
    const state = makeTestState()
    for (let f = 0; f <= 4; f++) {
      placeSlabRow(state, f, 40, 60)
    }
    place(state, 'skylobby', 5, 40, 12)
    place(state, 'skylobby', 6, 40, 12)
    place(state, 'skylobby', 7, 40, 12)
    place(state, 'skylobby', 8, 40, 12)
    placeSlabRow(state, 9, 40, 51)

    const id = placeShaft(state, 'express', 42, 0, 9)
    const shaft = state.shafts.find((s) => s.id === id)!
    // Candidates {0,9,5,6,7,8} → 6 distinct, capped to 5.
    expect(shaft.stops).toHaveLength(5)
    expect(shaft.enabledStops.length).toBeLessThanOrEqual(5)
  })
})

describe('standard elevator reach', () => {
  it('rejects a span beyond maxReachFloors', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 5)
    expect(reason(state, { type: 'placeShaft', kind: 'standard', x: 0, bottomFloor: 0, topFloor: 31 })).toMatch(/at most 30 floors/)
    expect(validatePlacement(state, { type: 'placeShaft', kind: 'standard', x: 0, bottomFloor: 0, topFloor: 30 }).ok).toBe(true)
  })
})

describe('slab support', () => {
  it('requires a floor below above ground', () => {
    const state = makeTestState()
    expect(reason(state, { type: 'place', kind: 'slab', floor: 1, x: 0, widthTiles: 5 })).toMatch(/below/)
    placeSlabRow(state, 0, 0, 4)
    expect(validatePlacement(state, { type: 'place', kind: 'slab', floor: 1, x: 0, widthTiles: 5 }).ok).toBe(true)
  })

  it('requires a floor above underground and charges excavation', () => {
    const state = makeTestState()
    setStars(state, 3, 3)
    expect(reason(state, { type: 'place', kind: 'slab', floor: -1, x: 0, widthTiles: 5 })).toMatch(/above/)
    placeSlabRow(state, 0, 0, 4)
    const result = validatePlacement(state, { type: 'place', kind: 'slab', floor: -1, x: 0, widthTiles: 5 })
    expect(result).toEqual({ ok: true, cost: EXCAVATION_COST * 5 })
  })
})

describe('skybridge end-support', () => {
  it('accepts when both ends land on a structure, rejects a dangling end', () => {
    const state = makeTestState({ star: 4, maxStarReached: 4 })
    for (const [x0, x1] of [[0, 4], [10, 14]] as const) {
      for (let f = 0; f <= 1; f++) {
        placeSlabRow(state, f, x0, x1)
      }
    }
    expect(validatePlacement(state, { type: 'place', kind: 'skybridge', floor: 1, x: 5, widthTiles: 5 }).ok).toBe(true)
    // Right end at x=9 → xHi+1 = 9? footprint 5..8, xHi+1 = 9 is empty air.
    expect(reason(state, { type: 'place', kind: 'skybridge', floor: 1, x: 5, widthTiles: 4 })).toMatch(/each end/)
  })
})

describe('underground star gate', () => {
  it('rejects excavation below 3★ and accepts at 3★', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 4)
    expect(reason(state, { type: 'place', kind: 'slab', floor: -1, x: 0, widthTiles: 5 })).toMatch(/unlocks at 3★/)
    setStars(state, 3, 3)
    expect(validatePlacement(state, { type: 'place', kind: 'slab', floor: -1, x: 0, widthTiles: 5 }).ok).toBe(true)
  })
})

describe('subway vertical placement', () => {
  it('is only placeable on floor −10', () => {
    const state = makeTestState()
    setStars(state, 3, 3)
    for (let f = 0; f >= -10; f--) {
      placeSlabRow(state, f, 0, 29)
    }
    expect(validatePlacement(state, { type: 'place', kind: 'subway', floor: -10, x: 0 }).ok).toBe(true)
    expect(reason(state, { type: 'place', kind: 'subway', floor: -9, x: 0 })).toMatch(/floor B10/)
  })
})

describe('star gate uses maxStarReached', () => {
  it('accepts a 3★ item at star 1 when maxStarReached is 3', () => {
    const state = makeTestState()
    setStars(state, 1, 3)
    placeSlabRow(state, 0, 0, 9)
    expect(validatePlacement(state, { type: 'place', kind: 'apt2br', floor: 0, x: 0 }).ok).toBe(true)
  })

  it('still accepts a 3★ item after a star loss (maxStarReached unchanged)', () => {
    const state = makeTestState()
    setStars(state, 3, 3)
    placeSlabRow(state, 0, 0, 9)
    applyStarLoss(state, ['vip left'], [])
    expect(state.star).toBe(2)
    expect(state.maxStarReached).toBe(3)
    expect(validatePlacement(state, { type: 'place', kind: 'apt2br', floor: 0, x: 0 }).ok).toBe(true)
  })
})

describe('post-cathedral lockout', () => {
  it('rejects slab-family placement above an existing cathedral', () => {
    const state = makeTestState()
    injectUnit(state, { kind: 'cathedral', floor: 10, x: 0, width: 30, storeys: 2 })
    expect(reason(state, { type: 'place', kind: 'slab', floor: 12, x: 0, widthTiles: 5 })).toMatch(/locked/)
    // At/below the cathedral floor the lockout does not fire (floor 0 needs no support).
    expect(validatePlacement(state, { type: 'place', kind: 'slab', floor: 0, x: 0, widthTiles: 5 }).ok).toBe(true)
  })
})

describe('cathedral', () => {
  function tower5Star(): EngineState {
    const state = makeTestState()
    setStars(state, 5, 5)
    for (let f = 0; f <= 99; f++) {
      placeSlabRow(state, f, 0, 40)
    }
    return state
  }

  it('needs a nearby shaft stop, is unique, and pokes above the grid', () => {
    const state = tower5Star()
    // No adjacent shaft yet → adjacency reject.
    const farShaft = placeShaft(state, 'standard', 38, 70, 99)
    expect(reason(state, { type: 'place', kind: 'cathedral', floor: 99, x: 0 })).toMatch(/within 3 tiles/)

    applyDemolish(state, { type: 'demolishShaft', shaftId: farShaft })
    placeShaft(state, 'standard', 30, 70, 99)
    expect(validatePlacement(state, { type: 'place', kind: 'cathedral', floor: 99, x: 0 }).ok).toBe(true)
    place(state, 'cathedral', 99, 0)

    expect(reason(state, { type: 'place', kind: 'cathedral', floor: 99, x: 0 })).toMatch(/[Oo]ne cathedral/)
  })

  it('requires a full 5★ rating', () => {
    const state = tower5Star()
    setStars(state, 4, 5) // demoted current star
    placeShaft(state, 'standard', 30, 70, 99)
    expect(reason(state, { type: 'place', kind: 'cathedral', floor: 99, x: 0 })).toMatch(/5★/)
  })
})

describe('glass column blocks slab', () => {
  it('rejects a slab on a reserved glass-elevator column', () => {
    const state = makeTestState()
    setStars(state, 4, 4)
    placeSlabRow(state, 0, 0, 9) // covers x=9, adjacent to the glass column at x=10
    placeShaft(state, 'glass', 10, 0, 5)
    expect(reason(state, { type: 'place', kind: 'slab', floor: 0, x: 10, widthTiles: 2 })).toMatch(/glass/)
  })
})

describe('demolition', () => {
  it('rejects demolishing a slab that a unit rests on, refunds correctly', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 9)
    const upperSlab = placeSlabRow(state, 1, 0, 9)
    const officeId = place(state, 'officeS', 1, 0)

    expect(validateDemolish(state, { type: 'demolishUnit', unitId: upperSlab })).toEqual({
      ok: false,
      reason: 'Cannot demolish a floor while a unit rests on it',
    })

    // Occupied units may still be demolished.
    state.units.find((u) => u.id === officeId)!.occupied = true
    const officeRefund = validateDemolish(state, { type: 'demolishUnit', unitId: officeId })
    expect(officeRefund).toEqual({ ok: true, cost: 10_000 }) // 0.5 × $20,000
    applyDemolish(state, { type: 'demolishUnit', unitId: officeId })

    // Now the slab frees up: refund 0.5 × (50 × 10 tiles) = 250.
    expect(validateDemolish(state, { type: 'demolishUnit', unitId: upperSlab })).toEqual({ ok: true, cost: 250 })
  })

  it('refunds half of a shaft build cost', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 9)
    const shaftId = placeShaft(state, 'standard', 0, 0, 4)
    // baseCost 50,000 + 5,000 × span(4) = 70,000 → refund 35,000.
    expect(validateDemolish(state, { type: 'demolishShaft', shaftId })).toEqual({ ok: true, cost: 35_000 })
  })
})

describe('tall lobby atrium', () => {
  it('gives the lobby unit storeys = lobbyHeight and prices per storey', () => {
    const state = makeTestState({ lobbyHeight: 3 })
    const result = validatePlacement(state, { type: 'place', kind: 'lobby', floor: 0, x: 0, widthTiles: 20 })
    expect(result).toEqual({ ok: true, cost: 300 * 20 * 3 }) // $300 × width × height
    const lobbyId = place(state, 'lobby', 0, 0, 20)
    expect(state.units.find((u) => u.id === lobbyId)!.storeys).toBe(3)
  })

  it('rejects an office on the atrium floors over lobby tiles', () => {
    const state = makeTestState({ lobbyHeight: 2 })
    place(state, 'lobby', 0, 0, 20)
    expect(validatePlacement(state, { type: 'place', kind: 'officeS', floor: 1, x: 0 }).ok).toBe(false)
    // The atrium is unit-layer occupied, so even its prerequisite slab is blocked.
    expect(reason(state, { type: 'place', kind: 'slab', floor: 1, x: 0, widthTiles: 5 })).toBe('Overlaps an existing unit')
  })

  it('allows an office at floor 1 beside the lobby (with slab support)', () => {
    const state = makeTestState({ lobbyHeight: 2 })
    place(state, 'lobby', 0, 0, 20)
    placeSlabRow(state, 0, 30, 45)
    placeSlabRow(state, 1, 30, 40)
    expect(validatePlacement(state, { type: 'place', kind: 'officeS', floor: 1, x: 30 }).ok).toBe(true)
  })

  it('rejects a slab inside a two-storey unit upper floor', () => {
    const state = makeTestState()
    setStars(state, 3, 3)
    placeSlabRow(state, 0, 0, 19)
    // Normal placement always slabs the upper storey first (support rule), which would
    // reject as 'Overlaps an existing floor' — inject the theater bare to prove the
    // upper storey itself sits in the unit layer and blocks slab-family placement.
    injectUnit(state, { kind: 'movieTheater', floor: 0, x: 0, width: 20, storeys: 2 })
    expect(reason(state, { type: 'place', kind: 'slab', floor: 1, x: 0, widthTiles: 5 })).toBe('Overlaps an existing unit')
  })

  it('lets a shaft cross a 3-storey lobby atrium but not other units', () => {
    const state = makeTestState({ lobbyHeight: 3 })
    place(state, 'lobby', 0, 0, 20)
    expect(validatePlacement(state, { type: 'placeShaft', kind: 'standard', x: 2, bottomFloor: 0, topFloor: 5 }).ok).toBe(true)
    placeShaft(state, 'standard', 2, 0, 5)

    injectUnit(state, { kind: 'officeS', floor: 1, x: 10, width: 6, storeys: 1 })
    expect(reason(state, { type: 'placeShaft', kind: 'standard', x: 11, bottomFloor: 0, topFloor: 5 })).toBe(
      'Shaft would run through a unit',
    )
  })

  it('the atrium top supports the first floor above a tall lobby', () => {
    const state = makeTestState({ lobbyHeight: 2 })
    place(state, 'lobby', 0, 0, 20)
    // Floor 1 is the atrium (blocked); floor 2 rests on the atrium top.
    expect(reason(state, { type: 'place', kind: 'slab', floor: 1, x: 0, widthTiles: 10 })).toBe('Overlaps an existing unit')
    expect(validatePlacement(state, { type: 'place', kind: 'slab', floor: 2, x: 0, widthTiles: 10 }).ok).toBe(true)
    place(state, 'slab', 2, 0, 10)
    expect(validatePlacement(state, { type: 'place', kind: 'officeS', floor: 2, x: 0 }).ok).toBe(true)
  })
})

describe('shaft demolition rescue (review fix #1)', () => {
  function midRideSetup() {
    const state = makeTestState()
    for (let f = 0; f <= 5; f++) {
      placeSlabRow(state, f, 0, 30)
    }
    const shaftId = placeShaft(state, 'standard', 10, 0, 5)
    const backupId = placeShaft(state, 'standard', 20, 0, 5)
    const shaft = state.shafts.find((s) => s.id === shaftId)!
    return { state, shaft, shaftId, backupId }
  }

  it('sets riders down, re-plans them, and empties the dead cars', () => {
    const { state, shaft, shaftId, backupId } = midRideSetup()
    const rider = spawnPerson(state, { tier: 'med', floor: 0, x: 10, toFloor: 5, toX: 28, purpose: 'shopping' })!
    // Board manually mid-ride at floor 2.6.
    rider.state = 'riding'
    shaft.cars[0]!.passengerIds.push(rider.id)
    shaft.cars[0]!.y = 2.6

    applyDemolish(state, { type: 'demolishShaft', shaftId })
    expect(state.people).toHaveLength(1)
    expect(rider.state).not.toBe('riding')
    expect(rider.floor).toBe(3) // nearest slabbed floor to y=2.6
    expect(rider.legs.every((l) => l.shaftId !== shaftId)).toBe(true)
    expect(rider.legs.some((l) => l.type === 'elevator' && l.shaftId === backupId)).toBe(true)

    // The journey actually completes on the surviving shaft.
    for (let t = 0; t < 400 && state.people.length > 0; t++) {
      stepElevators(state, 0.5, [])
      stepPeople(state, 0.5, [])
    }
    expect(state.people).toHaveLength(0) // no leak toward the LOD cap
  })

  it('re-plans queued people and despawns the unroutable', () => {
    const { state, shaftId, backupId } = midRideSetup()
    const queued = spawnPerson(state, { tier: 'med', floor: 0, x: 10, toFloor: 5, toX: 28, purpose: 'shopping' })!
    expect(queued.state).toBe('queued')
    applyDemolish(state, { type: 'demolishShaft', shaftId })
    expect(queued.legs.some((l) => l.type === 'elevator' && l.shaftId === backupId)).toBe(true)

    // Now demolish the ONLY remaining shaft: no route left → abandon (despawn).
    applyDemolish(state, { type: 'demolishShaft', shaftId: backupId })
    expect(state.people).toHaveLength(0)
  })
})

describe('slab demolition & reshape (review fix #14)', () => {
  it('rejects removing a floor that supports the one above, then allows it bottom-up', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 9)
    const f1 = placeSlabRow(state, 1, 0, 9)
    const f2 = placeSlabRow(state, 2, 0, 9)

    expect(validateDemolish(state, { type: 'demolishUnit', unitId: f1 })).toEqual({
      ok: false,
      reason: 'Cannot demolish a floor that supports another',
    })
    expect(validateDemolish(state, { type: 'demolishUnit', unitId: f2 }).ok).toBe(true)
    applyDemolish(state, { type: 'demolishUnit', unitId: f2 })
    expect(validateDemolish(state, { type: 'demolishUnit', unitId: f1 }).ok).toBe(true)
  })

  it('floor 0 anchors the basement: undemolishable while underground slabs hang from it', () => {
    const state = makeTestState()
    setStars(state, 3, 3)
    const ground = placeSlabRow(state, 0, 0, 9)
    placeSlabRow(state, -1, 0, 9)
    expect(validateDemolish(state, { type: 'demolishUnit', unitId: ground })).toMatchObject({
      ok: false,
      reason: 'Cannot demolish a floor that supports another',
    })
  })

  it("the user's reshape scenario: delete an empty run, re-place a wider one", () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 29)
    const narrow = placeSlabRow(state, 1, 0, 9)
    const demolished = applyDemolish(state, { type: 'demolishUnit', unitId: narrow })
    expect(demolished).toContainEqual({ type: 'demolished', refund: 250 }) // 0.5 × 10 × $50
    expect(validatePlacement(state, { type: 'place', kind: 'slab', floor: 1, x: 0, widthTiles: 30 })).toEqual({
      ok: true,
      cost: 1500,
    })
    place(state, 'slab', 1, 0, 30)
    expect(state.units.filter((u) => u.floor === 1)).toHaveLength(1)
  })
})
