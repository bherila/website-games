import type { EngineState, Person } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { stepElevators } from '../elevators'
import { spawnPerson, stepPeople } from '../people'
import { equivalentElevators, findRoute } from '../routing'
import { makeTestState, placeShaft, placeSlabRow } from './testState'

/**
 * Riders spread across interchangeable elevators by load. The route search
 * (and its segment-pair memo) used to send everyone through the lowest-id
 * shaft whenever distances tied, so a second elevator beside a jammed one
 * stayed empty and building more elevators relieved nothing.
 */

/** Lobby and floor 5 span x 0..100; two standard elevators at x 40 and x 60. */
function twinShaftTower(): { state: EngineState; left: number; right: number } {
  const state = makeTestState()
  for (let floor = 0; floor <= 5; floor += 1) {
    placeSlabRow(state, floor, 0, 100)
  }
  const left = placeShaft(state, 'standard', 40, 0, 5)
  const right = placeShaft(state, 'standard', 60, 0, 5)
  return { state, left, right }
}

function commute(state: EngineState): Person {
  // From the street at x 0 to x 100 upstairs: 100 tiles of walking via either shaft.
  return spawnPerson(state, { tier: 'med', floor: 0, x: 0, toFloor: 5, toX: 100, purpose: 'shopping' })!
}

function shaftOf(person: Person): number | undefined {
  return person.legs.find((leg) => leg.type === 'elevator')?.shaftId
}

describe('load-aware elevator choice', () => {
  it('spreads many riders over two equally good elevators', () => {
    const { state, left, right } = twinShaftTower()
    // The structural route alone still prefers the lower id for this tie.
    expect(findRoute(state, 0, 0, 5, 100)!.find((leg) => leg.type === 'elevator')!.shaftId).toBe(left)

    const riders = Array.from({ length: 40 }, () => commute(state))
    const onLeft = riders.filter((person) => shaftOf(person) === left).length
    const onRight = riders.filter((person) => shaftOf(person) === right).length
    expect(onLeft + onRight).toBe(40)
    expect(onLeft).toBe(20)
    expect(onRight).toBe(20)
    // Walks are rebuilt around the chosen column.
    const rightRider = riders.find((person) => shaftOf(person) === right)!
    expect(rightRider.legs.map((leg) => [leg.type, leg.fromX, leg.toX])).toEqual([
      ['walk', 0, 60],
      ['elevator', 60, 60],
      ['walk', 60, 100],
    ])
  })

  it('carries riders on both cars when they actually travel', () => {
    const { state, left, right } = twinShaftTower()
    for (let i = 0; i < 30; i += 1) {
      commute(state)
    }
    const boarded = new Set<number>()
    for (let t = 0; t < 120 && state.people.length > 0; t += 0.25) {
      stepElevators(state, 0.25, [])
      stepPeople(state, 0.25, [])
      for (const shaft of state.shafts) {
        if (shaft.cars.some((car) => car.passengerIds.length > 0)) {
          boarded.add(shaft.id)
        }
      }
    }
    expect([...boarded].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([left, right].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
    expect(state.people).toHaveLength(0)
  })

  it('does not detour riders past the walking allowance', () => {
    const state = makeTestState()
    for (let floor = 0; floor <= 5; floor += 1) {
      placeSlabRow(state, floor, 0, 200)
    }
    const near = placeShaft(state, 'standard', 10, 0, 5)
    const far = placeShaft(state, 'standard', 10 + TUNING.routing.loadSpreadWalkTiles, 0, 5)
    // To x 0 upstairs: the far shaft costs 2 × 60 = 120 extra tiles, past the allowance.
    const leg = findRoute(state, 0, 0, 5, 0)!.find((candidate) => candidate.type === 'elevator')!
    expect(equivalentElevators(state, leg, 0, 0).map((choice) => choice.shaftId)).toEqual([near])
    const riders = Array.from({ length: 10 }, () =>
      spawnPerson(state, { tier: 'med', floor: 0, x: 0, toFloor: 5, toX: 0, purpose: 'shopping' })!,
    )
    expect(riders.every((person) => shaftOf(person) === near)).toBe(true)
    expect(far).not.toBe(near)
  })

  it('assigns identically on a replay of the same state', () => {
    const run = (): Array<number | undefined> => {
      const { state } = twinShaftTower()
      return Array.from({ length: 25 }, () => shaftOf(commute(state)))
    }
    expect(run()).toEqual(run())
  })
})
