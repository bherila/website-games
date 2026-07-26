import type { EngineState } from '../../gameTypes'
import { stepEngine } from '../engine'
import { buildScenario, type ScenarioName } from '../scenarios'

function fingerprint(state: EngineState): Record<string, number> {
  return {
    structureVersion: state.structureVersion,
    funds: state.funds,
    units: state.units.length,
    shafts: state.shafts.length,
    day: state.clock.day,
  }
}

function simulateOneDay(state: EngineState): void {
  stepEngine(state, [{ type: 'setSpeed', speed: 4 }], 0)
  const targetDay = state.clock.day + 1
  let guard = 0
  while (state.clock.day < targetDay) {
    stepEngine(state, [], 5)
    if (++guard > 100_000) {
      throw new Error('simulateOneDay never finished')
    }
  }
}

describe.each(['starter', 'midgame', 'endgame'] as ScenarioName[])('%s scenario', (name) => {
  it('builds through validated placement, survives a day, and is deterministic', () => {
    const state = buildScenario(name, 7)
    expect(state.units.length).toBeGreaterThan(5)
    expect(state.shafts.length).toBeGreaterThanOrEqual(1)
    expect(state.funds).toBeGreaterThan(0)

    simulateOneDay(state)
    expect(state.funds).toBeGreaterThanOrEqual(0)

    const again = buildScenario(name, 7)
    expect(fingerprint(again)).toEqual(fingerprint(buildScenario(name, 7)))
  })
})

describe('scenario shapes', () => {
  it('starter is a small 1★ tower', () => {
    const state = buildScenario('starter', 1)
    expect(state.units.some((u) => u.kind === 'officeS')).toBe(true)
    expect(state.shafts).toHaveLength(1)
    expect(state.clock.day).toBe(1)
  })

  it('midgame has an express shaft, a skylobby, and occupied units after 3 days', () => {
    const state = buildScenario('midgame', 1)
    expect(state.shafts.some((s) => s.kind === 'express')).toBe(true)
    expect(state.units.some((u) => u.kind === 'skylobby')).toBe(true)
    expect(state.units.some((u) => u.occupied)).toBe(true)
    expect(state.clock.day).toBeGreaterThanOrEqual(4)
  })

  it('endgame spans ~40 floors with a basement stub', () => {
    const state = buildScenario('endgame', 1)
    const floors = new Set(state.units.map((u) => u.floor))
    expect(Math.max(...floors)).toBeGreaterThanOrEqual(29)
    expect(Math.min(...floors)).toBeLessThan(0)
    expect(state.shafts.length).toBeGreaterThanOrEqual(3)
  })

  it('fullCar stages a capacity-limited standard elevator through real boarding', () => {
    const state = buildScenario('fullCar', 1)
    const car = state.shafts[0]?.cars[0]
    expect(car?.passengerIds).toHaveLength(20)
  })

  it('damage stages explosion and fire rows for disaster-art captures', () => {
    const state = buildScenario('damage', 1)
    expect(state.units.some((unit) => unit.offline && unit.damageKind === 'explosion' && unit.width > 1)).toBe(true)
    expect(state.units.some((unit) => unit.offline && unit.damageKind === 'fire' && unit.width > 1)).toBe(true)
  })

  it('fire stages a deterministic in-progress security dispatch capture', () => {
    const state = buildScenario('fire', 1)
    expect(state.activeFire).toMatchObject({ floor: 2, spreadRemainingMin: 7, responseRemainingMin: 12 })
    expect(state.activeFire?.burningUnitIds).toHaveLength(2)
  })
})
