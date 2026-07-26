import type { EngineState, VipRecord } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { buildHudSnapshot } from '../engine'
import { injectUnit, makeTestState, setStars } from './testState'

function addPopulation(state: EngineState, population: number): void {
  injectUnit(state, {
    kind: 'aptStudio',
    floor: 1,
    x: 0,
    width: 4,
    storeys: 1,
    occupied: population > 0,
    population: { low: population, med: 0, high: 0, vip: 0 },
  })
}

function vipRecord(overrides: Partial<VipRecord>): VipRecord {
  return {
    target: 2,
    state: 'pending',
    satisfaction: 0,
    unitId: null,
    cooldownUntilDay: null,
    lastReport: [],
    ...overrides,
  }
}

describe('buildHudSnapshot star and VIP display fields', () => {
  it('reports progress one below a star threshold', () => {
    const state = makeTestState()
    addPopulation(state, TUNING.stars.popThresholds[2] - 1)

    const snapshot = buildHudSnapshot(state)

    expect(snapshot.starProgress).toEqual({
      nextStar: 2,
      threshold: TUNING.stars.popThresholds[2],
      remaining: 1,
      progress: (TUNING.stars.popThresholds[2] - 1) / TUNING.stars.popThresholds[2],
    })
    expect(snapshot.vipGoal).toEqual({
      target: 2,
      status: 'notArmed',
      blockedReason: null,
      cooldownUntilDay: null,
    })
  })

  it('marks the VIP goal armed exactly at the threshold', () => {
    const state = makeTestState()
    addPopulation(state, TUNING.stars.popThresholds[2])

    const snapshot = buildHudSnapshot(state)

    expect(snapshot.starProgress?.remaining).toBe(0)
    expect(snapshot.starProgress?.progress).toBe(1)
    expect(snapshot.vipGoal?.status).toBe('armed')
  })

  it('moves to the next threshold after the star is granted', () => {
    const state = makeTestState()
    setStars(state, 2)
    addPopulation(state, 600)

    const snapshot = buildHudSnapshot(state)

    expect(snapshot.starProgress).toEqual({
      nextStar: 3,
      threshold: TUNING.stars.popThresholds[3],
      remaining: 400,
      progress: 0.6,
    })
    expect(snapshot.vipGoal?.target).toBe(3)
  })

  it('hides progress and VIP goal at max star', () => {
    const state = makeTestState()
    setStars(state, 5)
    addPopulation(state, 20_000)

    const snapshot = buildHudSnapshot(state)

    expect(snapshot.starProgress).toBeNull()
    expect(snapshot.vipGoal).toBeNull()
  })

  it('describes the active map endgame and derives whether it is built', () => {
    const city = buildHudSnapshot(makeTestState())
    expect(city.mapId).toBe('city-tower')
    expect(city.endgame).toEqual({ kind: 'cathedral', name: 'Cathedral', floorLabel: '99', built: false })

    const fallsState = makeTestState({ mapId: 'niagara-falls' })
    injectUnit(fallsState, { kind: 'observationDeck', floor: 15, x: 2, width: 24, storeys: 2 })
    expect(buildHudSnapshot(fallsState).endgame).toEqual({
      kind: 'observationDeck',
      name: 'Observation Deck',
      floorLabel: 'B30 or 15',
      built: true,
    })
  })

  it('surfaces pending and blocked VIP records without mutating them', () => {
    const state = makeTestState()
    addPopulation(state, TUNING.stars.popThresholds[2])
    state.vips.push(vipRecord({
      target: 2,
      cooldownUntilDay: 4,
      lastReport: ['No clean suite was available', 'No route to a required destination'],
    }))

    const before = JSON.stringify(state.vips)
    const snapshot = buildHudSnapshot(state)

    expect(snapshot.vipGoal).toEqual({
      target: 2,
      status: 'cooldown',
      blockedReason: 'No clean suite was available; No route to a required destination',
      cooldownUntilDay: 4,
    })
    expect(JSON.stringify(state.vips)).toBe(before)
  })
})
