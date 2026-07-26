import * as THREE from 'three'

import { makeTestState, placeShaft, placeSlabRow } from '../../engine/__tests__/testState'
import { type EngineState, GRID_WIDTH, type Person, type Shaft } from '../../gameTypes'
import { createDynamicPools, disposeDynamicPools, syncDynamic } from '../dynamicPools'
import {
  QUEUE_ICON_HEIGHT,
  QUEUE_ICON_WIDTH,
  QUEUE_ICON_Z,
  QUEUE_RENDER_MAX,
  QUEUE_SLOT_SPACING,
  queueOverflowBadgeX,
  queueSlotX,
} from '../elevatorQueues'
import { createCarGlideStore, prepareSceneFrame } from '../sceneFrame'
import type { StyleGateArtLayer } from '../styleGateArt'
import { disposeStyleGateArtLayer, syncStyleGateArt } from '../styleGateArt'

function renderPerson(id: number, overrides: Partial<Person> = {}): Person {
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

function queuedPerson(id: number, shaftId: number): Person {
  return renderPerson(id, {
    state: 'queued',
    x: 99,
    legs: [{ type: 'elevator', fromFloor: 0, fromX: 99, toFloor: 1, toX: 99, shaftId }],
  })
}

function stateWithShaft(x = 4): { state: EngineState; shaft: Shaft } {
  const state = makeTestState()
  placeSlabRow(state, 0, 0, GRID_WIDTH - 1)
  placeSlabRow(state, 1, 0, GRID_WIDTH - 1)
  const shaftId = placeShaft(state, 'standard', x, 0, 1)
  return { state, shaft: state.shafts.find((candidate) => candidate.id === shaftId)! }
}

function instanceTransform(mesh: THREE.InstancedMesh, index: number): { position: THREE.Vector3; scale: THREE.Vector3 } {
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  mesh.getMatrixAt(index, matrix)
  matrix.decompose(position, new THREE.Quaternion(), scale)
  return { position, scale }
}

function loadedStyleGateLayer(): StyleGateArtLayer {
  const group = new THREE.Group()
  const structureGroup = new THREE.Group()
  const dynamicGroup = new THREE.Group()
  const texture = new THREE.Texture()
  texture.userData.cached = true
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
    texture,
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

describe('door-anchored elevator queues', () => {
  it('places the head nearest the door, grows toward available space, and clamps at grid edges', () => {
    const left = stateWithShaft(0).shaft
    const right = stateWithShaft(GRID_WIDTH - 2).shaft

    expect(queueSlotX(left, 0)).toBeGreaterThan(left.x + 2)
    expect(queueSlotX(left, 1) - queueSlotX(left, 0)).toBeCloseTo(QUEUE_SLOT_SPACING)
    expect(queueSlotX(right, 0)).toBeLessThan(right.x)
    expect(queueSlotX(right, 0) - queueSlotX(right, 1)).toBeCloseTo(QUEUE_SLOT_SPACING)
    expect(queueSlotX(left, 1)).toBeGreaterThan(queueSlotX(left, 0))
    expect(queueSlotX(right, 1)).toBeLessThan(queueSlotX(right, 0))
    expect(queueSlotX(left, 10_000)).toBeLessThanOrEqual(GRID_WIDTH - QUEUE_ICON_WIDTH / 2)
    expect(queueSlotX(right, 10_000)).toBeGreaterThanOrEqual(QUEUE_ICON_WIDTH / 2)
  })

  it('shares arrival ranks, caps icons, and anchors the overflow badge in the fallback renderer', () => {
    const { state, shaft } = stateWithShaft()
    state.people = Array.from({ length: QUEUE_RENDER_MAX + 2 }, (_, index) => queuedPerson(index + 1, shaft.id))
    const frame = prepareSceneFrame(state, createCarGlideStore(), 0)
    const scene = new THREE.Scene()
    const pools = createDynamicPools(scene)

    syncDynamic(pools, state, frame)

    expect(pools.persons.count).toBe(QUEUE_RENDER_MAX)
    expect(pools.badges.count).toBe(1)
    expect(pools.personVisual.get(1)?.x).toBe(queueSlotX(shaft, 0))
    expect(pools.personVisual.get(2)?.x).toBe(queueSlotX(shaft, 1))
    expect(pools.personVisual.has(QUEUE_RENDER_MAX + 1)).toBe(false)
    const first = instanceTransform(pools.persons, 0)
    expect(first.scale.x).toBeCloseTo(QUEUE_ICON_WIDTH)
    expect(first.scale.y).toBeCloseTo(QUEUE_ICON_HEIGHT)
    expect(first.position.z + pools.persons.position.z).toBeCloseTo(QUEUE_ICON_Z)
    expect(first.position.z + pools.persons.position.z).toBeGreaterThan(pools.bars.position.z)
    expect(instanceTransform(pools.badges, 0).position.x).toBeCloseTo(queueOverflowBadgeX(shaft))

    disposeDynamicPools(pools)
  })

  it('uses the same capped door slots in the atlas renderer', () => {
    const { state, shaft } = stateWithShaft()
    state.people = Array.from({ length: QUEUE_RENDER_MAX + 2 }, (_, index) => queuedPerson(index + 1, shaft.id))
    const layer = loadedStyleGateLayer()

    syncStyleGateArt(layer, state, prepareSceneFrame(state, createCarGlideStore(), 0), 'detail', 0)

    expect(layer.personVisual.size).toBe(QUEUE_RENDER_MAX)
    expect(layer.personVisual.get(1)?.x).toBe(queueSlotX(shaft, 0))
    expect(layer.personVisual.get(2)?.x).toBe(queueSlotX(shaft, 1))
    expect(layer.personVisual.has(QUEUE_RENDER_MAX + 1)).toBe(false)
    const people = layer.dynamicMeshes.get('person.low.sample')!
    const variedPeople = layer.dynamicMeshes.get('person.low.variantB.sample')!
    expect(people.count + variedPeople.count).toBe(QUEUE_RENDER_MAX)
    const first = instanceTransform(people, 0)
    expect(first.scale.x).toBeCloseTo(QUEUE_ICON_WIDTH)
    expect(first.scale.y).toBeCloseTo(QUEUE_ICON_HEIGHT)
    expect(first.position.z + people.position.z).toBeCloseTo(QUEUE_ICON_Z)

    disposeStyleGateArtLayer(layer)
  })

  it('glides on join and advance, tracks the car on boarding, and removes stale visual state', () => {
    const { state, shaft } = stateWithShaft()
    const head = renderPerson(1, { x: 0 })
    const next = queuedPerson(2, shaft.id)
    state.people = [head]
    const glides = createCarGlideStore()
    const scene = new THREE.Scene()
    const pools = createDynamicPools(scene)
    syncDynamic(pools, state, prepareSceneFrame(state, glides, 0))

    head.state = 'queued'
    head.legs = [{ type: 'elevator', fromFloor: 0, fromX: 0, toFloor: 1, toX: 0, shaftId: shaft.id }]
    state.people.push(next)
    syncDynamic(pools, state, prepareSceneFrame(state, glides, 0.1), 0.1)
    expect(pools.personVisual.get(head.id)!.x).toBeGreaterThan(0)
    expect(pools.personVisual.get(head.id)!.x).toBeLessThan(queueSlotX(shaft, 0))
    expect(pools.personVisual.get(next.id)!.x).toBe(queueSlotX(shaft, 1))

    state.people = [next]
    syncDynamic(pools, state, prepareSceneFrame(state, glides, 0.01), 0.01)
    expect(pools.personVisual.get(next.id)!.x).toBeLessThan(queueSlotX(shaft, 1))
    expect(pools.personVisual.get(next.id)!.x).toBeGreaterThan(queueSlotX(shaft, 0))

    next.state = 'riding'
    shaft.cars[0]!.passengerIds = [next.id]
    shaft.cars[0]!.y = 0.75
    const ridingFrame = prepareSceneFrame(state, glides, 0)
    syncDynamic(pools, state, ridingFrame)
    expect(pools.personVisual.get(next.id)?.floor).toBe(ridingFrame.riderY.get(next.id))

    state.people = []
    syncDynamic(pools, state, prepareSceneFrame(state, glides, 0))
    expect(pools.personVisual.size).toBe(0)
    syncDynamic(pools, state, prepareSceneFrame(state, glides, 0))
    expect(pools.personVisual.size).toBe(0)

    disposeDynamicPools(pools)
  })
})
