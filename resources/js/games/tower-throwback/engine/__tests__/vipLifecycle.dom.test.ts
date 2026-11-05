import { loadSandbox, restoreSandbox, saveSandbox } from '../../gameProgress'
import type { EngineEvent, EngineState, Unit, VipRecord } from '../../gameTypes'
import { stepEngine } from '../engine'
import { restoreHotelRuntime, stepHotelMinute } from '../hotel'
import { repairUnit, respondToFire } from '../incidents'
import { stepPeople } from '../people'
import { snapshotVipRuntime, stepVipMinute, stepVips, vipWeeklyPass } from '../vip'
import { injectUnit, makeTestState, place, placeSlabRow } from './testState'

function drive(state: EngineState, events: EngineEvent[], done: () => boolean, limit = 4000): void {
  for (let i = 0; i < limit && !done(); i++) {
    state.clock.minute++
    if (state.clock.minute === 1440) {
      state.clock.minute = 0
      state.clock.day++
    }
    stepHotelMinute(state, state.clock.minute)
    stepVipMinute(state, state.clock.minute, events)
    stepPeople(state, 1, events)
  }
  expect(done()).toBe(true)
}

function resume(state: EngineState): EngineState {
  expect(saveSandbox(state, 'slot-a')).toEqual({ ok: true })
  const saved = loadSandbox('slot-a')
  if (!saved) throw new Error('Expected VIP lifecycle save')
  return restoreSandbox(saved)
}

function suiteArrival(floor = 0) {
  const state = makeTestState({ star: 3, maxStarReached: 3 })
  placeSlabRow(state, 0, 0, 100)
  const connector = floor === 0 ? null : (() => {
    placeSlabRow(state, 1, 0, 100)
    return place(state, 'stairs', 0, 80)
  })()
  injectUnit(state, { kind: 'officeS', floor: 0, x: 5, width: 6, storeys: 1, occupied: true,
    population: { low: 5000, med: 0, high: 0, vip: 0 } })
  const reception = injectUnit(state, { kind: 'hotelReception', floor: 0, x: 20, width: 10, storeys: 1 })
  const suite = injectUnit(state, { kind: 'hotelSuite', floor, x: 40, width: 10, storeys: 1 })
  const events: EngineEvent[] = []
  stepVips(state, events)
  // Start just before the scheduled arrival with a prepared clean suite.
  state.clock = { day: 2, minute: 10 * 60 - 1 }
  drive(state, events, () => events.some((event) => event.type === 'vipArrived'))
  expect(suite.occupied).toBe(false)
  return { state, suite, reception, connector, events }
}

function finish(state: EngineState): EngineEvent[] {
  const events: EngineEvent[] = []
  drive(state, events, () => events.some((event) => event.type === 'vipResult'))
  return events
}

afterEach(() => { window.localStorage.clear() })

describe('live VIP destinations and suite ownership', () => {
  it.each(['offline', 'infested', 'demolished', 'reception-offline', 'reception-demolished', 'occupied', 'vip-occupied'] as const)(
    'rejects a suite that becomes %s during travel, including saved continuation', (condition) => {
      const { state, suite, reception } = suiteArrival()
      if (condition === 'offline') suite.offline = true
      else if (condition === 'infested') suite.infested = true
      else if (condition === 'reception-offline') reception.offline = true
      else if (condition === 'occupied' || condition === 'vip-occupied') {
        suite.occupied = true
        if (condition === 'occupied') suite.population.med = 2
        else suite.population.vip = 1
      } else stepEngine(state, [{ type: 'demolishUnit', unitId: condition === 'demolished' ? suite.id : reception.id }], 0)
      const resumed = resume(state)
      const before = { ...suite, population: { ...suite.population }, flags: { ...suite.flags } }
      const rng = state.rng.state()
      expect(finish(state)).toEqual(finish(resumed))
      expect(state.vips[0]?.state).toBe('pending')
      expect(state.star).toBe(3)
      expect(suite).toEqual(before)
      expect(state.rng.state()).toBe(rng)
    },
  )

  it('rejects a lost route even when the vacant suite flags are stale', () => {
    const { state, suite, connector } = suiteArrival(1)
    if (connector === null) throw new Error('Expected stairs')
    stepEngine(state, [{ type: 'demolishUnit', unitId: connector }], 0)
    expect(suite.flags.noRoute).toBe(false)
    expect(finish(state)).toContainEqual(expect.objectContaining({ type: 'vipResult', success: false }))
    expect(suite.occupied).toBe(false)
  })

  it.each(['fire', 'reception', 'replacement'] as const)('fails a checked-in stay after %s without clearing replacement guests', (condition) => {
    const { state, suite, reception, events } = suiteArrival()
    drive(state, events, () => suite.population.vip === 1)
    if (condition === 'fire') burn(state, suite)
    else if (condition === 'reception') reception.offline = true
    else {
      suite.population = { low: 0, med: 2, high: 0, vip: 0 }
    }
    const resumed = resume(state)
    expect(finish(state)).toEqual(finish(resumed))
    expect(state.star).toBe(3)
    expect(suite.population).toEqual({ low: 0, med: condition === 'replacement' ? 2 : 0, high: 0, vip: 0 })
    expect(suite.occupied).toBe(condition === 'replacement')
  })

  it('does not award a cached bonus for an amenity removed before arrival', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 100)
    injectUnit(state, { kind: 'officeS', floor: 0, x: 10, width: 6, storeys: 1, occupied: true,
      population: { low: 300, med: 0, high: 0, vip: 0 } })
    const fitness = injectUnit(state, { kind: 'fitness', floor: 0, x: 70, width: 12, storeys: 1, occupied: true })
    const events: EngineEvent[] = []
    stepVips(state, events)
    drive(state, events, () => snapshotVipRuntime(state).visit?.stopIndex === 1)
    stepEngine(state, [{ type: 'demolishUnit', unitId: fitness.id }], 0)
    const result = finish(state).find((event) => event.type === 'vipResult')
    expect(result).toMatchObject({ success: false, score: 100 })
  })

  it('keeps healthy overnight ownership and checkout identical across resume', () => {
    const { state, suite, events } = suiteArrival()
    drive(state, events, () => suite.population.vip === 1)
    const resumed = resume(state)
    expect(finish(state)).toEqual(finish(resumed))
    expect(state.star).toBe(4)
    expect(suite).toMatchObject({ occupied: false, dirty: true, population: { vip: 0 } })
  })

  it('ignores an ordinary checkout already queued in a legacy overnight save', () => {
    const { state, suite, events } = suiteArrival()
    drive(state, events, () => suite.population.vip === 1)
    state.clock = { day: state.clock.day + 1, minute: 7 * 60 + 30 }
    restoreHotelRuntime(state, { pending: [[state.clock.minute + 1, [{ roomId: suite.id, tier: 'vip', direction: 'out' }]]] })
    const resumed = resume(state)
    expect(finish(state)).toEqual(finish(resumed))
    expect(state.star).toBe(4)
  })
})

function burn(state: EngineState, unit: Unit): void {
  state.activeFire = { kind: 'fire', floor: unit.floor, burningUnitIds: [unit.id], spreadRemainingMin: 15, responseRemainingMin: 999 }
  respondToFire(state, 'dispatch', [])
}

function resident() {
  const state = makeTestState({ star: 2, maxStarReached: 2 })
  placeSlabRow(state, 0, 0, 80)
  const home = injectUnit(state, { kind: 'aptStudio', floor: 0, x: 10, width: 4, storeys: 1,
    occupied: true, population: { low: 0, med: 0, high: 0, vip: 1 }, evalScore: 90 })
  const record: VipRecord = { target: 2, state: 'resident', satisfaction: 80, unitId: home.id, cooldownUntilDay: null, lastReport: [] }
  state.vips.push(record)
  return { state, home, record }
}

describe('evacuated VIP residents', () => {
  it('defers an evacuated resident without weekly reward or star loss, then returns after repair', () => {
    const { state, home, record } = resident()
    burn(state, home)
    expect(record).toMatchObject({ state: 'resident', unitId: null, satisfaction: 80 })
    vipWeeklyPass(state, [])
    stepVips(state, [])
    expect(record.unitId).toBeNull()
    expect(record.satisfaction).toBe(80)
    expect(state.star).toBe(2)
    const resumed = resume(state)
    for (const candidate of [state, resumed]) {
      repairUnit(candidate, home.id, [])
      const events: EngineEvent[] = []
      stepVips(candidate, events)
      expect(candidate.vips[0]?.unitId).toBe(home.id)
      expect(events).toContainEqual({ type: 'vipMovedIn', target: 2, unitId: home.id })
    }
    expect(resume(state).vips).toEqual(resume(resumed).vips)
  })

  it('moves into an available replacement at the next daily pass', () => {
    const { state, home, record } = resident()
    const replacement = injectUnit(state, { kind: 'aptStudio', floor: 0, x: 30, width: 4, storeys: 1, evalScore: 70 })
    burn(state, home)
    stepVips(state, [])
    expect(record.unitId).toBe(replacement.id)
    expect(replacement.population.vip).toBe(1)
    expect(home.occupied).toBe(false)
  })

  it.each(['daily', 'weekly'] as const)('reconciles legacy stale ownership in the %s pass and preserves replacement tenants', (pass) => {
    const { state, home, record } = resident()
    home.population = { low: 0, med: 2, high: 0, vip: 0 }
    record.satisfaction = 35
    const resumed = resume(state)
    for (const candidate of [state, resumed]) {
      if (pass === 'daily') stepVips(candidate, [])
      else vipWeeklyPass(candidate, [])
      expect(candidate.vips[0]).toMatchObject({ state: 'resident', unitId: null, satisfaction: 35 })
      expect(candidate.units.find((unit) => unit.id === home.id)).toMatchObject({ occupied: true, population: { med: 2, vip: 0 } })
      expect(candidate.star).toBe(2)
    }
  })
})
