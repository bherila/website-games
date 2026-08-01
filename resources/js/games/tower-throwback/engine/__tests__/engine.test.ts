import type { EngineCommand, EngineEvent, EngineState, ItemKind, Person } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { buildHudSnapshot, createEngineState, stepEngine } from '../engine'

function newState(seed = 1): EngineState {
  return createEngineState({ seed, mapId: 'city-tower', lobbyHeight: 1 })
}

function run(state: EngineState, commands: EngineCommand[]): EngineEvent[] {
  return stepEngine(state, commands, 0)
}

/** Advance in small real-time steps until the given game day+minute is reached. */
function advanceTo(state: EngineState, day: number, minute: number): EngineEvent[] {
  const events: EngineEvent[] = []
  let guard = 0
  while (state.clock.day < day || (state.clock.day === day && state.clock.minute < minute)) {
    events.push(...stepEngine(state, [], 5))
    if (++guard > 100_000) {
      throw new Error('advanceTo never reached target')
    }
  }
  return events
}

function place(kind: ItemKind, floor: number, x: number, widthTiles?: number): EngineCommand {
  return widthTiles === undefined ? { type: 'place', kind, floor, x } : { type: 'place', kind, floor, x, widthTiles }
}

function makePerson(id: number): Person {
  return {
    id,
    tier: 'low',
    vip: false,
    state: 'walking',
    floor: 0,
    x: 0,
    patienceLeft: 60,
    irritated: false,
    legs: [],
    legIndex: 0,
    purpose: 'commuteIn',
    tenantUnitId: null,
    destUnitId: null,
  }
}

describe('createEngineState', () => {
  test('fresh state matches the contract defaults', () => {
    const state = newState()
    expect(state.funds).toBe(TUNING.economy.startingFunds)
    expect(state.clock).toEqual({ day: 1, minute: 7 * 60 })
    expect(state.star).toBe(1)
    expect(state.milestonesEarned).toEqual(['started'])
    expect(state.pendingLoanPrompt).toBeNull()
  })

  test('HUD snapshot reports active people cap pressure without mutating state', () => {
    const state = newState()
    state.people = Array.from({ length: TUNING.people.maxActive - 1 }, (_, index) => makePerson(index + 1))
    const rngBefore = state.rng.state()

    expect(buildHudSnapshot(state).peopleCap).toEqual({
      active: TUNING.people.maxActive - 1,
      max: TUNING.people.maxActive,
      atCap: false,
    })
    expect(buildHudSnapshot(state).trafficUnderstated).toBe(false)
    expect(state.rng.state()).toBe(rngBefore)

    state.people.push(makePerson(TUNING.people.maxActive))
    const capped = buildHudSnapshot(state)
    expect(capped.peopleCap).toEqual({
      active: TUNING.people.maxActive,
      max: TUNING.people.maxActive,
      atCap: true,
    })
    expect(capped.trafficUnderstated).toBe(true)
    expect(state.rng.state()).toBe(rngBefore)
  })
})

describe('command dispatch', () => {
  test('placement deducts funds and accrues construction', () => {
    const state = newState()
    const events = run(state, [place('slab', 0, 10, 10)])
    expect(events).toContainEqual(expect.objectContaining({ type: 'placed', kind: 'slab', cost: 500 }))
    expect(state.funds).toBe(TUNING.economy.startingFunds - 500)
    expect(state.ledgerToday.lines.construction).toBe(-500)
  })

  test('rejected placement leaves funds untouched', () => {
    const state = newState()
    const events = run(state, [place('officeS', 5, 10)])
    expect(events[0]).toEqual(expect.objectContaining({ type: 'placementRejected' }))
    expect(state.funds).toBe(TUNING.economy.startingFunds)
  })

  test('unaffordable placement prompts a loan; accepting unblocks the retry', () => {
    const state = newState()
    state.funds = 100
    const cmd = place('slab', 0, 10, 10)
    const events = run(state, [cmd])
    expect(events).toContainEqual(expect.objectContaining({ type: 'loanPrompt' }))
    expect(events).toContainEqual(expect.objectContaining({ type: 'placementRejected', kind: 'slab', reason: 'Insufficient funds' }))
    expect(state.funds).toBe(100)
    expect(state.units).toHaveLength(0)

    const after = run(state, [{ type: 'acceptLoan', amount: TUNING.economy.loanIncrement }, cmd])
    expect(after).toContainEqual(expect.objectContaining({ type: 'loanTaken', amount: TUNING.economy.loanIncrement }))
    expect(after).toContainEqual(expect.objectContaining({ type: 'placed', kind: 'slab' }))
    expect(state.loans).toHaveLength(1)
    expect(state.funds).toBe(100 + TUNING.economy.loanIncrement - 500)
  })

  test('bulk placement queues all valid remaining cells and resumes after an aggregate loan', () => {
    const state = newState()
    state.funds = 5 * 50
    const commands = Array.from({ length: 20 }, (_, index) => place('slab', 0, index))

    const events = run(state, commands)

    expect(state.units).toHaveLength(5)
    expect(state.pendingLoanCommands).toHaveLength(15)
    expect(state.pendingLoanPrompt).toEqual({ shortfall: 750, suggested: 100_000 })
    expect(events.filter((event) => event.type === 'loanPrompt')).toEqual([
      { type: 'loanPrompt', shortfall: 750, suggested: 100_000 },
    ])

    const resumed = run(state, [{ type: 'acceptLoan', amount: TUNING.economy.loanIncrement }])

    expect(resumed).toContainEqual({ type: 'loanTaken', amount: TUNING.economy.loanIncrement })
    expect(resumed.filter((event) => event.type === 'placed')).toHaveLength(15)
    expect(state.units).toHaveLength(20)
    expect(state.pendingLoanCommands).toEqual([])
    expect(state.pendingLoanPrompt).toBeNull()
    expect(state.funds).toBe(99_250)
  })

  test('midnight settlement merges into a pending bulk loan without detaching its commands', () => {
    const state = newState()
    run(state, [place('lobby', 0, 0, 30)])
    state.funds = 100
    state.clock.minute = 23 * 60 + 59
    const commands = Array.from({ length: 20 }, (_, index) => place('slab', 1, index))

    const events = stepEngine(state, commands, 1)

    expect(state.clock.day).toBe(2)
    expect(state.pendingLoanCommands).toHaveLength(18)
    expect(state.pendingLoanPrompt).toEqual({ shortfall: 1_050, suggested: 100_000 })
    expect(events.filter((event) => event.type === 'loanPrompt')).toEqual([
      { type: 'loanPrompt', shortfall: 900, suggested: 100_000 },
      { type: 'loanPrompt', shortfall: 1_050, suggested: 100_000 },
    ])

    const resumed = run(state, [{ type: 'acceptLoan', amount: 100_000 }])

    expect(resumed.filter((event) => event.type === 'placed')).toHaveLength(18)
    expect(state.pendingLoanCommands).toEqual([])
    expect(state.pendingLoanPrompt).toBeNull()
  })

  test('bulk loan planning sees the existing tower (support-dependent cells stay in the plan)', () => {
    const state = newState()
    run(state, [place('slab', 0, 0, 30)])
    state.funds = 20_000 // exactly one officeS

    const events = run(state, [place('officeS', 0, 0), place('officeS', 0, 6), place('officeS', 0, 12)])

    // Regression: the planning clone must repaint its grid from the cloned
    // units — with empty layers the two offices "lack slab support", drop out
    // of the plan, and the loan degrades to the single-item fallback.
    expect(events.filter((event) => event.type === 'placed')).toHaveLength(1)
    expect(state.pendingLoanCommands).toHaveLength(2)
    expect(state.pendingLoanPrompt).toEqual({ shortfall: 40_000, suggested: 100_000 })

    const resumed = run(state, [{ type: 'acceptLoan', amount: 100_000 }])

    expect(resumed.filter((event) => event.type === 'placed')).toHaveLength(2)
    expect(state.units.filter((unit) => unit.kind === 'officeS')).toHaveLength(3)
    expect(state.pendingLoanCommands).toEqual([])
    expect(state.funds).toBe(60_000)
  })

  test('demolition refunds through the ledger', () => {
    const state = newState()
    run(state, [place('slab', 0, 10, 10)])
    const unitId = state.units[0]?.id ?? -1
    const events = run(state, [{ type: 'demolishUnit', unitId }])
    expect(events).toContainEqual(expect.objectContaining({ type: 'demolished', refund: 250 }))
    expect(state.funds).toBe(TUNING.economy.startingFunds - 500 + 250)
    expect(state.ledgerToday.lines['demolition.refund']).toBe(250)
  })

  test('addCar respects the per-shaft car cap', () => {
    const state = newState()
    run(state, [place('lobby', 0, 0, 30), { type: 'placeShaft', kind: 'standard', x: 4, bottomFloor: 0, topFloor: 1 }])
    const shaft = state.shafts[0]
    if (!shaft) {
      throw new Error('shaft placement failed')
    }
    for (let i = 0; i < 5; i++) {
      run(state, [{ type: 'addCar', shaftId: shaft.id }])
    }
    expect(shaft.cars).toHaveLength(6)
    const rejected = run(state, [{ type: 'addCar', shaftId: shaft.id }])
    expect(rejected).toContainEqual(expect.objectContaining({ type: 'placementRejected' }))
    expect(shaft.cars).toHaveLength(6)
  })

  test('setStopEnabled emits placementRejected for invalid stop toggles', () => {
    const state = newState()
    run(state, [place('lobby', 0, 0, 30), { type: 'placeShaft', kind: 'standard', x: 4, bottomFloor: 0, topFloor: 1 }])
    const shaft = state.shafts[0]
    if (!shaft) {
      throw new Error('shaft placement failed')
    }

    const versionBefore = state.structureVersion
    expect(run(state, [{ type: 'setStopEnabled', shaftId: shaft.id, floor: 2, enabled: true }])).toContainEqual(
      expect.objectContaining({
        type: 'placementRejected',
        kind: 'standard',
        reason: 'That floor is not a landing for this elevator',
      }),
    )

    shaft.enabledStops = [0]
    expect(run(state, [{ type: 'setStopEnabled', shaftId: shaft.id, floor: 0, enabled: false }])).toContainEqual(
      expect.objectContaining({
        type: 'placementRejected',
        kind: 'standard',
        reason: 'An elevator must keep at least one enabled stop',
      }),
    )

    shaft.kind = 'express'
    shaft.stops = [0, 1, 2, 3, 4, 5]
    shaft.enabledStops = [0, 1, 2, 3, 4]
    expect(run(state, [{ type: 'setStopEnabled', shaftId: shaft.id, floor: 5, enabled: true }])).toContainEqual(
      expect.objectContaining({
        type: 'placementRejected',
        kind: 'express',
        reason: 'Express Elevator can have at most 5 enabled stops',
      }),
    )
    expect(state.structureVersion).toBe(versionBefore)
  })

  test('disabling a stop clears matching car home floors', () => {
    const state = newState()
    run(state, [
      place('lobby', 0, 0, 30),
      place('slab', 1, 0, 30),
      place('slab', 2, 0, 30),
      { type: 'placeShaft', kind: 'standard', x: 4, bottomFloor: 0, topFloor: 2 },
    ])
    const shaft = state.shafts[0]
    if (!shaft) {
      throw new Error('shaft placement failed')
    }
    shaft.cars[0]!.homeFloor = 2

    run(state, [{ type: 'setStopEnabled', shaftId: shaft.id, floor: 2, enabled: false }])

    expect(shaft.enabledStops).not.toContain(2)
    expect(shaft.cars[0]!.homeFloor).toBeNull()
  })

  test('route severance evicts tenants immediately', () => {
    const state = newState()
    run(state, [place('lobby', 0, 0, 30)])
    for (let f = 1; f <= 6; f++) {
      run(state, [place('slab', f, 0, 30)])
    }
    run(state, [{ type: 'placeShaft', kind: 'standard', x: 20, bottomFloor: 0, topFloor: 6 }])
    run(state, [place('officeS', 6, 2)])
    const shaft = state.shafts[0]!
    const office = state.units.find((u) => u.kind === 'officeS')!
    office.occupied = true
    office.population.med = 4

    // Disabling the only stop serving floor 6 evicts the tenant on the spot.
    const events = run(state, [{ type: 'setStopEnabled', shaftId: shaft.id, floor: 6, enabled: false }])
    expect(events).toContainEqual({
      type: 'unitVacated', unitId: office.id, unitKind: office.kind, floor: office.floor, reason: 'noRoute',
    })
    expect(office.occupied).toBe(false)
    expect(office.flags.noRoute).toBe(true)

    // Re-enabling restores leasability but does not re-lease by itself.
    run(state, [{ type: 'setStopEnabled', shaftId: shaft.id, floor: 6, enabled: true }])
    expect(office.occupied).toBe(false)
  })

  test('route severance spares tenants with an alternate stairs route and VIP homes', () => {
    const state = newState()
    run(state, [place('lobby', 0, 0, 30)])
    run(state, [place('slab', 1, 0, 30)])
    run(state, [place('slab', 2, 0, 30)])
    run(state, [{ type: 'placeShaft', kind: 'standard', x: 20, bottomFloor: 0, topFloor: 2 }])
    run(state, [place('stairs', 0, 10)]) // 0 ↔ 1
    run(state, [place('officeS', 1, 2)])
    run(state, [place('aptStudio', 2, 2)])
    const shaft = state.shafts[0]!
    const office = state.units.find((u) => u.kind === 'officeS')!
    const apt = state.units.find((u) => u.kind === 'aptStudio')!
    office.occupied = true
    office.population.med = 4
    apt.occupied = true
    apt.population.vip = 1

    run(state, [
      { type: 'setStopEnabled', shaftId: shaft.id, floor: 1, enabled: false },
      { type: 'setStopEnabled', shaftId: shaft.id, floor: 2, enabled: false },
    ])
    // Office still reaches the lobby via the stairs; the VIP home is exempt
    // even though floor 2 is now unroutable (VIP move-outs belong to the VIP system).
    expect(office.occupied).toBe(true)
    expect(apt.occupied).toBe(true)
  })

  test('demolishing the only shaft evicts stranded tenants immediately', () => {
    const state = newState()
    state.star = 3
    state.maxStarReached = 3 // hotel rooms unlock at 3★
    run(state, [place('lobby', 0, 0, 30)])
    for (let f = 1; f <= 6; f++) {
      run(state, [place('slab', f, 0, 30)])
    }
    run(state, [{ type: 'placeShaft', kind: 'standard', x: 20, bottomFloor: 0, topFloor: 6 }])
    run(state, [place('hotel1p', 6, 2)])
    const shaft = state.shafts[0]!
    const room = state.units.find((u) => u.kind === 'hotel1p')!
    room.occupied = true
    room.population.med = 1

    const events = run(state, [{ type: 'demolishShaft', shaftId: shaft.id }])
    expect(events).toContainEqual({
      type: 'unitVacated', unitId: room.id, unitKind: room.kind, floor: room.floor, reason: 'noRoute',
    })
    expect(room.occupied).toBe(false)
  })

  test('units cannot be built inside a lobby, but stairs can', () => {
    const state = newState()
    run(state, [place('lobby', 0, 0, 40)])
    const office = run(state, [place('officeS', 0, 4)])
    expect(office[0]).toEqual(
      expect.objectContaining({ type: 'placementRejected', reason: 'Can only be built on plain floor space' }),
    )
    run(state, [place('slab', 1, 0, 10)])
    const stairs = run(state, [place('stairs', 0, 20)])
    expect(stairs).toContainEqual(expect.objectContaining({ type: 'placed', kind: 'stairs' }))
  })

  test('speed 0 pauses time but still processes commands', () => {
    const state = newState()
    run(state, [{ type: 'setSpeed', speed: 0 }])
    stepEngine(state, [], 60)
    expect(state.clock).toEqual({ day: 1, minute: 7 * 60 })
    const events = stepEngine(state, [place('slab', 0, 0, 2)], 60)
    expect(events).toContainEqual(expect.objectContaining({ type: 'placed' }))
  })
})

describe('time integration', () => {
  function buildStarterTower(state: EngineState): void {
    const events = run(state, [
      place('lobby', 0, 0, 40),
      place('slab', 1, 0, 40),
      { type: 'placeShaft', kind: 'standard', x: 16, bottomFloor: 0, topFloor: 1 },
      place('officeS', 1, 0),
      place('restroom', 1, 20),
    ])
    const rejects = events.filter((e) => e.type === 'placementRejected' || e.type === 'loanPrompt')
    expect(rejects).toEqual([])
  }

  test('offices lease at the 08:00 pass and rent settles at midnight', () => {
    const state = newState()
    buildStarterTower(state)
    const morning = advanceTo(state, 1, 8 * 60 + 10)
    expect(morning).toContainEqual(expect.objectContaining({ type: 'unitLeased' }))
    const office = state.units.find((u) => u.kind === 'officeS')
    expect(office?.occupied).toBe(true)

    const overnight = advanceTo(state, 2, 10)
    const settlement = overnight.find((e) => e.type === 'settlement')
    expect(settlement).toBeDefined()
    expect(state.ledgerHistory[0]?.lines['rent.office']).toBe(400)
  })

  test('same seed and commands produce an identical event log', () => {
    const logs = [1, 2].map(() => {
      const state = newState(1234)
      buildStarterTower(state)
      const events = advanceTo(state, 3, 12 * 60)
      return JSON.stringify(events)
    })
    expect(logs[0]).toBe(logs[1])
  })
})
