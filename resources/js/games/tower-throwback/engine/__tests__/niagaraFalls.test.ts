/**
 * Niagara Falls map rules.
 *
 * The map builds BOTH ways from a clifftop lobby — 15 storeys up, 30 down the
 * falls face — so it is structurally the same shape as CITY_TOWER with
 * different bounds, not a `buildDirection: 'down'` map. What makes it different
 * is `excavationBelowAnchor: false`: the gorge is ordinary building, not digging.
 */
import { EXCAVATION_COST, isItemAvailable, itemDef } from '../catalog'
import { isBelowAnchor, isExcavated, isOnBuildSide } from '../mapGeometry'
import { CITY_TOWER, getMap, NIAGARA_FALLS } from '../maps'
import { validatePlacement } from '../placement'
import { findRoute } from '../routing'
import { makeTestState, place, placeShaft, placeSlabRow, setStars } from './testState'

function fallsState(star: 1 | 2 | 3 | 4 | 5 = 1) {
  const state = makeTestState({ mapId: NIAGARA_FALLS.id })
  setStars(state, star, star)
  return state
}

function reason(state: ReturnType<typeof fallsState>, cmd: Parameters<typeof validatePlacement>[1]): string {
  const result = validatePlacement(state, cmd)
  return result.ok ? '' : result.reason
}

describe('Niagara Falls — shape', () => {
  it('is registered and reachable', () => {
    expect(getMap('niagara-falls')).toBe(NIAGARA_FALLS)
    expect(NIAGARA_FALLS.name).toBe('Niagara Falls')
  })

  it('spans 15 up and 30 down from the clifftop lobby', () => {
    expect(NIAGARA_FALLS.lobbyAnchorFloor).toBe(0)
    expect(NIAGARA_FALLS.floorRange).toEqual({ min: -30, max: 15 })
  })

  it('builds up, not down — the axis never inverts', () => {
    // The map is bidirectional from the anchor, exactly like CITY_TOWER. Marking
    // it 'down' would invert labels, camera, and support rules for no reason.
    expect(NIAGARA_FALLS.buildDirection).toBe('up')
  })

  it('has no subway', () => {
    expect(NIAGARA_FALLS.disallowedItems).toContain('subway')
    expect(isItemAvailable('subway', 5, NIAGARA_FALLS)).toBe(false)
    expect(NIAGARA_FALLS.spawnSources.some((s) => s.type === 'subway')).toBe(false)
    expect(NIAGARA_FALLS.disallowedItems).toContain('cathedral')
    expect(NIAGARA_FALLS.endgameItem).toBe('observationDeck')
    expect(CITY_TOWER.disallowedItems).toContain('observationDeck')
    expect(CITY_TOWER.endgameItem).toBe('cathedral')
  })

  it('draws no rng for spawn source selection, having no subway', () => {
    // `spawnSource` only rolls when a subway source exists AND a subway is
    // built. Omitting the source keeps the falls map rng-neutral by
    // construction — a property to preserve, not a coincidence.
    expect(NIAGARA_FALLS.spawnSources).toEqual([{ type: 'street', share: 1 }])
  })
})

describe('Niagara Falls — the gorge is not excavation', () => {
  it('treats floors below the clifftop as ordinary building', () => {
    for (const floor of [-1, -15, -30]) {
      expect(isBelowAnchor(NIAGARA_FALLS, floor)).toBe(true)
      expect(isExcavated(NIAGARA_FALLS, floor)).toBe(false)
      expect(isOnBuildSide(NIAGARA_FALLS, floor)).toBe(true)
    }
  })

  it('lets ordinary tenants occupy the gorge at 1★', () => {
    // The whole identity of the map. Under city rules every one of these floors
    // would be locked until 3★.
    const state = fallsState(1)
    placeSlabRow(state, 0, 0, 20)
    placeSlabRow(state, -1, 0, 20)

    expect(validatePlacement(state, { type: 'place', kind: 'officeS', floor: -1, x: 0 }).ok).toBe(true)
  })

  it('does not charge excavation rates in the gorge', () => {
    const state = fallsState(1)
    placeSlabRow(state, 0, 0, 20)
    const result = validatePlacement(state, { type: 'place', kind: 'slab', floor: -1, x: 0, widthTiles: 4 })

    expect(result.ok).toBe(true)
    expect(result.ok && result.cost).toBe(itemDef('slab').cost * 4)
    expect(result.ok && result.cost).not.toBe(EXCAVATION_COST * 4)
  })

  it('still keeps CITY_TOWER on excavation economics', () => {
    // The flag is opt-out; the city lot is unchanged.
    expect(isExcavated(CITY_TOWER, -1)).toBe(true)
    expect(isOnBuildSide(CITY_TOWER, -1)).toBe(false)
  })
})

describe('Niagara Falls — bounds', () => {
  it('rejects building above the 15th storey', () => {
    const state = fallsState(5)
    for (let f = 0; f <= 15; f++) {
      placeSlabRow(state, f, 0, 20)
    }
    expect(reason(state, { type: 'place', kind: 'slab', floor: 16, x: 0, widthTiles: 4 })).toBe('Out of bounds')
  })

  it('rejects building below the gorge floor', () => {
    const state = fallsState(5)
    placeSlabRow(state, 0, 0, 20)
    for (let f = -1; f >= -30; f--) {
      placeSlabRow(state, f, 0, 20)
    }
    expect(reason(state, { type: 'place', kind: 'slab', floor: -31, x: 0, widthTiles: 4 })).toBe('Out of bounds')
  })
})

describe('Niagara Falls — Observation Deck', () => {
  function deckSite(floor: -30 | 15, bank: 'left' | 'right'): ReturnType<typeof fallsState> {
    const state = fallsState(5)
    const [x0, x1] = bank === 'left' ? [0, 188] : [277, 374]
    const step = floor < 0 ? -1 : 1
    for (let current = 0; current !== floor + step; current += step) {
      placeSlabRow(state, current, x0, x1)
    }
    placeShaft(state, 'standard', bank === 'left' ? 168 : 295, Math.min(0, floor), Math.max(0, floor))
    return state
  }

  it.each([
    { floor: 15 as const, bank: 'left' as const, x: 171, facing: 'right' as const },
    { floor: 15 as const, bank: 'right' as const, x: 271, facing: 'left' as const },
    { floor: -30 as const, bank: 'left' as const, x: 171, facing: 'right' as const },
    { floor: -30 as const, bank: 'right' as const, x: 271, facing: 'left' as const },
  ])('places at floor $floor on the $bank bank and faces the falls', ({ floor, bank, x, facing }) => {
    const state = deckSite(floor, bank)
    const id = place(state, 'observationDeck', floor, x)
    expect(state.units.find((unit) => unit.id === id)?.facing).toBe(facing)
  })

  it('requires the cantilever to align exactly with the waterfall gap', () => {
    const state = deckSite(15, 'left')
    expect(reason(state, { type: 'place', kind: 'observationDeck', floor: 15, x: 170 })).toMatch(/cantilever toward/i)
    expect(reason(state, { type: 'place', kind: 'observationDeck', floor: 15, x: 172 })).toMatch(/cantilever toward/i)
  })

  it('rejects the wrong floor, a partial rating, and a second deck', () => {
    const state = deckSite(15, 'left')
    expect(reason(state, { type: 'place', kind: 'observationDeck', floor: 14, x: 171 })).toMatch(/B30.*15/)

    setStars(state, 4, 5)
    expect(reason(state, { type: 'place', kind: 'observationDeck', floor: 15, x: 171 })).toMatch(/full 5★/)

    setStars(state, 5, 5)
    state.units.push({
      ...state.units[0]!,
      id: state.nextId++,
      kind: 'observationDeck',
      floor: 15,
      x: 171,
      width: 24,
      storeys: 2,
      facing: 'right',
    })
    expect(reason(state, { type: 'place', kind: 'observationDeck', floor: -30, x: 171 })).toMatch(/one observation deck/i)
  })
})

describe('Niagara Falls — waterfall construction gap', () => {
  it('allows lobby and below-lobby hotel construction on either bank', () => {
    const left = fallsState(3)
    expect(validatePlacement(left, { type: 'place', kind: 'lobby', floor: 0, x: 20, widthTiles: 40 }).ok).toBe(true)
    placeSlabRow(left, 0, 0, 100)
    placeSlabRow(left, -1, 0, 100)
    expect(validatePlacement(left, { type: 'place', kind: 'hotel1p', floor: -1, x: 20 }).ok).toBe(true)

    const right = fallsState(3)
    expect(validatePlacement(right, { type: 'place', kind: 'lobby', floor: 0, x: 300, widthTiles: 40 }).ok).toBe(true)
    placeSlabRow(right, 0, 277, 374)
    placeSlabRow(right, -1, 277, 374)
    expect(validatePlacement(right, { type: 'place', kind: 'hotel1p', floor: -1, x: 300 }).ok).toBe(true)
  })

  it('rejects ordinary construction in the gap while leaving New York unchanged', () => {
    const state = fallsState(5)
    expect(reason(state, { type: 'place', kind: 'lobby', floor: 0, x: 180, widthTiles: 20 })).toMatch(/Waterfall gap.*Skybridge/)
    expect(reason(state, { type: 'place', kind: 'slab', floor: 0, x: 200, widthTiles: 4 })).toMatch(/Waterfall gap.*Skybridge/)
    expect(reason(state, { type: 'place', kind: 'hotel1p', floor: 0, x: 200 })).toMatch(/Waterfall gap.*Skybridge/)
    expect(reason(state, { type: 'placeShaft', kind: 'standard', x: 200, bottomFloor: 0, topFloor: 2 })).toMatch(/Waterfall gap.*Skybridge/)

    const city = makeTestState()
    expect(validatePlacement(city, { type: 'place', kind: 'slab', floor: 0, x: 189, widthTiles: 88 }).ok).toBe(true)
  })

  it('permits only a fully anchored Skybridge and connects routing across the falls', () => {
    const state = fallsState(5)
    placeSlabRow(state, 0, 180, 188)
    placeSlabRow(state, 0, 277, 285)
    expect(findRoute(state, 0, 188, 0, 277)).toBeNull()
    expect(reason(state, { type: 'place', kind: 'skybridge', floor: 0, x: 190, widthTiles: 87 })).toMatch(/Waterfall gap/)

    const unsupported = fallsState(5)
    expect(reason(unsupported, { type: 'place', kind: 'skybridge', floor: 0, x: 189, widthTiles: 88 })).toMatch(/connect a structure at each end/)

    place(state, 'skybridge', 0, 189, 88)
    expect(findRoute(state, 0, 188, 0, 277)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'walk' }),
    ]))
  })
})

describe('Niagara Falls — underground-only items', () => {
  it('still places parking below the clifftop', () => {
    // These are `undergroundOnly`, which is GEOMETRIC. Had that check been
    // folded into the excavation flag, they would have had nowhere legal to go
    // on this map and failed with a message that made no sense.
    const state = fallsState(5)
    placeSlabRow(state, 0, 0, 20)
    placeSlabRow(state, -1, 0, 20)

    expect(validatePlacement(state, { type: 'place', kind: 'parkingRamp', floor: -1, x: 0 }).ok).toBe(true)
  })

  it('rejects parking above the clifftop', () => {
    const state = fallsState(5)
    placeSlabRow(state, 0, 0, 20)
    placeSlabRow(state, 1, 0, 20)

    expect(reason(state, { type: 'place', kind: 'parkingRamp', floor: 1, x: 0 })).toMatch(/underground/)
  })
})
