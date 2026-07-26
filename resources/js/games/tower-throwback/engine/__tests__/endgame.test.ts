import type { EngineEvent, EngineState } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { stepElevators } from '../elevators'
import { createEngineState, stepEngine } from '../engine'
import { weeklyStressPass } from '../occupancy'
import { stepPeople } from '../people'
import { applyDemolish, validateDemolish, validatePlacement } from '../placement'
import { stepVipMinute, stepVips } from '../vip'
import { injectUnit, makeTestState, place, placeShaft, placeSlabRow, setStars } from './testState'

function drive(state: EngineState, events: EngineEvent[], minutes: number, until?: () => boolean): void {
  for (let i = 0; i < minutes; i++) {
    if (until?.()) {
      return
    }
    let m = state.clock.minute + 1
    if (m >= 1440) {
      m = 0
      state.clock.day += 1
    }
    state.clock.minute = m
    stepVipMinute(state, m, events)
    stepElevators(state, 1, events)
    stepPeople(state, 1, events)
  }
}

/** 5★ tower: 100 slabbed floors, express to the roof, cathedral, penthouse, one amenity. */
function cathedralTower(withPenthouse: boolean): EngineState {
  const state = makeTestState()
  state.clock.minute = 7 * 60
  setStars(state, 5, 5)
  for (let f = 0; f <= 99; f++) {
    placeSlabRow(state, f, 0, 39)
  }
  placeShaft(state, 'express', 34, 0, 99) // stops seed to {0, 99}
  injectUnit(state, { kind: 'cathedral', floor: 99, x: 0, width: 30, storeys: 2 })
  injectUnit(state, { kind: 'fitness', floor: 0, x: 10, width: 12, storeys: 1, occupied: true })
  if (withPenthouse) {
    injectUnit(state, { kind: 'aptPenthouse', floor: 0, x: 23, width: 16, storeys: 1, evalScore: 90 })
  }
  return state
}

function observationDeckTower(withPenthouse: boolean): EngineState {
  const state = makeTestState({ mapId: 'niagara-falls' })
  state.clock.minute = 7 * 60
  setStars(state, 5, 5)
  for (let floor = 0; floor <= 15; floor += 1) {
    placeSlabRow(state, floor, 0, 188)
  }
  placeShaft(state, 'standard', 168, 0, 15)
  injectUnit(state, { kind: 'observationDeck', floor: 15, x: 171, width: 24, storeys: 2, facing: 'right' })
  injectUnit(state, { kind: 'fitness', floor: 0, x: 10, width: 12, storeys: 1, occupied: true })
  if (withPenthouse) {
    injectUnit(state, { kind: 'aptPenthouse', floor: 0, x: 23, width: 16, storeys: 1, evalScore: 90 })
  }
  return state
}

describe('TOWER VIP', () => {
  it('a standing cathedral arms the visit', () => {
    const state = cathedralTower(true)
    stepVips(state, [])
    expect(state.vips).toHaveLength(1)
    expect(state.vips[0]).toMatchObject({ target: 'tower', state: 'pending' })
  })

  it("arms from each map's own endgame structure, never its sibling", () => {
    const falls = observationDeckTower(true)
    stepVips(falls, [])
    expect(falls.vips[0]).toMatchObject({ target: 'tower', state: 'pending' })

    const wrongFallsStructure = observationDeckTower(true)
    wrongFallsStructure.units = wrongFallsStructure.units.filter((unit) => unit.kind !== 'observationDeck')
    injectUnit(wrongFallsStructure, { kind: 'cathedral', floor: 15, x: 2, width: 30, storeys: 2 })
    stepVips(wrongFallsStructure, [])
    expect(wrongFallsStructure.vips).toHaveLength(0)
  })

  it('completes the Niagara TOWER visit through the Observation Deck', () => {
    const state = observationDeckTower(true)
    const events: EngineEvent[] = []
    stepVips(state, events)
    drive(state, events, 4000, () => events.some((event) => event.type === 'vipResult'))

    expect(events).toContainEqual(expect.objectContaining({ type: 'vipResult', success: true, target: 'tower' }))
    expect(events).toContainEqual({ type: 'towerAchieved' })
    expect(state.towerAchieved).toBe(true)
  })

  it('routes the TOWER VIP into the Observation Deck render destination', () => {
    const state = observationDeckTower(true)
    const deck = state.units.find((unit) => unit.kind === 'observationDeck')!
    const events: EngineEvent[] = []
    stepVips(state, events)
    drive(state, events, 2500, () => state.people.some((person) => person.destUnitId === deck.id))

    expect(state.people).toContainEqual(expect.objectContaining({
      tier: 'vip',
      vip: true,
      purpose: 'vipVisit',
      destUnitId: deck.id,
    }))
  })

  it('success end-to-end: towerAchieved + milestone + golden penthouse resident', () => {
    const state = cathedralTower(true)
    const events: EngineEvent[] = []
    stepVips(state, events)
    drive(state, events, 4000, () => events.some((e) => e.type === 'vipResult'))

    const result = events.find((e) => e.type === 'vipResult')
    expect(result).toMatchObject({ type: 'vipResult', success: true, target: 'tower' })
    expect(state.towerAchieved).toBe(true)
    expect(events).toContainEqual({ type: 'towerAchieved' })
    expect(events).toContainEqual({ type: 'milestone', milestone: 'tower' })
    expect(state.milestonesEarned).toContain('tower')
    expect(state.star).toBe(5) // no star to grant — the crown is the prize
    expect(state.ledgerToday.lines['bonus.vip']).toBe(TUNING.economy.vipSuccessBonusPerStar * 5)

    const penthouse = state.units.find((u) => u.kind === 'aptPenthouse')!
    expect(events).toContainEqual({ type: 'vipMovedIn', target: 'tower', unitId: penthouse.id })
    expect(penthouse.population.vip).toBe(1)
    expect(state.vips[0]).toMatchObject({ state: 'resident', unitId: penthouse.id })
  })

  it('auto-fails without a vacant penthouse, then re-arms after the cooldown', () => {
    const state = cathedralTower(false)
    const events: EngineEvent[] = []
    stepVips(state, events)
    drive(state, events, 2200, () => events.some((e) => e.type === 'vipResult'))

    const result = events.find((e) => e.type === 'vipResult')
    expect(result).toMatchObject({ type: 'vipResult', success: false, target: 'tower' })
    if (result?.type === 'vipResult') {
      expect(result.report[0]).toContain('penthouse')
    }
    expect(state.towerAchieved).toBe(false)
    const record = state.vips[0]!
    expect(record.cooldownUntilDay).toBe(state.clock.day + TUNING.vip.cooldownDays)

    // Build the penthouse, wait out the cooldown → the re-armed visit succeeds.
    injectUnit(state, { kind: 'aptPenthouse', floor: 0, x: 23, width: 16, storeys: 1, evalScore: 90 })
    state.clock.day += TUNING.vip.cooldownDays
    const rearm: EngineEvent[] = []
    stepVips(state, rearm)
    expect(record.state).toBe('pending')
    drive(state, rearm, 4000, () => rearm.some((e) => e.type === 'vipResult'))
    expect(rearm).toContainEqual({ type: 'vipArrived', target: 'tower' })
    expect(rearm).toContainEqual(expect.objectContaining({ type: 'vipResult', success: true, target: 'tower' }))
    expect(state.towerAchieved).toBe(true)
  })

  it('a moved-out TOWER resident costs a star but the crown persists', () => {
    const state = makeTestState()
    setStars(state, 5, 5)
    state.towerAchieved = true
    placeSlabRow(state, 0, 0, 60)
    const penthouse = injectUnit(state, {
      kind: 'aptPenthouse', floor: 0, x: 10, width: 16, storeys: 1,
      occupied: true, population: { low: 0, med: 0, high: 0, vip: 1 }, evalScore: 40,
    })
    state.vips.push({
      target: 'tower', state: 'resident', satisfaction: 45,
      unitId: penthouse.id, cooldownUntilDay: null, lastReport: [],
    })

    penthouse.stressMarks = 2
    const events: EngineEvent[] = []
    weeklyStressPass(state, events) // 45 − 15 = 30 < 40 → move out

    expect(events).toContainEqual(expect.objectContaining({ type: 'vipMovedOut', target: 'tower' }))
    expect(events).toContainEqual(expect.objectContaining({ type: 'starLost', star: 4 }))
    expect(state.star).toBe(4)
    expect(state.towerAchieved).toBe(true) // never revoked
    expect(penthouse.occupied).toBe(false)
  })
})

describe('cathedral lockout & demolition', () => {
  it('locks above, allows below, and lifts on demolition with the crown intact', () => {
    const state = makeTestState()
    setStars(state, 5, 5)
    state.towerAchieved = true
    place(state, 'lobby', 0, 0, 40)
    for (let f = 1; f <= 10; f++) {
      placeSlabRow(state, f, 0, 39)
    }
    const cathedral = injectUnit(state, { kind: 'cathedral', floor: 10, x: 0, width: 30, storeys: 2 })

    expect(validatePlacement(state, { type: 'place', kind: 'slab', floor: 11, x: 32, widthTiles: 4 }).ok).toBe(false)
    expect(validatePlacement(state, { type: 'place', kind: 'officeS', floor: 5, x: 0 }).ok).toBe(true) // below is fine

    expect(validateDemolish(state, { type: 'demolishUnit', unitId: cathedral.id }).ok).toBe(true)
    applyDemolish(state, { type: 'demolishUnit', unitId: cathedral.id })
    expect(validatePlacement(state, { type: 'place', kind: 'slab', floor: 11, x: 32, widthTiles: 4 }).ok).toBe(true)
    expect(state.towerAchieved).toBe(true) // demolition never revokes TOWER
  })
})

describe('the sim never ends', () => {
  it('runs on for days after TOWER: settlements fire, commuters flow', () => {
    const state = createEngineState({ seed: 5, mapId: 'city-tower', lobbyHeight: 1 })
    state.towerAchieved = true
    const events: EngineEvent[] = []
    events.push(...stepEngine(state, [{ type: 'setSpeed', speed: 4 }], 0))
    events.push(
      ...stepEngine(
        state,
        [
          { type: 'place', kind: 'lobby', floor: 0, x: 100, widthTiles: 40 },
          { type: 'place', kind: 'slab', floor: 1, x: 100, widthTiles: 40 },
          { type: 'placeShaft', kind: 'standard', x: 130, bottomFloor: 0, topFloor: 1 },
          { type: 'place', kind: 'officeS', floor: 1, x: 100 },
          { type: 'place', kind: 'restroom', floor: 1, x: 110 },
        ],
        0,
      ),
    )
    let sawRiders = false
    const startDay = state.clock.day
    while (state.clock.day < startDay + 3) {
      const chunk = stepEngine(state, [], 5)
      events.push(...chunk)
      // Journeys complete WITHIN a 40-game-min chunk, so sample activity via
      // elevator dings rather than the between-chunk people count.
      sawRiders ||= chunk.some((e) => e.type === 'elevatorDing')
    }
    expect(events.filter((e) => e.type === 'settlement')).toHaveLength(3)
    expect(sawRiders).toBe(true) // commuters still ride the morning rush
    expect(state.towerAchieved).toBe(true)
  })
})
