import { migrateSandboxPayload, restoreSandbox } from '../../gameProgress'
import type { EngineEvent, EngineState, ItemKind, RentTier, Unit } from '../../gameTypes'
import { itemDef } from '../catalog'
import { isSlabFamily } from '../grid'
import { evalBreakdown, occupancyPass } from '../occupancy'
import { createRng } from '../rng'
import { evalBreakdown as referenceEvalBreakdown, occupancyPass as referencePass } from './occupancyReference'
import { injectUnit, makeTestState, placeShaft, setStars } from './testState'

/**
 * The daily pass reads a per-pass unit index instead of rescanning every unit
 * for every unit. That is a pure speed change: on the same state it must
 * produce exactly what the old full-scan pass produced — the same evals to the
 * last bit, the same leases, move-outs and events, the same rng position.
 * `occupancyReference.ts` is the old pass, frozen.
 */

declare function require(moduleName: string): unknown
declare const process: { cwd(): string }

const FIXTURES = `${process.cwd()}/resources/js/games/tower-throwback/__tests__/fixtures`

function loadFixture(name: 'completed-tower.v2.json' | 'big-bot-tower.v2.json.gz'): unknown {
  const fs = require('node:fs') as { readFileSync(path: string): Uint8Array }
  const zlib = require('node:zlib') as { gunzipSync(data: Uint8Array): Uint8Array }
  const bytes = fs.readFileSync(`${FIXTURES}/${name}`)
  const text = new TextDecoder().decode(name.endsWith('.gz') ? zlib.gunzipSync(bytes) : bytes)
  return JSON.parse(text) as unknown
}

function twinStates(raw: unknown): [EngineState, EngineState] {
  const saved = migrateSandboxPayload(raw)
  if (!saved) {
    throw new Error('fixture failed to load')
  }
  return [restoreSandbox(saved), restoreSandbox(saved)]
}

/** Everything a pass can change, minus derived caches. */
function outcome(state: EngineState, events: EngineEvent[]): unknown {
  return {
    events,
    units: state.units,
    shaftStats: state.shafts.map((shaft) => shaft.stats),
    rng: state.rng.state(),
    funds: state.funds,
  }
}

/** Runs `passes` daily passes on both twins (a day apart) and compares every one. */
function expectIdenticalPasses(reference: EngineState, indexed: EngineState, passes: number): void {
  for (let pass = 0; pass < passes; pass += 1) {
    for (let i = 0; i < reference.units.length; i += 1) {
      const unit = reference.units[i]!
      if (isSlabFamily(unit.kind)) {
        continue
      }
      expect(evalBreakdown(indexed, indexed.units[i]!)).toEqual(referenceEvalBreakdown(reference, unit))
    }
    const referenceEvents: EngineEvent[] = []
    const indexedEvents: EngineEvent[] = []
    referencePass(reference, referenceEvents)
    occupancyPass(indexed, indexedEvents)
    expect(outcome(indexed, indexedEvents)).toEqual(outcome(reference, referenceEvents))
    reference.clock.day += 1
    indexed.clock.day += 1
  }
}

const RANDOM_KINDS: readonly ItemKind[] = [
  'officeS', 'officeM', 'officeL', 'aptStudio', 'apt1br', 'apt2br', 'aptPenthouse', 'restroom', 'shop', 'fastfood',
  'foodCourt', 'restaurant', 'fancyRestaurant', 'movieTheater', 'fitness', 'pool', 'spa', 'conferenceCenter',
  'eventSpace', 'hotelReception', 'hotel1p', 'hotel2p', 'hotelSuite', 'housekeeping', 'trashRoom',
  'securityOffice', 'medicalClinic', 'escalator', 'stairs',
]
const RENT_TIERS: readonly RentTier[] = ['low', 'avg', 'high']

/**
 * A dense, deliberately messy tower: every eval-relevant kind, random flags
 * (trash overflow, infestation, damage, dirt), random occupancy and rent,
 * parking, a landmark, several shafts with random peak histories. Placement
 * rules are bypassed — the equivalence must hold for any state.
 */
function randomTower(seed: number, mapId: 'city-tower' | 'niagara-falls', unitCount: number): EngineState {
  const rng = createRng(seed)
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(rng.next() * items.length)]!
  const state = makeTestState({ mapId, seed })
  setStars(state, 5, 5)
  const floors = mapId === 'city-tower' ? [-3, -2, -1, ...Array.from({ length: 18 }, (_, i) => i)] : Array.from({ length: 30 }, (_, i) => i - 14)
  const xRanges: Array<[number, number]> = mapId === 'city-tower' ? [[0, 300]] : [[40, 188], [277, 374]]
  for (const floor of floors) {
    for (const [x0, x1] of xRanges) {
      injectUnit(state, { kind: floor === 0 ? 'lobby' : 'slab', floor, x: x0, width: x1 - x0 + 1, storeys: 1 })
    }
  }
  const shaftXs = xRanges.flatMap(([x0, x1]) => [x0 + 10, Math.floor((x0 + x1) / 2), x1 - 12])
  const lowest = floors[0]!
  const highest = floors[floors.length - 1]!
  for (const x of shaftXs) {
    const id = placeShaft(state, 'standard', x, Math.max(lowest, highest - 29), highest)
    const shaft = state.shafts.find((candidate) => candidate.id === id)!
    shaft.stats.peakWaitGameMin = rng.next() < 0.3 ? 0 : rng.next() * 60
  }
  const occupiedColumns = new Set(shaftXs.flatMap((x) => [x, x + 1]))
  const landmark = mapId === 'city-tower' ? 'cathedral' : 'observationDeck'
  injectUnit(state, { kind: landmark, floor: highest, x: xRanges[0]![0] + 20, width: 24, storeys: 2 })
  for (let floor = -1; floor >= -3; floor -= 1) {
    if (mapId === 'city-tower') {
      injectUnit(state, { kind: 'parkingRamp', floor, x: 250, width: 6, storeys: 1 })
      injectUnit(state, { kind: 'parkingSpace', floor, x: 260, width: 2, storeys: 1, offline: rng.next() < 0.2 })
    }
  }
  for (let n = 0; n < unitCount; n += 1) {
    const kind = pick(RANDOM_KINDS)
    const def = itemDef(kind)
    const [x0, x1] = pick(xRanges)
    const x = x0 + Math.floor(rng.next() * Math.max(1, x1 - x0 - def.width))
    if ([...Array(def.width).keys()].some((dx) => occupiedColumns.has(x + dx))) {
      continue
    }
    const occupied = rng.next() < 0.6
    const capacity = def.capacity ?? 0
    injectUnit(state, {
      kind,
      floor: pick(floors.filter((floor) => floor >= 1)),
      x,
      width: def.width,
      storeys: def.storeys,
      rentTier: pick(RENT_TIERS),
      grade: kind.startsWith('hotel') && rng.next() < 0.3 ? 'luxury' : 'standard',
      occupied,
      population: occupied ? { low: Math.floor(capacity / 2), med: capacity - Math.floor(capacity / 2), high: 0, vip: 0 } : { low: 0, med: 0, high: 0, vip: 0 },
      lowEvalDays: Math.floor(rng.next() * 3),
      dirty: kind.startsWith('hotel') && rng.next() < 0.3,
      infested: rng.next() < 0.04,
      offline: rng.next() < 0.04,
      incidentPenaltyUntilDay: rng.next() < 0.05 ? 3 : null,
      flags: { noRestroom: false, noRoute: false, noReception: false, trashOverflow: kind === 'trashRoom' && rng.next() < 0.5 },
    })
  }
  return state
}

describe('indexed daily occupancy pass', () => {
  it('matches the full-scan pass exactly on the completed-tower fixture', () => {
    const [reference, indexed] = twinStates(loadFixture('completed-tower.v2.json'))
    expectIdenticalPasses(reference, indexed, 3)
  })

  it('matches the full-scan pass exactly on the 1,417-unit bot tower at the morning rush', () => {
    const [reference, indexed] = twinStates(loadFixture('big-bot-tower.v2.json.gz'))
    expect(reference.units.length).toBeGreaterThan(1_400)
    expectIdenticalPasses(reference, indexed, 2)
  })

  it.each([
    { seed: 11, mapId: 'city-tower' as const },
    { seed: 29, mapId: 'city-tower' as const },
    { seed: 47, mapId: 'niagara-falls' as const },
  ])('matches the full-scan pass exactly on a random dense tower (seed $seed, $mapId)', ({ seed, mapId }) => {
    const reference = randomTower(seed, mapId, 500)
    const indexed = randomTower(seed, mapId, 500)
    expect(JSON.stringify(indexed.units)).toBe(JSON.stringify(reference.units))
    expectIdenticalPasses(reference, indexed, 3)
  })

  it('scans the unit list a bounded number of times, so its cost grows linearly', () => {
    /** Element reads of `state.units` during one daily pass. */
    function unitReads(pass: (state: EngineState, events: EngineEvent[]) => void, unitCount: number): number {
      const state = randomTower(5, 'city-tower', unitCount)
      pass(state, []) // warm route caches, as a running game has them
      let reads = 0
      const units = state.units
      state.units = new Proxy(units, {
        get(target, key, receiver) {
          if (typeof key === 'string' && /^\d+$/.test(key)) {
            reads += 1
          }
          return Reflect.get(target, key, receiver) as unknown
        },
      }) as Unit[]
      pass(state, [])
      state.units = units
      return reads
    }

    const indexedGrowth = unitReads(occupancyPass, 800) / unitReads(occupancyPass, 400)
    const referenceGrowth = unitReads(referencePass, 800) / unitReads(referencePass, 400)
    // Doubling the tower doubles the indexed pass's reads; the old pass's quadruple.
    expect(indexedGrowth).toBeLessThan(2.5)
    expect(referenceGrowth).toBeGreaterThan(3)
  })
})
