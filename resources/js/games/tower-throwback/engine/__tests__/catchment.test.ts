import { tileIndex } from '../grid'
import { catchmentField } from '../heatmaps'
import { makeTestState, place, placeShaft, placeSlabRow } from './testState'

// catchmentField is kind-agnostic reachability TO a target unit; TowerGame gates
// it to commerce venues. We use an office as the target here purely to avoid
// star-level placement gating.
describe('catchmentField', () => {
  it('marks floors that can route to the venue and skips isolated ones', () => {
    const state = makeTestState()
    place(state, 'lobby', 0, 100, 40) // ground landing
    placeSlabRow(state, 1, 100, 139)
    placeSlabRow(state, 2, 100, 139) // isolated: no shaft reaches it
    placeShaft(state, 'standard', 118, 0, 1) // connects floors 0 and 1 only
    const venueId = place(state, 'officeS', 1, 104)
    const venue = state.units.find((unit) => unit.id === venueId)!

    const field = catchmentField(state, venue)
    const reachable = (floor: number, x: number): boolean => (field[tileIndex(floor, x)] ?? 0) > 0

    expect(reachable(1, 104)).toBe(true) // the venue floor itself
    expect(reachable(0, 105)).toBe(true) // lobby floor routes up via the shaft
    expect(reachable(2, 105)).toBe(false) // floor 2 has no connection to the venue
  })
})
