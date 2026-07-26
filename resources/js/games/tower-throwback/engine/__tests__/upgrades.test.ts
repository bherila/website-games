import type { EngineEvent, EngineState, Unit } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { settleMidnight } from '../economy'
import { stepEngine } from '../engine'
import { generateDailyTrash, trashLoad } from '../trash'
import { applyUpgrade, validateUpgrade } from '../upgrades'
import { injectUnit, makeTestState, placeSlabRow, setStars } from './testState'

function fastfood(state: EngineState): Unit {
  placeSlabRow(state, 0, 0, 40)
  return injectUnit(state, { kind: 'fastfood', floor: 0, x: 0, width: 12, storeys: 1, occupied: true })
}

describe('validateUpgrade', () => {
  it('accepts a valid path and prices it', () => {
    const state = makeTestState()
    setStars(state, 2, 2)
    const unit = fastfood(state)
    expect(validateUpgrade(state, unit.id, 'fastfood-to-restaurant')).toEqual({ ok: true, cost: 40_000 })
  })

  it('rejects unknown paths, wrong kinds, star gates, and repeat grades', () => {
    const state = makeTestState()
    setStars(state, 2, 2)
    const unit = fastfood(state)
    expect(validateUpgrade(state, unit.id, 'nope')).toMatchObject({ ok: false, reason: 'Unknown upgrade' })
    expect(validateUpgrade(state, unit.id, 'hotel1p-to-luxury')).toMatchObject({ ok: false })
    expect(validateUpgrade(state, unit.id, 'restaurant-to-fancy')).toMatchObject({ ok: false }) // wrong kind
    expect(validateUpgrade(state, 999, 'fastfood-to-restaurant')).toMatchObject({ ok: false, reason: 'No such unit' })

    const hotel = injectUnit(state, { kind: 'hotel1p', floor: 0, x: 14, width: 4, storeys: 1 })
    expect(validateUpgrade(state, hotel.id, 'hotel1p-to-luxury')).toMatchObject({ ok: false, reason: expect.stringContaining('4★') })
    setStars(state, 4, 4)
    expect(validateUpgrade(state, hotel.id, 'hotel1p-to-luxury')).toEqual({ ok: true, cost: 30_000 })
    hotel.grade = 'luxury'
    expect(validateUpgrade(state, hotel.id, 'hotel1p-to-luxury')).toMatchObject({ ok: false, reason: 'Already upgraded' })

    const office = injectUnit(state, { kind: 'fastfood', floor: 0, x: 20, width: 12, storeys: 1, offline: true })
    expect(validateUpgrade(state, office.id, 'fastfood-to-restaurant')).toMatchObject({ ok: false, reason: 'Repair the unit first' })
  })
})

describe('applyUpgrade', () => {
  it('preserves the footprint on a kind change and bumps structureVersion', () => {
    const state = makeTestState()
    setStars(state, 2, 2)
    const unit = fastfood(state) // width 12; restaurant catalog width is 10
    const versionBefore = state.structureVersion
    const events: EngineEvent[] = []
    applyUpgrade(state, unit.id, 'fastfood-to-restaurant', events)

    expect(unit.kind).toBe('restaurant')
    expect(unit.width).toBe(12) // footprint preserved despite catalog widths differing
    expect(state.structureVersion).toBe(versionBefore + 1)
    expect(events).toContainEqual({ type: 'upgraded', unitId: unit.id, upgradeId: 'fastfood-to-restaurant', cost: 40_000 })
  })

  it('luxury grade changes the next settlement bill', () => {
    const state = makeTestState()
    setStars(state, 4, 4)
    placeSlabRow(state, 0, 0, 40)
    const room = injectUnit(state, {
      kind: 'hotel2p', floor: 0, x: 0, width: 6, storeys: 1,
      occupied: true, population: { low: 0, med: 2, high: 0, vip: 0 },
    })
    applyUpgrade(state, room.id, 'hotel2p-to-luxury', [])
    expect(room.grade).toBe('luxury')
    settleMidnight(state, [])
    // 600 × 1.0 (avg) × 1.6 = 960.
    expect(state.ledgerHistory[0]?.lines['hotel.nights']).toBe(600 * TUNING.hotel.luxuryRateFactor)
  })

  it('recycling grade feeds the trash accumulation factor', () => {
    const state = makeTestState()
    setStars(state, 4, 4)
    placeSlabRow(state, 0, 0, 40)
    const room = injectUnit(state, { kind: 'trashRoom', floor: 0, x: 20, width: 6, storeys: 1 })
    injectUnit(state, {
      kind: 'officeS', floor: 0, x: 0, width: 6, storeys: 1,
      occupied: true, population: { low: 0, med: 4, high: 0, vip: 0 },
    })
    applyUpgrade(state, room.id, 'trashroom-to-recycling', [])
    expect(room.grade).toBe('recycling')
    generateDailyTrash(state)
    expect(trashLoad(state, room.id)).toBe(4 * TUNING.trash.recyclingHaulFactor)
  })
})

describe('engine dispatch', () => {
  it('charges construction, applies, and emits through the command path', () => {
    const state = makeTestState()
    setStars(state, 2, 2)
    const unit = fastfood(state)
    const fundsBefore = state.funds
    const events = stepEngine(state, [{ type: 'applyUpgrade', unitId: unit.id, upgradeId: 'fastfood-to-restaurant' }], 0)

    expect(unit.kind).toBe('restaurant')
    expect(state.funds).toBe(fundsBefore - 40_000)
    expect(state.ledgerToday.lines.construction).toBe(-40_000)
    expect(events).toContainEqual(expect.objectContaining({ type: 'upgraded', unitId: unit.id }))
  })

  it('rejects invalid upgrades without spending', () => {
    const state = makeTestState() // 1★ — star gate fails
    const unit = fastfood(state)
    const fundsBefore = state.funds
    const events = stepEngine(state, [{ type: 'applyUpgrade', unitId: unit.id, upgradeId: 'fastfood-to-restaurant' }], 0)
    expect(unit.kind).toBe('fastfood')
    expect(state.funds).toBe(fundsBefore)
    expect(events).toContainEqual(expect.objectContaining({ type: 'placementRejected', kind: 'fastfood' }))
  })
})
