import type { EngineCommand, EngineEvent, EngineState } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { stepEngine } from '../engine'
import { spawnPerson } from '../people'
import { injectUnit, makeTestState, placeShaft, placeSlabRow, setStars } from './testState'

function run(state: EngineState, command: EngineCommand): EngineEvent[] {
  return stepEngine(state, [command], 0)
}

function tower(topFloor = 10): EngineState {
  const state = makeTestState()
  for (let floor = 0; floor <= topFloor; floor += 1) {
    placeSlabRow(state, floor, 0, 30)
  }
  return state
}

describe('resizeShaft', () => {
  it('extends upward, downward, and both ways at the per-floor cost while preserving enabled stops', () => {
    const upward = tower()
    const upwardId = placeShaft(upward, 'standard', 10, 0, 2)
    const upwardShaft = upward.shafts[0]!
    upwardShaft.enabledStops = [0, 2]
    const upwardFunds = upward.funds
    run(upward, { type: 'resizeShaft', shaftId: upwardId, bottomFloor: 0, topFloor: 5 })
    expect(upwardShaft.topFloor).toBe(5)
    expect(upwardShaft.stops).toEqual([0, 1, 2, 3, 4, 5])
    expect(upwardShaft.enabledStops).toEqual([0, 2])
    expect(upward.funds).toBe(upwardFunds - 3 * 5000)

    const downward = tower()
    setStars(downward, 3, 3)
    placeSlabRow(downward, -1, 0, 30)
    placeSlabRow(downward, -2, 0, 30)
    const downwardId = placeShaft(downward, 'standard', 10, 0, 2)
    const downwardFunds = downward.funds
    run(downward, { type: 'resizeShaft', shaftId: downwardId, bottomFloor: -2, topFloor: 2 })
    expect(downward.shafts[0]).toMatchObject({ bottomFloor: -2, topFloor: 2 })
    expect(downward.funds).toBe(downwardFunds - 2 * 5000)

    const both = tower()
    setStars(both, 3, 3)
    placeSlabRow(both, -1, 0, 30)
    const bothId = placeShaft(both, 'standard', 10, 0, 2)
    run(both, { type: 'resizeShaft', shaftId: bothId, bottomFloor: -1, topFloor: 4 })
    expect(both.shafts[0]).toMatchObject({ bottomFloor: -1, topFloor: 4 })
  })

  it('contracts with demolition-rate refunds, trims stops, and clamps cars and home floors', () => {
    const state = tower()
    const shaftId = placeShaft(state, 'standard', 10, 0, 5)
    const shaft = state.shafts[0]!
    shaft.cars[0]!.y = 5
    shaft.cars[0]!.homeFloor = 5
    const fundsBefore = state.funds

    run(state, { type: 'resizeShaft', shaftId, bottomFloor: 1, topFloor: 3 })

    expect(shaft.stops).toEqual([1, 2, 3])
    expect(shaft.enabledStops).toEqual([1, 2, 3])
    expect(shaft.cars[0]).toMatchObject({ y: 3, homeFloor: null })
    expect(state.funds).toBe(fundsBefore + Math.round(3 * 5000 * TUNING.economy.demolitionRefundRate))
    expect(state.ledgerToday.lines['demolition.refund']).toBe(7500)
  })

  it.each([
    ['span limit', { bottomFloor: 0, topFloor: 31 }, /at most 30 floors/],
    ['map range', { bottomFloor: 0, topFloor: 100 }, /Out of bounds/],
    ['underground gate', { bottomFloor: -1, topFloor: 2 }, /unlocks at 3/],
    ['reversed span', { bottomFloor: 2, topFloor: 2 }, /at least two floors/],
  ] as const)('rejects %s without changing state', (_label, span, reason) => {
    const state = tower()
    const shaftId = placeShaft(state, 'standard', 10, 0, 2)
    const before = JSON.stringify(state.shafts[0])
    const events = run(state, { type: 'resizeShaft', shaftId, ...span })

    expect(events).toContainEqual(expect.objectContaining({ type: 'placementRejected', reason: expect.stringMatching(reason) }))
    expect(JSON.stringify(state.shafts[0])).toBe(before)
  })

  it('rejects an empty enabled-stop contraction, a blocked new floor, and an unknown shaft', () => {
    const empty = tower()
    const emptyId = placeShaft(empty, 'standard', 10, 0, 4)
    empty.shafts[0]!.enabledStops = [0]
    expect(run(empty, { type: 'resizeShaft', shaftId: emptyId, bottomFloor: 1, topFloor: 4 })).toContainEqual(
      expect.objectContaining({ type: 'placementRejected', reason: expect.stringMatching(/enabled stop/) }),
    )

    const blocked = tower()
    const blockedId = placeShaft(blocked, 'standard', 10, 0, 4)
    injectUnit(blocked, { kind: 'officeS', floor: 5, x: 10, width: 6, storeys: 1 })
    expect(run(blocked, { type: 'resizeShaft', shaftId: blockedId, bottomFloor: 0, topFloor: 5 })).toContainEqual(
      expect.objectContaining({ type: 'placementRejected', reason: 'Shaft would run through a unit' }),
    )

    expect(run(blocked, { type: 'resizeShaft', shaftId: 9999, bottomFloor: 0, topFloor: 2 })).toContainEqual(
      expect.objectContaining({ type: 'placementRejected', reason: 'No such shaft' }),
    )
  })

  it('gains a skylobby stop while keeping express stops within the max-stop invariant', () => {
    const state = tower(15)
    const shaftId = placeShaft(state, 'express', 10, 0, 5)
    const shaft = state.shafts[0]!
    injectUnit(state, { kind: 'skylobby', floor: 10, x: 0, width: 30, storeys: 1 })
    run(state, { type: 'resizeShaft', shaftId, bottomFloor: 0, topFloor: 15 })

    expect(shaft.stops).toContain(10)
    expect(shaft.stops.length).toBeLessThanOrEqual(5)
    expect(shaft.enabledStops.length).toBeLessThanOrEqual(5)
  })

  it('immediately re-plans queues and riders whose removed landings were in their route', () => {
    const state = tower()
    const resizedId = placeShaft(state, 'standard', 10, 0, 5)
    const backupId = placeShaft(state, 'standard', 20, 0, 5)
    const resized = state.shafts.find((shaft) => shaft.id === resizedId)!
    const queued = spawnPerson(state, { tier: 'med', floor: 0, x: 10, toFloor: 5, toX: 28, purpose: 'shopping' })!
    expect(queued.state).toBe('queued')

    run(state, { type: 'resizeShaft', shaftId: resizedId, bottomFloor: 1, topFloor: 5 })
    expect(queued.legs.some((leg) => leg.type === 'elevator' && leg.shaftId === backupId)).toBe(true)

    const rider = spawnPerson(state, { tier: 'med', floor: 1, x: 10, toFloor: 5, toX: 28, purpose: 'shopping' })!
    rider.state = 'riding'
    resized.cars[0]!.passengerIds.push(rider.id)
    resized.cars[0]!.y = 2.6
    const events = run(state, { type: 'resizeShaft', shaftId: resizedId, bottomFloor: 1, topFloor: 3 })

    expect(rider.state).not.toBe('riding')
    expect(rider.floor).toBe(3)
    expect(rider.legs.some((leg) => leg.type === 'elevator' && leg.shaftId === backupId)).toBe(true)
    expect(resized.stats.avgWaitGameMin).toBeGreaterThanOrEqual(0)
    expect(resized.stats.peakWaitGameMin).toBeGreaterThanOrEqual(0)
    expect(events).toEqual(expect.any(Array))
  })

  it('immediately vacates tenants severed by a contraction', () => {
    const state = tower()
    const shaftId = placeShaft(state, 'standard', 10, 0, 5)
    const office = injectUnit(state, {
      kind: 'officeS',
      floor: 5,
      x: 0,
      width: 6,
      storeys: 1,
      occupied: true,
      population: { low: 0, med: 2, high: 0, vip: 0 },
    })

    run(state, { type: 'resizeShaft', shaftId, bottomFloor: 0, topFloor: 3 })

    expect(office.occupied).toBe(false)
    expect(office.vacancyReason).toBe('noRoute')
    expect(office.flags.noRoute).toBe(true)
  })

  it('parks an unaffordable resize on the loan prompt and replays it after acceptLoan', () => {
    const state = tower()
    const shaftId = placeShaft(state, 'standard', 10, 0, 2)
    const shaft = state.shafts[0]!
    state.funds = 1000

    const events = run(state, { type: 'resizeShaft', shaftId, bottomFloor: 0, topFloor: 6 })

    expect(events).toContainEqual(expect.objectContaining({ type: 'loanPrompt' }))
    expect(shaft.topFloor).toBe(2)
    expect(state.pendingLoanCommands).toEqual([{ type: 'resizeShaft', shaftId, bottomFloor: 0, topFloor: 6 }])

    run(state, { type: 'acceptLoan', amount: state.pendingLoanPrompt!.suggested })

    expect(shaft.topFloor).toBe(6)
    expect(state.pendingLoanCommands).toEqual([])

    const declined = tower()
    const declinedId = placeShaft(declined, 'standard', 10, 0, 2)
    declined.funds = 1000
    run(declined, { type: 'resizeShaft', shaftId: declinedId, bottomFloor: 0, topFloor: 6 })
    run(declined, { type: 'declineLoan' })
    expect(declined.shafts[0]!.topFloor).toBe(2)
    expect(declined.pendingLoanCommands).toEqual([])
  })

  it('re-plans the future legs of riders in OTHER shafts that pass through a removed landing', () => {
    const craftRider = (state: EngineState, carrierId: number, resizedId: number): NonNullable<ReturnType<typeof spawnPerson>> => {
      const rider = spawnPerson(state, { tier: 'med', floor: 0, x: 20, toFloor: 0, toX: 22, purpose: 'shopping' })!
      rider.legs = [
        { type: 'elevator', fromFloor: 0, fromX: 20, toFloor: 2, toX: 20, shaftId: carrierId },
        { type: 'walk', fromFloor: 2, fromX: 20, toFloor: 2, toX: 10 },
        { type: 'elevator', fromFloor: 2, fromX: 10, toFloor: 5, toX: 10, shaftId: resizedId },
        { type: 'walk', fromFloor: 5, fromX: 10, toFloor: 5, toX: 28 },
      ]
      rider.legIndex = 0
      rider.state = 'riding'
      const carrier = state.shafts.find((shaft) => shaft.id === carrierId)!
      carrier.cars[0]!.passengerIds.push(rider.id)
      carrier.cars[0]!.y = 1.4
      return rider
    }

    const spliced = tower()
    const resizedId = placeShaft(spliced, 'standard', 10, 0, 5)
    const carrierId = placeShaft(spliced, 'standard', 20, 0, 2)
    const alternateId = placeShaft(spliced, 'standard', 25, 0, 5)
    const rider = craftRider(spliced, carrierId, resizedId)

    run(spliced, { type: 'resizeShaft', shaftId: resizedId, bottomFloor: 0, topFloor: 4 })

    expect(rider.state).toBe('riding')
    expect(rider.legs[0]).toMatchObject({ type: 'elevator', shaftId: carrierId })
    expect(rider.legs.slice(1).some((leg) => leg.type === 'elevator' && leg.shaftId === alternateId)).toBe(true)
    expect(rider.legs.some((leg) => leg.type === 'elevator' && leg.shaftId === resizedId && leg.toFloor === 5)).toBe(false)

    const stranded = tower()
    const strandedResizedId = placeShaft(stranded, 'standard', 10, 0, 5)
    const strandedCarrierId = placeShaft(stranded, 'standard', 20, 0, 2)
    const doomed = craftRider(stranded, strandedCarrierId, strandedResizedId)

    run(stranded, { type: 'resizeShaft', shaftId: strandedResizedId, bottomFloor: 0, topFloor: 4 })

    expect(stranded.people.some((person) => person.id === doomed.id)).toBe(false)
  })

  it('draws no rng and replays scripted resizes identically', () => {
    const replay = (): string => {
      const state = tower()
      const shaftId = placeShaft(state, 'standard', 10, 0, 2)
      const rngBefore = state.rng.state()
      run(state, { type: 'resizeShaft', shaftId, bottomFloor: 0, topFloor: 6 })
      run(state, { type: 'resizeShaft', shaftId, bottomFloor: 1, topFloor: 4 })
      expect(state.rng.state()).toBe(rngBefore)
      return JSON.stringify({ funds: state.funds, ledger: state.ledgerToday, shaft: state.shafts[0] })
    }

    expect(replay()).toBe(replay())
  })
})
