import { makeTestState, placeSlabRow } from '../../engine/__tests__/testState'
import { FLOOR_MAX, FLOOR_MIN } from '../../gameTypes'
import { type CameraRig, cameraViewport, clampToState, createCameraRig, fitAll, goToFloor, zoomBy } from '../camera'
import { FLOOR_H } from '../palette'

/** An arbitrarily tight zoom to prove `fitAll` widens from wherever it starts. */
const MIN_FIT_PROBE = 1.5 * FLOOR_H

describe('camera floor navigation', () => {
  it('centers legal floors and preserves zoom', () => {
    const rig = createCameraRig(1)
    rig.extents = { minX: -10_000, maxX: 10_000, minY: -10_000, maxY: 10_000 }
    rig.halfHeight = 9

    goToFloor(rig, 37)

    expect(rig.halfHeight).toBe(9)
    expect(cameraViewport(rig).centerFloor).toBeCloseTo(37)
  })

  it('clamps requested floors to the grid range by default', () => {
    const rig = createCameraRig(1)
    rig.extents = { minX: -10_000, maxX: 10_000, minY: -10_000, maxY: 10_000 }
    rig.halfHeight = 9

    goToFloor(rig, 1_000)
    expect(rig.centerY).toBeCloseTo((FLOOR_MAX + 0.5) * FLOOR_H)
    goToFloor(rig, -1_000)
    expect(rig.centerY).toBeCloseTo((FLOOR_MIN + 0.5) * FLOOR_H)
  })

  it('clamps to the MAP range when one is supplied', () => {
    // The grid spans every map's extremes at once. Clamping to it would let the
    // camera fly into floors the active map can never contain — a city tower
    // could scroll down into Niagara's gorge depth.
    const rig = createCameraRig(1)
    rig.extents = { minX: -10_000, maxX: 10_000, minY: -10_000, maxY: 10_000 }
    rig.halfHeight = 9
    const cityRange = { min: -10, max: 99 }

    goToFloor(rig, -1_000, cityRange)
    expect(rig.centerY).toBeCloseTo(-9.5 * FLOOR_H)
    goToFloor(rig, 1_000, cityRange)
    expect(rig.centerY).toBeCloseTo(99.5 * FLOOR_H)
  })

  it('clamps jumps above a built tower like manual panning', () => {
    const state = makeTestState()
    for (let floor = 0; floor <= 10; floor += 1) {
      placeSlabRow(state, floor, 0, 20)
    }
    const rig = createCameraRig(1)
    rig.halfHeight = 1.5 * FLOOR_H
    clampToState(rig, state)

    goToFloor(rig, 99)

    expect(rig.centerY).toBeCloseTo(rig.extents.maxY - rig.halfHeight)
    expect(rig.halfHeight).toBe(1.5 * FLOOR_H)
  })

  it('allows an empty Niagara lot to navigate down the falls', () => {
    const state = makeTestState({ mapId: 'niagara-falls' })
    const rig = createCameraRig(1)
    clampToState(rig, state)

    goToFloor(rig, -15, { min: -30, max: 15 })

    expect(cameraViewport(rig).centerFloor).toBeCloseTo(-15)
  })

  it('recomputes extents when the map changes at an equal structureVersion', () => {
    // structureVersion is restored from the save, so loading a different map can
    // present the version the rig already cached. Extents are map-relative.
    const city = makeTestState()
    const falls = makeTestState({ mapId: 'niagara-falls' })
    expect(falls.structureVersion).toBe(city.structureVersion)

    const rig = createCameraRig(1)
    clampToState(rig, city)
    const cityExtents = { ...rig.extents }

    clampToState(rig, falls)

    expect(rig.extents.minY).toBeLessThan(cityExtents.minY)
    expect(rig.extents.minY).toBeCloseTo(-30 * FLOOR_H - 4 * FLOOR_H)
  })
})

describe('camera fit', () => {
  function towerRig(topFloor: number, bottomFloor = 0): CameraRig {
    // Underground slabs need 3★; the fit maths does not care, but placement does.
    const state = makeTestState({ star: 3, maxStarReached: 3 })
    for (let floor = 0; floor <= topFloor; floor += 1) {
      placeSlabRow(state, floor, 0, 20)
    }
    // Basements need the floor above them to already exist, so dig downward.
    for (let floor = -1; floor >= bottomFloor; floor -= 1) {
      placeSlabRow(state, floor, 0, 20)
    }
    const rig = createCameraRig(1)
    clampToState(rig, state)
    return rig
  }

  it('fits the whole built tower vertically', () => {
    const rig = towerRig(30)
    rig.halfHeight = MIN_FIT_PROBE

    fitAll(rig)

    const view = cameraViewport(rig)
    expect(view.minFloor).toBeLessThanOrEqual(0)
    expect(view.maxFloor).toBeGreaterThanOrEqual(30)
  })

  it('lands exactly on the manual zoom-out ceiling, never past it', () => {
    const rig = towerRig(30)

    fitAll(rig)
    const fitted = rig.halfHeight
    // Asking to zoom out further must be a no-op: fit IS the ceiling, so the
    // button can never leave the camera somewhere manual zoom cannot reach.
    zoomBy(rig, 4)

    expect(rig.halfHeight).toBeCloseTo(fitted)
  })

  it('includes underground floors when the tower is dug in', () => {
    const rig = towerRig(10, -5)

    fitAll(rig)

    const view = cameraViewport(rig)
    expect(view.minFloor).toBeLessThanOrEqual(-5)
    expect(view.maxFloor).toBeGreaterThanOrEqual(10)
  })

  it('stays within the minimum zoom on an empty tower', () => {
    const rig = createCameraRig(1)

    fitAll(rig)

    expect(Number.isFinite(rig.halfHeight)).toBe(true)
    expect(rig.halfHeight).toBeGreaterThan(0)
  })

  it('survives a wide viewport where width, not height, is the binding constraint', () => {
    const rig = towerRig(2)
    rig.aspect = 0.25

    fitAll(rig)

    expect(Number.isFinite(rig.halfHeight)).toBe(true)
    expect(cameraViewport(rig).maxFloor).toBeGreaterThanOrEqual(2)
  })
})
