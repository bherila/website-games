import type { MapDefinition } from '../../gameTypes'
import { FLOOR_MAX, FLOOR_MIN } from '../../gameTypes'
import { isItemAvailable } from '../catalog'
import { ALL_MAPS, CITY_TOWER, getMap } from '../maps'
import { applyPlacement, validatePlacement } from '../placement'
import { makeTestState, placeSlabRow, setStars } from './testState'

describe('CITY_TOWER', () => {
  it('has the v1 shape', () => {
    // The id is the SAVE KEY and must never change; the display name is free to.
    expect(CITY_TOWER.id).toBe('city-tower')
    expect(CITY_TOWER.name).toBe('New York')
    expect(CITY_TOWER.codeKey).toBe('0')
    expect(CITY_TOWER.lobbyAnchorFloor).toBe(0)
    expect(CITY_TOWER.buildDirection).toBe('up')
    // PINNED LITERALS, deliberately not the globals: the city lot excavates to
    // B10 as a balance fact, and must not deepen when the grid is widened for
    // another map (Niagara reaches B30).
    expect(CITY_TOWER.floorRange).toEqual({ min: -10, max: 99 })
    expect(CITY_TOWER.floorRange.min).toBeGreaterThan(FLOOR_MIN)
    expect(CITY_TOWER.disallowedItems).toEqual(['observationDeck'])
    expect(CITY_TOWER.endgameItem).toBe('cathedral')
    expect(CITY_TOWER.undergroundAllowed).toBe(true)
    expect(CITY_TOWER.spawnSources).toEqual([
      { type: 'street', share: 0.7 },
      { type: 'subway', share: 0.3 },
    ])
    expect(getMap('city-tower')).toBe(CITY_TOWER)
    expect(ALL_MAPS['city-tower']).toBe(CITY_TOWER)
  })

  it('throws on an unknown map id', () => {
    expect(() => getMap('falls')).toThrow()
  })

  it('refuses a downward map rather than letting it half-work', () => {
    // `buildDirection` is declared but unimplemented: every directional rule is
    // hard-coded against floor 0. Failing loudly at the registry beats silently
    // wrong support rules, floor labels, and camera bounds deep in the sim.
    ALL_MAPS['sink'] = { ...CITY_TOWER, id: 'sink', codeKey: 'y', buildDirection: 'down' }
    try {
      expect(() => getMap('sink')).toThrow(/does not implement/i)
    } finally {
      delete ALL_MAPS['sink']
    }
  })
})

describe('map extensibility seam', () => {
  const SYNTHETIC: MapDefinition = {
    id: 'synthetic',
    name: 'Synthetic',
    codeKey: 'z',
    blurb: 'Test fixture map.',
    lobbyAnchorFloor: 0,
    buildDirection: 'up',
    floorRange: { min: FLOOR_MIN, max: FLOOR_MAX },
    disallowedItems: ['subway', 'glass'],
    endgameItem: 'cathedral',
    spawnSources: [{ type: 'street', share: 1 }],
    undergroundAllowed: false,
    paletteTheme: 'test',
  }

  function syntheticState() {
    const state = makeTestState({ mapId: SYNTHETIC.id })
    ALL_MAPS[SYNTHETIC.id] = SYNTHETIC
    setStars(state, 3, 3)
    return state
  }

  afterEach(() => {
    delete ALL_MAPS['synthetic']
  })

  it('rejects a disallowed item purely from the map definition — no engine change', () => {
    const state = syntheticState()
    const result = validatePlacement(state, { type: 'place', kind: 'subway', floor: -10, x: 0 })
    expect(result.ok).toBe(false)
    expect(isItemAvailable('subway', 3, SYNTHETIC)).toBe(false)
  })

  it('rejects underground slab when the map forbids underground', () => {
    const state = syntheticState()
    placeSlabRow(state, 0, 0, 9)
    const result = validatePlacement(state, { type: 'place', kind: 'slab', floor: -1, x: 0, widthTiles: 5 })
    expect(result).toEqual({ ok: false, reason: 'Underground building is not available on this map' })
  })

  it('leaves everything else placeable', () => {
    const state = syntheticState()
    placeSlabRow(state, 0, 0, 9)
    const result = validatePlacement(state, { type: 'place', kind: 'officeS', floor: 0, x: 0 })
    expect(result.ok).toBe(true)
    // Apply works through the same map — no special casing.
    expect(() => applyPlacement(state, { type: 'place', kind: 'officeS', floor: 0, x: 0 })).not.toThrow()
  })
})
