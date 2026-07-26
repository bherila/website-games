/**
 * Multi-map infrastructure: the invariants that make adding a second map safe,
 * independent of what that map turns out to be.
 */
import { decodeChallengeCode, encodeChallengeCode } from '../challengeCode'
import { ALL_MAPS, allMaps, CITY_TOWER, getMap, isKnownMapId, MAP_ORDER, mapByCodeKey } from '../engine/maps'
import { registeredPaletteThemes } from '../scene/palette'

describe('map registry', () => {
  it('keeps the original map id, because the id is the save key', () => {
    // Renaming this orphans every existing save (gameProgress validates mapId
    // against ALL_MAPS). The DISPLAY name is the part that changed.
    expect(CITY_TOWER.id).toBe('city-tower')
    expect(CITY_TOWER.name).toBe('New York')
  })

  it('exposes every registered map in a stable order', () => {
    expect(MAP_ORDER).toEqual(Object.keys(ALL_MAPS))
    expect(allMaps().map((map) => map.id)).toEqual([...MAP_ORDER])
  })

  it('gives every map a unique, non-empty code key', () => {
    const keys = allMaps().map((map) => map.codeKey)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) {
      expect(key).toMatch(/^[0-9a-z]$/)
    }
  })

  it('registers a palette for every map theme', () => {
    // An unregistered theme silently renders in New York's colours, which reads
    // as a rendering bug rather than a missing asset.
    for (const map of allMaps()) {
      expect(registeredPaletteThemes()).toContain(map.paletteTheme)
    }
  })

  it('reports which map ids this build can load', () => {
    expect(isKnownMapId('city-tower')).toBe(true)
    expect(isKnownMapId('falls')).toBe(false)
    expect(isKnownMapId('toString')).toBe(false)
    expect(() => getMap('toString')).toThrow(/unknown map id/i)
  })

  it('refuses a downward map instead of letting it half-work', () => {
    ALL_MAPS['sink'] = { ...CITY_TOWER, id: 'sink', codeKey: 'y', buildDirection: 'down' }
    try {
      expect(() => getMap('sink')).toThrow(/does not implement/i)
    } finally {
      delete ALL_MAPS['sink']
    }
  })
})

describe('challenge codes carry the map', () => {
  it('round-trips the map alongside seed and lobby', () => {
    for (const map of allMaps()) {
      const code = encodeChallengeCode({ seed: 4242, lobbyHeight: 2, mapId: map.id })
      expect(decodeChallengeCode(code)).toEqual({ seed: 4242, lobbyHeight: 2, mapId: map.id })
    }
  })

  it('resolves a code key back to its map', () => {
    expect(mapByCodeKey(CITY_TOWER.codeKey)?.id).toBe(CITY_TOWER.id)
    expect(mapByCodeKey('~')).toBeNull()
  })

  it('still decodes pre-map codes, to the original city map', () => {
    // Codes shared before the map field existed are 9 chars. Invalidating them
    // would break every link already posted somewhere.
    expect(decodeChallengeCode('0002N9C1B')).toEqual({ seed: 123_456, lobbyHeight: 1, mapId: 'city-tower' })
  })

  it('rejects a code naming a map this build does not have', () => {
    // Better a clean rejection than silently starting a different map's tower.
    const code = encodeChallengeCode({ seed: 1, lobbyHeight: 1, mapId: CITY_TOWER.id })
    const body = `${code.slice(0, 8)}Q`
    const sum = [...body.toLowerCase()].reduce((acc, char) => acc + Number.parseInt(char, 36), 0)
    const forged = `${body}${(sum % 36).toString(36)}`.toUpperCase()

    expect(decodeChallengeCode(forged)).toBeNull()
  })
})
