/**
 * The contract for `mapGeometry.ts`: for CITY_TOWER every helper must return
 * EXACTLY what the literal expression it replaces returns, across the entire
 * floor range. If that holds, converting call sites cannot change New York's
 * behaviour — which is the acceptance gate for the whole Niagara epic.
 *
 * The literal expressions below are transcribed from the call sites named in
 * each test. They are deliberately duplicated rather than imported: the point
 * is to compare the new helper against the OLD code, so the old code has to be
 * written out here.
 */
import { floorLabel } from '../../floorLabels'
import { FLOOR_MAX, FLOOR_MIN, type MapDefinition } from '../../gameTypes'
import {
  buildStep,
  depthFromAnchor,
  excavationExtreme,
  floorLabelFor,
  inwardNeighbour,
  isAnchorFloor,
  isBeyond,
  isExcavated,
  isOnBuildSide,
  meetsMinimumDepth,
  outwardNeighbour,
  supportFloorFor,
  terminalFloor,
} from '../mapGeometry'
import { CITY_TOWER } from '../maps'

/** Every floor the grid can address, which is every floor a rule can see. */
const ALL_FLOORS = Array.from({ length: FLOOR_MAX - FLOOR_MIN + 1 }, (_, i) => i + FLOOR_MIN)

/** A synthetic downward map. Built directly, bypassing `getMap`'s guard. */
const FALLS: MapDefinition = {
  ...CITY_TOWER,
  id: 'falls-fixture',
  name: 'Falls Fixture',
  codeKey: 'f',
  blurb: 'Downward test fixture.',
  buildDirection: 'down',
  lobbyAnchorFloor: 0,
  floorRange: { min: -60, max: 0 },
}

describe('mapGeometry — CITY_TOWER equivalence', () => {
  it('depth is the floor number itself', () => {
    for (const floor of ALL_FLOORS) {
      expect(depthFromAnchor(CITY_TOWER, floor)).toBe(floor)
    }
  })

  it('matches `cmd.floor === 0` (placement.ts:114, :137 — groundOnly + free anchor)', () => {
    for (const floor of ALL_FLOORS) {
      expect(isAnchorFloor(CITY_TOWER, floor)).toBe(floor === 0)
    }
  })

  it('matches `cmd.floor < 0` (placement.ts:116, :230, :233, :278, :353, :356 — underground + excavation cost)', () => {
    for (const floor of ALL_FLOORS) {
      expect(isExcavated(CITY_TOWER, floor)).toBe(floor < 0)
    }
  })

  it('matches `cmd.floor >= 0` (placement.ts:125 — the default vertical rule)', () => {
    for (const floor of ALL_FLOORS) {
      expect(isOnBuildSide(CITY_TOWER, floor)).toBe(floor >= 0)
    }
  })

  it('matches `cmd.floor > 0 ? floor - 1 : floor + 1` (placement.ts:140 — support direction)', () => {
    for (const floor of ALL_FLOORS) {
      if (floor === 0) {
        continue // the anchor returns early; support is undefined there
      }
      expect(supportFloorFor(CITY_TOWER, floor)).toBe(floor > 0 ? floor - 1 : floor + 1)
    }
  })

  it('matches `fp.floorLo > cathedral.floor` (placement.ts:247 — post-cathedral lockout)', () => {
    for (const a of ALL_FLOORS) {
      for (const b of [-10, -1, 0, 1, 50, 99]) {
        expect(isBeyond(CITY_TOWER, a, b)).toBe(a > b)
      }
    }
  })

  it('matches `cmd.floor === 99` and `=== -10` (placement.ts:118, :120 — cathedral and subway)', () => {
    expect(terminalFloor(CITY_TOWER)).toBe(99)
    expect(excavationExtreme(CITY_TOWER)).toBe(-10)
  })

  it('matches `cmd.floor < TUNING.grid.skylobbyMinFloor` (placement.ts:107)', () => {
    for (const floor of ALL_FLOORS) {
      expect(meetsMinimumDepth(CITY_TOWER, floor, 5)).toBe(!(floor < 5))
    }
  })

  it('matches `floorLabel` exactly (floorLabels.ts:3)', () => {
    for (const floor of ALL_FLOORS) {
      expect(floorLabelFor(CITY_TOWER, floor)).toBe(floorLabel(floor))
    }
  })
})

describe('mapGeometry — downward map', () => {
  it('measures depth downward from the clifftop', () => {
    expect(depthFromAnchor(FALLS, 0)).toBe(0)
    expect(depthFromAnchor(FALLS, -1)).toBe(1)
    expect(depthFromAnchor(FALLS, -60)).toBe(60)
    // Above the crest is the excavated side on this map.
    expect(depthFromAnchor(FALLS, 3)).toBe(-3)
  })

  it('treats the gorge as the build side, not as excavation', () => {
    // The whole point: `floor < 0` would have called every falls floor
    // "underground", paywalling the entire map behind the 3-star gate.
    expect(isOnBuildSide(FALLS, -30)).toBe(true)
    expect(isExcavated(FALLS, -30)).toBe(false)
    expect(isExcavated(FALLS, 3)).toBe(true)
  })

  it('supports each floor from the one nearer the crest', () => {
    expect(supportFloorFor(FALLS, -1)).toBe(0)
    expect(supportFloorFor(FALLS, -30)).toBe(-29)
    expect(isAnchorFloor(FALLS, 0)).toBe(true)
  })

  it('puts the prestige floor at the bottom of the gorge', () => {
    expect(terminalFloor(FALLS)).toBe(-60)
    expect(excavationExtreme(FALLS)).toBe(0)
  })

  it('orders "beyond" by depth, so deeper wins', () => {
    expect(isBeyond(FALLS, -40, -10)).toBe(true)
    expect(isBeyond(FALLS, -10, -40)).toBe(false)
  })

  it('applies the skylobby minimum as a depth from the lobby', () => {
    expect(meetsMinimumDepth(FALLS, -4, 5)).toBe(false)
    expect(meetsMinimumDepth(FALLS, -5, 5)).toBe(true)
  })

  it('labels by depth rather than as basements', () => {
    // "B" reads as basement, which is wrong for a gorge.
    expect(floorLabelFor(FALLS, 0)).toBe('0')
    expect(floorLabelFor(FALLS, -12)).toBe('12')
    expect(floorLabelFor(FALLS, 2)).toBe('U2')
  })
})

describe('mapGeometry — anchor independence', () => {
  /** An up-map anchored somewhere other than 0, to prove nothing assumes zero. */
  const RAISED: MapDefinition = { ...CITY_TOWER, id: 'raised', lobbyAnchorFloor: 5 }

  it('measures from the map anchor, not from floor zero', () => {
    expect(depthFromAnchor(RAISED, 5)).toBe(0)
    expect(isAnchorFloor(RAISED, 5)).toBe(true)
    expect(isAnchorFloor(RAISED, 0)).toBe(false)
    expect(isExcavated(RAISED, 4)).toBe(true)
    expect(isExcavated(RAISED, 6)).toBe(false)
    expect(supportFloorFor(RAISED, 8)).toBe(7)
    expect(supportFloorFor(RAISED, 2)).toBe(3)
  })
})

describe('mapGeometry — numeric hygiene', () => {
  it('never returns negative zero', () => {
    // -0 compares equal to 0 but is a distinct value to Object.is and to Map
    // keys, so it would surface as a baffling bug far from here.
    for (const map of [CITY_TOWER, FALLS]) {
      for (const floor of ALL_FLOORS) {
        expect(Object.is(depthFromAnchor(map, floor), -0)).toBe(false)
      }
    }
  })
})

describe('mapGeometry — neighbours across a unit span', () => {
  it('matches `topStorey + 1` / `floor - 1` on CITY_TOWER (placement.ts:570,573)', () => {
    for (const floor of ALL_FLOORS.slice(0, -3)) {
      for (const storeys of [1, 2, 3]) {
        const topStorey = floor + storeys - 1
        expect(outwardNeighbour(CITY_TOWER, floor, topStorey)).toBe(topStorey + 1)
        expect(inwardNeighbour(CITY_TOWER, floor, topStorey)).toBe(floor - 1)
      }
    }
  })

  it('uses the correct end of a multi-storey unit on a downward map', () => {
    // The naive `floor + storeys` conversion lands INSIDE a multi-storey unit
    // when the build axis is flipped — this is the trap the span-aware helpers
    // exist to avoid.
    const floor = -20
    const topStorey = -18 // a 3-storey unit occupying -20..-18
    expect(outwardNeighbour(FALLS, floor, topStorey)).toBe(-21)
    expect(inwardNeighbour(FALLS, floor, topStorey)).toBe(-17)
  })

  it('reports the build step', () => {
    expect(buildStep(CITY_TOWER)).toBe(1)
    expect(buildStep(FALLS)).toBe(-1)
  })
})
