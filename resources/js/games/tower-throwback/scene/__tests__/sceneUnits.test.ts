import * as THREE from 'three'

import { makeTestState, placeShaft, placeSlabRow, setStars } from '../../engine/__tests__/testState'
import { floorLabel } from '../../floorLabels'
import { type Person, TUNING, type Unit } from '../../gameTypes'
import { createCameraRig, panByPixels } from '../camera'
import { dwellRenderSlot, dwellSlotX } from '../dwellSlots'
import {
  BADGE_CAP,
  BAR_CAP,
  CAR_CAP,
  carIsFull,
  createDynamicPools,
  disposeDynamicPools,
  FULL_BADGE_CAP,
  measureDynamicPoolUtilization,
  PERSON_CAP,
  QUEUE_RENDER_MAX,
  syncDynamic,
} from '../dynamicPools'
import { elevatorStopLabels, stopToggleCommandAt, stopToggleCommandForClick } from '../elevatorStops'
import { FLOOR_H, getPalette, personColor } from '../palette'
import { approach, createCarGlideStore, prepareSceneFrame, type SceneFrame } from '../sceneFrame'
import { createStructureLayer, syncStructure } from '../structureMesh'
import type { StyleGateArtLayer } from '../styleGateArt'
import {
  disposeStyleGateArtLayer,
  STYLE_GATE_MERGED_SHAFT_CAPS,
  STYLE_GATE_MERGED_UNITS,
  STYLE_GATE_PERSON_CAP,
  syncStyleGateArt,
} from '../styleGateArt'
import type { StyleGateFrameName } from '../styleGateFrames'
import { STYLE_GATE_NIAGARA_GORGE_FRAME, styleGatePersonReadsIrritated } from '../styleGateFrames'
import { disposeObject } from '../threeUtils'

function makeRenderPerson(id: number, overrides: Partial<Person> = {}): Person {
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
    ...overrides,
  }
}

function makeRenderUnit(id: number): Unit {
  return {
    id,
    kind: 'officeS',
    floor: 0,
    x: id * 10,
    width: 6,
    storeys: 1,
    grade: 'standard',
    rentTier: 'avg',
    occupied: true,
    population: { low: 1, med: 0, high: 0, vip: 0 },
    evalScore: 75,
    stressMarks: 0,
    lowEvalDays: 0,
    vacancyReason: null,
    flags: { noRestroom: false, noRoute: false, noReception: false, trashOverflow: false },
    dirty: false,
    infested: false,
    offline: false,
    damageKind: null,
    incidentPenaltyUntilDay: null,
  }
}

function makeLoadedStyleGateLayer(): StyleGateArtLayer {
  const group = new THREE.Group()
  const structureGroup = new THREE.Group()
  const dynamicGroup = new THREE.Group()
  group.add(structureGroup, dynamicGroup)
  return {
    group,
    structureGroup,
    dynamicGroup,
    structureVersion: -1,
    mapId: null,
    glassMesh: null,
    glassUnits: [],
    glassOccupancySignature: '',
    lastGlassTimeBucket: -1,
    texture: new THREE.Texture(),
    loaded: true,
    settled: true,
    disposed: false,
    warnedFrames: new Set(),
    warnedLoadFailure: false,
    dynamicMeshes: new Map(),
    dynamicStructureMesh: null,
    activityUnits: new Map(),
    personVisual: new Map(),
  }
}

function prepareTestSceneFrame(state: Parameters<typeof prepareSceneFrame>[0], dtSec = 0): SceneFrame {
  return prepareSceneFrame(state, createCarGlideStore(), dtSec)
}

describe('panByPixels (review fix #5)', () => {
  it('converts pixel drags through the frustum, matching screenToTile scale', () => {
    const rig = createCameraRig(2) // aspect 2 → 800×400 viewport
    rig.halfHeight = 30 // frustum height 60 world units
    rig.extents = { minX: -10_000, maxX: 10_000, minY: -10_000, maxY: 10_000 } // no clamping
    const startX = rig.centerX
    const startY = rig.centerY

    // 100px of a 400px-tall viewport = a quarter of the 60-unit frustum = 15.
    panByPixels(rig, 100, -40, 400)
    expect(rig.centerX - startX).toBeCloseTo(15)
    expect(rig.centerY - startY).toBeCloseTo(-6)
  })
})

describe('Niagara scene art', () => {
  it('uses a hand-picked map palette and map-scoped gorge backdrop', () => {
    const cityPalette = getPalette('city')
    const fallsPalette = getPalette('falls')
    expect(fallsPalette).not.toBe(cityPalette)
    expect(fallsPalette.unitBase.hotelReception).not.toBe(cityPalette.unitBase.hotelReception)

    const layer = makeLoadedStyleGateLayer()
    const state = makeTestState()
    syncStyleGateArt(layer, state, prepareTestSceneFrame(state), 'detail', 0)
    expect(layer.structureGroup.getObjectByName('ambience.groundHorizon.strip')).toBeDefined()
    expect(layer.structureGroup.getObjectByName(STYLE_GATE_NIAGARA_GORGE_FRAME)).toBeUndefined()

    state.mapId = 'niagara-falls'
    syncStyleGateArt(layer, state, prepareTestSceneFrame(state), 'detail', 0)
    expect(layer.structureGroup.getObjectByName('ambience.groundHorizon.strip')).toBeUndefined()
    expect(layer.structureGroup.getObjectByName(STYLE_GATE_NIAGARA_GORGE_FRAME)).toBeDefined()
    disposeStyleGateArtLayer(layer)
  })
})

describe('disposeObject (review fix #6)', () => {
  it('disposes InstancedMesh instance buffers', () => {
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), 8)
    const spy = jest.spyOn(mesh, 'dispose')
    disposeObject(mesh)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('glass rail translucency (review fix #9)', () => {
  it('renders glass shafts on a translucent pass and others opaque', () => {
    const state = makeTestState()
    setStars(state, 4, 4)
    placeSlabRow(state, 0, 0, 30)
    for (let f = 1; f <= 4; f++) {
      placeSlabRow(state, f, 0, 30)
    }
    placeShaft(state, 'standard', 5, 0, 4)
    placeShaft(state, 'glass', 10, 0, 4)

    const scene = new THREE.Scene()
    const layer = createStructureLayer(scene)
    syncStructure(layer, state)

    const opacities = layer.rebuilt.children
      .filter((child): child is THREE.InstancedMesh => (child as THREE.InstancedMesh).isInstancedMesh)
      .map((mesh) => (mesh.material as THREE.MeshBasicMaterial).opacity)
    expect(opacities).toContain(0.5) // the glass pass
    expect(opacities).toContain(0.85) // the opaque rails
  })
})

describe('palette legibility (review fixes #11/#12)', () => {
  it('people read as light silhouettes, not near-black squares', () => {
    const palette = getPalette('city')
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 10)
    const person = { tier: 'med', irritated: false, vip: false }
    const color = new THREE.Color(personColor(palette, person as never))
    expect(color.r + color.g + color.b).toBeGreaterThan(1.8) // bright, not #2a2a2a
    void state
  })

  it('elevator cabins contrast with every shaft rail color', () => {
    const palette = getPalette('city')
    const cabin = new THREE.Color(palette.carCabin)
    for (const railHex of Object.values(palette.shaft)) {
      const rail = new THREE.Color(railHex)
      const delta = Math.abs(cabin.r - rail.r) + Math.abs(cabin.g - rail.g) + Math.abs(cabin.b - rail.b)
      expect(delta).toBeGreaterThan(0.5) // regression: cars used the rail's own color
    }
    expect(palette.carCabinDoors).not.toBe(palette.carCabin) // doors-open flash
  })
})

describe('approach — presentation glide (design refinement #11/#12)', () => {
  it('glides toward the target at the capped step', () => {
    expect(approach(0, 5, 1, 10)).toBe(1)
    expect(approach(5, 0, 1, 10)).toBe(4)
  })

  it('arrives exactly when within one step', () => {
    expect(approach(4.5, 5, 1, 10)).toBe(5)
    expect(approach(5, 5, 1, 10)).toBe(5)
  })

  it('snaps when the sim has run far ahead', () => {
    expect(approach(0, 20, 1, 10)).toBe(20)
    expect(approach(50, 0, 1, 10)).toBe(0)
  })

  it('a zero-dt frame (pause with no elapsed time) holds position', () => {
    expect(approach(3, 5, 0, 10)).toBe(3)
  })
})

describe('carIsFull', () => {
  it('matches cars at or above capacity', () => {
    expect(carIsFull(3, { passengerIds: [1, 2] })).toBe(false)
    expect(carIsFull(3, { passengerIds: [1, 2, 3] })).toBe(true)
    expect(carIsFull(3, { passengerIds: [1, 2, 3, 4] })).toBe(true)
  })
})

describe('dynamic pool cap instrumentation', () => {
  it('clamps rendered people at PERSON_CAP and reports overflow', () => {
    const state = makeTestState()
    state.people = Array.from({ length: PERSON_CAP + 3 }, (_, index) => makeRenderPerson(index + 1))

    const scene = new THREE.Scene()
    const pools = createDynamicPools(scene)
    syncDynamic(pools, state, prepareTestSceneFrame(state))

    expect(pools.persons.count).toBe(PERSON_CAP)
    expect(measureDynamicPoolUtilization(state).persons).toEqual({
      used: PERSON_CAP,
      needed: PERSON_CAP + 3,
      cap: PERSON_CAP,
      overflow: 3,
      atCap: true,
    })

    disposeDynamicPools(pools)
  })

  it('clamps rendered elevator cars at CAR_CAP and reports overflow', () => {
    const state = makeTestState()
    state.shafts = [
      {
        id: 1,
        kind: 'standard',
        x: 0,
        bottomFloor: 0,
        topFloor: 1,
        stops: [0, 1],
        enabledStops: [0, 1],
        cars: Array.from({ length: CAR_CAP + 2 }, (_, index) => ({
          index,
          y: 0,
          dir: 0 as const,
          state: 'idle' as const,
          doorTimer: 0,
          homeFloor: null,
          passengerIds: [],
        })),
        program: {
          weekday: { morningRush: 'balanced', daytime: 'balanced', eveningRush: 'balanced', night: 'balanced' },
          weekend: { morningRush: 'balanced', daytime: 'balanced', eveningRush: 'balanced', night: 'balanced' },
          idleAnswerThreshold: 2,
          doorDwellSec: 8,
        },
        stats: { avgWaitGameMin: 0, peakWaitGameMin: 0 },
      },
    ]

    const scene = new THREE.Scene()
    const pools = createDynamicPools(scene)
    syncDynamic(pools, state, prepareTestSceneFrame(state))

    expect(pools.cars.count).toBe(CAR_CAP)
    expect(measureDynamicPoolUtilization(state).cars).toEqual({
      used: CAR_CAP,
      needed: CAR_CAP + 2,
      cap: CAR_CAP,
      overflow: 2,
      atCap: true,
    })

    disposeDynamicPools(pools)
  })

  it('draws full-car badges even when atlas sprites own the car renderer', () => {
    const state = makeTestState()
    const passengerIds = Array.from({ length: 20 }, (_, index) => index + 1)
    state.shafts = [
      {
        id: 1,
        kind: 'standard',
        x: 4,
        bottomFloor: 0,
        topFloor: 1,
        stops: [0, 1],
        enabledStops: [0, 1],
        cars: [
          {
            index: 0,
            y: 0,
            dir: 0,
            state: 'idle',
            doorTimer: 0,
            homeFloor: null,
            passengerIds,
          },
          {
            index: 1,
            y: 1,
            dir: 0,
            state: 'idle',
            doorTimer: 0,
            homeFloor: null,
            passengerIds: passengerIds.slice(1),
          },
        ],
        program: {
          weekday: { morningRush: 'balanced', daytime: 'balanced', eveningRush: 'balanced', night: 'balanced' },
          weekend: { morningRush: 'balanced', daytime: 'balanced', eveningRush: 'balanced', night: 'balanced' },
          idleAnswerThreshold: 2,
          doorDwellSec: 8,
        },
        stats: { avgWaitGameMin: 0, peakWaitGameMin: 0 },
      },
    ]

    const scene = new THREE.Scene()
    const pools = createDynamicPools(scene)
    syncDynamic(pools, state, prepareTestSceneFrame(state), 0, false)

    expect(pools.cars.count).toBe(0)
    expect(pools.fullBadges.count).toBe(1)
    expect(measureDynamicPoolUtilization(state).fullBadges).toEqual({
      used: 1,
      needed: 1,
      cap: FULL_BADGE_CAP,
      overflow: 0,
      atCap: false,
    })

    disposeDynamicPools(pools)
  })

  it('reports queue-badge demand independently of the person pool cap', () => {
    const state = makeTestState()
    const people: Person[] = []
    let id = 1
    for (let group = 0; group < BADGE_CAP + 1; group++) {
      for (let index = 0; index < QUEUE_RENDER_MAX + 1; index++) {
        people.push(
          makeRenderPerson(id, {
            state: 'queued',
            floor: group,
            legs: [{ type: 'elevator', fromFloor: group, fromX: 0, toFloor: group + 1, toX: 0, shaftId: group }],
          }),
        )
        id += 1
      }
    }
    state.people = people
    state.shafts = Array.from({ length: BADGE_CAP + 1 }, (_, id) => ({
      id,
      kind: 'standard' as const,
      x: 0,
      bottomFloor: id,
      topFloor: id + 1,
      stops: [id, id + 1],
      enabledStops: [id, id + 1],
      cars: [],
      program: {
        weekday: { morningRush: 'balanced', daytime: 'balanced', eveningRush: 'balanced', night: 'balanced' },
        weekend: { morningRush: 'balanced', daytime: 'balanced', eveningRush: 'balanced', night: 'balanced' },
        idleAnswerThreshold: 3,
        doorDwellSec: 8,
      },
      stats: { avgWaitGameMin: 0, peakWaitGameMin: 0 },
    }))

    const scene = new THREE.Scene()
    const pools = createDynamicPools(scene)
    syncDynamic(pools, state, prepareTestSceneFrame(state))
    const utilization = measureDynamicPoolUtilization(state)

    expect(utilization.badges.needed).toBe(BADGE_CAP + 1)
    expect(pools.badges.count).toBe(utilization.badges.used)
    expect(utilization.badges.used).toBe(BADGE_CAP)
    expect(utilization.badges.overflow).toBe(1)

    disposeDynamicPools(pools)
  })

  it('clamps rendered occupancy bars at BAR_CAP and reports overflow', () => {
    const state = makeTestState()
    state.units = Array.from({ length: BAR_CAP + 2 }, (_, index) => makeRenderUnit(index + 1))

    const scene = new THREE.Scene()
    const pools = createDynamicPools(scene)
    syncDynamic(pools, state, prepareTestSceneFrame(state))

    expect(pools.bars.count).toBe(BAR_CAP)
    expect(measureDynamicPoolUtilization(state).bars).toEqual({
      used: BAR_CAP,
      needed: BAR_CAP + 2,
      cap: BAR_CAP,
      overflow: 2,
      atCap: true,
    })

    disposeDynamicPools(pools)
  })

  it('fans dwelling visitors across their destination unit in the fallback renderer', () => {
    const state = makeTestState()
    const venue = makeRenderUnit(77)
    venue.kind = 'fastfood'
    venue.x = 20
    venue.width = 12
    state.units = [venue]
    state.people = [
      makeRenderPerson(9, {
        state: 'walking',
        floor: venue.floor,
        x: venue.x,
        legs: [],
        legIndex: 0,
        purpose: 'shopping',
        destUnitId: venue.id,
      }),
    ]

    const scene = new THREE.Scene()
    const pools = createDynamicPools(scene)
    syncDynamic(pools, state, prepareTestSceneFrame(state))

    expect(pools.personVisual.get(9)?.x).toBe(dwellSlotX(9, venue.x, venue.width))

    disposeDynamicPools(pools)
  })

  it('renders an Observation Deck VIP on the upper terrace in both scene passes', () => {
    const state = makeTestState({ mapId: 'niagara-falls' })
    const deck = makeRenderUnit(77)
    deck.kind = 'observationDeck'
    deck.floor = 15
    deck.x = 2
    deck.width = 24
    deck.storeys = 2
    const vip = makeRenderPerson(9, {
      tier: 'vip',
      vip: true,
      state: 'walking',
      floor: deck.floor,
      x: deck.x,
      legs: [],
      legIndex: 0,
      purpose: 'vipVisit',
      destUnitId: deck.id,
    })
    state.units = [deck]
    state.people = [vip]
    const expected = dwellRenderSlot(vip.id, deck)
    const frame = prepareTestSceneFrame(state)

    const scene = new THREE.Scene()
    const pools = createDynamicPools(scene)
    syncDynamic(pools, state, frame)
    expect(pools.personVisual.get(vip.id)).toEqual(expected)

    const layer = makeLoadedStyleGateLayer()
    syncStyleGateArt(layer, state, frame, 'detail', 0)
    expect(layer.personVisual.get(vip.id)).toEqual(expected)
    expect(expected.floor).toBe(deck.floor + 1)

    disposeDynamicPools(pools)
    disposeStyleGateArtLayer(layer)
  })

  it('tiles offline damage art through the style-gate dynamic pass', () => {
    const state = makeTestState()
    const damaged = makeRenderUnit(77)
    damaged.x = 20
    damaged.width = 3
    damaged.storeys = 2
    damaged.offline = true
    const normal = makeRenderUnit(78)
    normal.x = 40
    normal.width = 2
    const burned = makeRenderUnit(79)
    burned.x = 50
    burned.width = 3
    burned.storeys = 2
    burned.offline = true
    burned.damageKind = 'fire'
    state.units = [damaged, normal, burned]
    state.shafts = []
    state.people = []

    const layer = makeLoadedStyleGateLayer()
    syncStyleGateArt(layer, state, prepareTestSceneFrame(state), 'detail', 0)

    expect(layer.dynamicMeshes.get('unit.damage.blownUp.tile')?.count).toBe(1)
    expect(layer.dynamicMeshes.get('unit.damage.blownUp.variantB.tile')?.count).toBe(1)
    expect(layer.dynamicMeshes.get('unit.damage.blownUp.variantC.tile')?.count).toBe(1)
    expect(layer.dynamicMeshes.get('unit.damage.burnedDown.tile')?.count).toBe(1)
    expect(layer.dynamicMeshes.get('unit.damage.burnedDown.variantB.tile')?.count).toBe(1)
    expect(layer.dynamicMeshes.get('unit.damage.burnedDown.variantC.tile')?.count).toBe(1)

    damaged.offline = false
    burned.offline = false
    syncStyleGateArt(layer, state, prepareTestSceneFrame(state), 'detail', 0)

    expect(layer.dynamicMeshes.get('unit.damage.blownUp.tile')?.count).toBe(0)
    expect(layer.dynamicMeshes.get('unit.damage.burnedDown.tile')?.count).toBe(0)

    disposeObject(layer.group)
  })
})

describe('style-gate person capacity', () => {
  it('renders the full simulation ceiling without the old 1,024-person clip', () => {
    const state = makeTestState()
    state.people = Array.from({ length: TUNING.people.maxActive }, (_, index) => makeRenderPerson(index + 1))
    const layer = makeLoadedStyleGateLayer()

    syncStyleGateArt(layer, state, prepareTestSceneFrame(state), 'detail', 0)

    const renderedPeople = [...layer.dynamicMeshes.entries()]
      .filter(([name]) => name.startsWith('person.'))
      .reduce((total, [, mesh]) => total + mesh.count, 0)
    expect(STYLE_GATE_PERSON_CAP).toBe(TUNING.people.maxActive)
    expect(renderedPeople).toBe(TUNING.people.maxActive)
    expect(measureDynamicPoolUtilization(state, STYLE_GATE_PERSON_CAP).persons.overflow).toBe(0)

    disposeStyleGateArtLayer(layer)
  })
})

describe('irritated passenger tint in the atlas renderer', () => {
  const palette = getPalette('city')

  function renderSolePerson(overrides: Partial<Person>): StyleGateArtLayer {
    const state = makeTestState()
    state.units = []
    state.shafts = []
    state.people = [makeRenderPerson(1, overrides)]
    const layer = makeLoadedStyleGateLayer()
    syncStyleGateArt(layer, state, prepareTestSceneFrame(state), 'detail', 0)
    return layer
  }

  function instanceColorHex(layer: StyleGateArtLayer, frameName: StyleGateFrameName): string {
    const mesh = layer.dynamicMeshes.get(frameName)!
    expect(mesh.count).toBe(1)
    const color = new THREE.Color()
    mesh.getColorAt(0, color)
    return color.getHexString()
  }

  const cases: { frame: StyleGateFrameName; overrides: Partial<Person> }[] = [
    { frame: 'person.low.sample', overrides: { tier: 'low' } },
    { frame: 'person.med.sample', overrides: { tier: 'med' } },
    { frame: 'person.high.sample', overrides: { tier: 'high' } },
    { frame: 'person.vip.sample', overrides: { vip: true } },
    { frame: 'person.staff.sample', overrides: { purpose: 'trashHaul' } },
    { frame: 'person.housekeeper.sample', overrides: { purpose: 'housekeeping' } },
  ]

  it.each(cases)('tints an irritated $frame with the fallback irritated red', ({ frame, overrides }) => {
    const irritatedRed = new THREE.Color(palette.person.irritated).getHexString()
    const layer = renderSolePerson({ irritated: true, ...overrides })
    expect(instanceColorHex(layer, frame)).toBe(irritatedRed)
    disposeStyleGateArtLayer(layer)
  })

  it('leaves non-irritated people untinted (identity white multiply)', () => {
    const layer = renderSolePerson({ tier: 'med', irritated: false })
    expect(instanceColorHex(layer, 'person.med.sample')).toBe('ffffff')
    disposeStyleGateArtLayer(layer)
  })

  it('agrees with the fallback renderer on who reads as irritated', () => {
    for (const irritated of [true, false]) {
      const person = makeRenderPerson(1, { irritated, tier: 'med' })
      const fallbackReadsRed = personColor(palette, person) === palette.person.irritated
      expect(styleGatePersonReadsIrritated(person)).toBe(fallbackReadsRed)
      expect(styleGatePersonReadsIrritated(person)).toBe(irritated)
    }
  })

  it('runs the dynamic sync twice without mutating engine state (read-only)', () => {
    const state = makeTestState()
    state.units = []
    state.shafts = []
    state.people = [makeRenderPerson(1, { irritated: true }), makeRenderPerson(2, { tier: 'high' })]
    const before = JSON.stringify(state)

    const layer = makeLoadedStyleGateLayer()
    syncStyleGateArt(layer, state, prepareTestSceneFrame(state), 'detail', 0)
    syncStyleGateArt(layer, state, prepareTestSceneFrame(state), 'detail', 0)

    expect(JSON.stringify(state)).toBe(before)
    disposeStyleGateArtLayer(layer)
  })
})

describe('time-aware occupied unit art', () => {
  it('swaps office, residential, commerce, and restroom frames without rebuilding structure', () => {
    const state = makeTestState()
    const office = makeRenderUnit(78)
    office.x = 10
    const apartment = makeRenderUnit(79)
    apartment.kind = 'aptStudio'
    apartment.x = 20
    apartment.width = 4
    const restroom = makeRenderUnit(80)
    restroom.kind = 'restroom'
    restroom.x = 30
    restroom.width = 4
    restroom.occupied = false
    const fastFood = makeRenderUnit(81)
    fastFood.kind = 'fastfood'
    fastFood.x = 40
    fastFood.width = 12
    state.units = [office, apartment, restroom, fastFood]
    state.shafts = []
    state.clock = { day: 1, minute: 23 * 60 }
    state.people = [makeRenderPerson(90, { destUnitId: fastFood.id, purpose: 'shopping' })]

    const layer = makeLoadedStyleGateLayer()
    syncStyleGateArt(layer, state, prepareTestSceneFrame(state), 'detail', 0)
    const structureChildren = [...layer.structureGroup.children]

    expect(layer.activityUnits.get(office.id)?.frameName).toBe('unit.officeS.variantA.vacant')
    expect(layer.activityUnits.get(apartment.id)?.frameName).toBe('unit.aptStudio.variantB.sleeping')
    expect(layer.activityUnits.get(restroom.id)?.frameName).toBe('unit.restroom.vacant')
    expect(layer.activityUnits.get(fastFood.id)?.frameName).toBe('unit.fastfood.occupied')
    // Activity-art units share the single merged unit mesh, whose UVs get retinted in place.
    expect(layer.dynamicStructureMesh).not.toBeNull()
    expect(layer.structureGroup.getObjectByName(STYLE_GATE_MERGED_UNITS)).toBe(layer.dynamicStructureMesh)

    state.clock.minute = 12 * 60
    state.people = []
    syncStyleGateArt(layer, state, prepareTestSceneFrame(state), 'detail', 0)

    expect(layer.structureGroup.children).toEqual(structureChildren)
    expect(layer.activityUnits.get(office.id)?.frameName).toBe('unit.officeS.variantA.occupied')
    expect(layer.activityUnits.get(apartment.id)?.frameName).toBe('unit.aptStudio.variantB.occupied')
    expect(layer.activityUnits.get(restroom.id)?.frameName).toBe('unit.restroom.occupied')
    expect(layer.activityUnits.get(fastFood.id)?.frameName).toBe('unit.fastfood.vacant')

    disposeStyleGateArtLayer(layer)
  })
})

describe('shaft machinery art', () => {
  it('renders both cap sprites for every shaft kind and rebuilds only with structure changes', () => {
    const state = makeTestState()
    setStars(state, 4)
    for (let floor = 0; floor <= 2; floor += 1) {
      placeSlabRow(state, floor, 0, 40)
    }
    const kinds = ['standard', 'express', 'service', 'glass'] as const
    kinds.forEach((kind, index) => placeShaft(state, kind, 4 + index * 8, 0, 2))

    const layer = makeLoadedStyleGateLayer()
    layer.texture!.userData.cached = true
    syncStyleGateArt(layer, state, prepareTestSceneFrame(state), 'detail', 0)

    // Every shaft's top+bottom cap batches into ONE merged cap mesh (one draw call),
    // so there are kinds*2 cap quads → kinds*2*4 vertices, not a mesh per cap.
    const caps = layer.structureGroup.getObjectByName(STYLE_GATE_MERGED_SHAFT_CAPS) as THREE.Mesh
    expect(caps).toBeDefined()
    expect(caps.geometry.getAttribute('position').count).toBe(kinds.length * 2 * 4)
    // Top-cap (y center 3*FLOOR_H+FLOOR_H/2) and bottom-cap (y center -FLOOR_H/2) corners
    // are baked into the vertex buffer: top corners at 3*FLOOR_H / 4*FLOOR_H, bottom at -FLOOR_H / 0.
    const capYs = new Set<number>()
    const capPos = caps.geometry.getAttribute('position')
    for (let i = 0; i < capPos.count; i += 1) {
      capYs.add(Number(capPos.getY(i).toFixed(4)))
    }
    expect(capYs.has(Number((3 * FLOOR_H).toFixed(4)))).toBe(true)
    expect(capYs.has(Number((-FLOOR_H).toFixed(4)))).toBe(true)

    syncStyleGateArt(layer, state, prepareTestSceneFrame(state), 'detail', 0)
    // No structureVersion change → the same merged cap mesh object persists (no rebuild).
    expect(layer.structureGroup.getObjectByName(STYLE_GATE_MERGED_SHAFT_CAPS)).toBe(caps)

    const geometryDispose = jest.spyOn(caps.geometry, 'dispose')
    const materialDispose = jest.spyOn(caps.material as THREE.Material, 'dispose')
    state.structureVersion += 1
    syncStyleGateArt(layer, state, prepareTestSceneFrame(state), 'detail', 0)
    expect(geometryDispose).toHaveBeenCalledTimes(1)
    expect(materialDispose).toHaveBeenCalledTimes(1)

    const rebuiltCaps = layer.structureGroup.getObjectByName(STYLE_GATE_MERGED_SHAFT_CAPS) as THREE.Mesh
    const rebuiltGeometryDispose = jest.spyOn(rebuiltCaps.geometry, 'dispose')
    const rebuiltMaterialDispose = jest.spyOn(rebuiltCaps.material as THREE.Material, 'dispose')
    disposeStyleGateArtLayer(layer)
    expect(rebuiltGeometryDispose).toHaveBeenCalledTimes(1)
    expect(rebuiltMaterialDispose).toHaveBeenCalledTimes(1)
    expect(layer.group.parent).toBeNull()
  })
})

describe('elevator stop labels and click mapping', () => {
  it('formats floor stop labels using the HUD floor convention', () => {
    expect(floorLabel(42)).toBe('42')
    expect(floorLabel(1)).toBe('1')
    expect(floorLabel(0)).toBe('0')
    expect(floorLabel(-2)).toBe('B2')
  })

  it('emits labels only for enabled stops using the shared floor convention', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 12)
    placeSlabRow(state, 1, 0, 12)
    placeSlabRow(state, 2, 0, 12)
    const shaftId = placeShaft(state, 'standard', 4, 0, 2)
    const shaft = state.shafts.find((candidate) => candidate.id === shaftId)!
    shaft.stops = [-2, 0, 2, 42]
    shaft.enabledStops = [-2, 0, 42]

    expect(elevatorStopLabels(state.shafts).map((label) => [label.floor, label.label])).toEqual([
      [-2, floorLabel(-2)],
      [0, '0'],
      [42, floorLabel(42)],
    ])
  })

  it('maps plain shaft clicks to stop-toggle commands', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 12)
    placeSlabRow(state, 1, 0, 12)
    placeSlabRow(state, 2, 0, 12)
    const shaftId = placeShaft(state, 'standard', 4, 0, 2)
    const shaft = state.shafts.find((candidate) => candidate.id === shaftId)!
    shaft.enabledStops = [0, 2]

    expect(stopToggleCommandAt(state, { floor: 2, x: 4 })).toEqual({ type: 'setStopEnabled', shaftId, floor: 2, enabled: false })
    expect(stopToggleCommandAt(state, { floor: 1, x: 4 })).toEqual({ type: 'setStopEnabled', shaftId, floor: 1, enabled: true })
    expect(stopToggleCommandAt(state, { floor: 1, x: 9 })).toBeNull()
  })

  it('suppresses click toggles while dragging or using a build tool', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 12)
    placeSlabRow(state, 1, 0, 12)
    const shaftId = placeShaft(state, 'standard', 4, 0, 1)

    expect(stopToggleCommandForClick(state, { floor: 1, x: 4 }, { moved: false, toolActive: false })).toEqual({
      type: 'setStopEnabled',
      shaftId,
      floor: 1,
      enabled: false,
    })
    expect(stopToggleCommandForClick(state, { floor: 1, x: 4 }, { moved: true, toolActive: false })).toBeNull()
    expect(stopToggleCommandForClick(state, { floor: 1, x: 4 }, { moved: false, toolActive: true })).toBeNull()
  })

  it('does not rebuild the label pass when structureVersion is unchanged', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 12)
    placeSlabRow(state, 1, 0, 12)
    placeShaft(state, 'standard', 4, 0, 1)

    const scene = new THREE.Scene()
    const layer = createStructureLayer(scene)
    syncStructure(layer, state)
    const children = layer.rebuilt.children.slice()

    syncStructure(layer, state)

    expect(layer.rebuilt.children).toEqual(children)
  })

  it('reuses cached stop-label textures across structure rebuilds and keeps cached maps undisposed', () => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
    let canvasCount = 0
    const context = {
      clearRect: jest.fn(),
      fillRect: jest.fn(),
      strokeRect: jest.fn(),
      fillText: jest.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: 'center',
      textBaseline: 'middle',
    } as unknown as CanvasRenderingContext2D
    const fakeDocument = {
      createElement: (tagName: string): HTMLCanvasElement => {
        expect(tagName).toBe('canvas')
        canvasCount += 1
        return {
          width: 0,
          height: 0,
          getContext: (type: string): CanvasRenderingContext2D | null => (type === '2d' ? context : null),
        } as unknown as HTMLCanvasElement
      },
    } as unknown as Document
    Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument })

    try {
      const state = makeTestState()
      placeSlabRow(state, 0, 0, 12)
      placeSlabRow(state, 1, 0, 12)
      const shaftId = placeShaft(state, 'standard', 4, 0, 1)
      const shaft = state.shafts.find((candidate) => candidate.id === shaftId)!
      shaft.stops = [41, 42]
      shaft.enabledStops = [41, 42]

      const scene = new THREE.Scene()
      const layer = createStructureLayer(scene)
      syncStructure(layer, state)
      const firstTextures = labelTextures(layer)
      const disposeSpies = firstTextures.map((texture) => jest.spyOn(texture, 'dispose'))
      expect(canvasCount).toBe(2)
      expect(firstTextures).toHaveLength(2)
      expect(firstTextures.every((texture) => texture.userData.cached === true)).toBe(true)

      state.structureVersion += 1
      syncStructure(layer, state)

      expect(canvasCount).toBe(2)
      expect(labelTextures(layer)).toEqual(firstTextures)
      for (const spy of disposeSpies) {
        expect(spy).not.toHaveBeenCalled()
      }
    } finally {
      if (previousDocument) {
        Object.defineProperty(globalThis, 'document', previousDocument)
      } else {
        Reflect.deleteProperty(globalThis, 'document')
      }
    }
  })
})

function labelTextures(layer: ReturnType<typeof createStructureLayer>): THREE.Texture[] {
  const textures: THREE.Texture[] = []
  layer.rebuilt.traverse((child) => {
    const material = (child as THREE.Mesh).material
    if (!Array.isArray(material) && material instanceof THREE.MeshBasicMaterial && material.map) {
      textures.push(material.map)
    }
  })
  return textures
}
