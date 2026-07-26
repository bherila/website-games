/**
 * Reduced motion is presentation-only. These tests pin the two properties that
 * make it safe: precipitation stops scrolling, and glides SNAP to the
 * authoritative position rather than freezing part-way toward it.
 */
import * as THREE from 'three'

import { makeTestState, placeShaft, placeSlabRow } from '../../engine/__tests__/testState'
import { createEngineState } from '../../engine/engine'
import { approach, CAR_VISUAL_FLOORS_PER_SEC, createCarGlideStore, prepareSceneFrame } from '../sceneFrame'
import { applyWeather, createStructureLayer, disposeStructureLayer, type StructureLayer, syncStructure } from '../structureMesh'
import { weatherForDay, type WeatherKind } from '../weather'

function firstDayWith(kind: WeatherKind): number {
  for (let day = 1; day < 5000; day++) {
    if (weatherForDay(day) === kind) {
      return day
    }
  }
  throw new Error(`no day produced weather kind ${kind}`)
}

function makeLayer(): StructureLayer {
  return createStructureLayer(new THREE.Scene())
}

function offsetOf(mesh: THREE.Mesh): { x: number; y: number } {
  const map = (mesh.material as THREE.MeshBasicMaterial).map
  if (!map) {
    throw new Error('precipitation mesh has no texture map')
  }
  return { x: map.offset.x, y: map.offset.y }
}

describe('reduced motion — precipitation', () => {
  it('keeps precipitation visible but pins its scroll phase across the day', () => {
    const layer = makeLayer()
    const rainDay = firstDayWith('rain')

    applyWeather(layer, 0, rainDay, true)
    const atMidnight = offsetOf(layer.rainMesh)
    applyWeather(layer, 13 * 60, rainDay, true)
    const atAfternoon = offsetOf(layer.rainMesh)

    // Still rendered — weather is information, not decoration.
    expect(layer.rainMesh.visible).toBe(true)
    expect(atAfternoon).toEqual(atMidnight)
    disposeStructureLayer(layer)
  })

  it('still scrolls when reduced motion is off', () => {
    const layer = makeLayer()
    const rainDay = firstDayWith('rain')

    applyWeather(layer, 0, rainDay, false)
    const early = offsetOf(layer.rainMesh)
    applyWeather(layer, 13 * 60, rainDay, false)

    expect(offsetOf(layer.rainMesh)).not.toEqual(early)
    disposeStructureLayer(layer)
  })

  it('does not change which weather occurs — only whether it animates', () => {
    const snowDay = firstDayWith('snow')
    const reduced = makeLayer()
    const full = makeLayer()

    applyWeather(reduced, 9 * 60, snowDay, true)
    applyWeather(full, 9 * 60, snowDay, false)

    expect(reduced.snowMesh.visible).toBe(full.snowMesh.visible)
    expect(reduced.rainMesh.visible).toBe(full.rainMesh.visible)
    expect((reduced.snowMesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(
      (full.snowMesh.material as THREE.MeshBasicMaterial).opacity,
    )
    disposeStructureLayer(reduced)
    disposeStructureLayer(full)
  })

  it('keeps the Niagara waterfall visible but freezes its phase', () => {
    const layer = makeLayer()
    const state = createEngineState({ seed: 41, mapId: 'niagara-falls', lobbyHeight: 1 })
    syncStructure(layer, state)

    applyWeather(layer, 0, 1, true)
    const opening = offsetOf(layer.waterfallMesh)
    const mistOpening = Array.from(layer.waterfallMist.geometry.getAttribute('position').array)
    applyWeather(layer, 13 * 60, 1, true)

    expect(layer.waterfallMesh.visible).toBe(true)
    expect(layer.waterfallMist.visible).toBe(true)
    expect(offsetOf(layer.waterfallMesh)).toEqual(opening)
    expect(Array.from(layer.waterfallMist.geometry.getAttribute('position').array)).toEqual(mistOpening)

    applyWeather(layer, 13 * 60, 1, false)
    expect(offsetOf(layer.waterfallMesh)).not.toEqual(opening)
    expect(Array.from(layer.waterfallMist.geometry.getAttribute('position').array)).not.toEqual(mistOpening)
    disposeStructureLayer(layer)
  })
})

describe('reduced motion — glide snapping', () => {
  it('an unbounded step lands exactly on the target instead of freezing', () => {
    // This is the property `SNAP_DT_SEC` relies on in sceneController.
    expect(approach(0, 12, Number.POSITIVE_INFINITY * CAR_VISUAL_FLOORS_PER_SEC, 14)).toBe(12)
    // A zero step — the naive "no motion" choice — would freeze instead.
    expect(approach(0, 12, 0, 14)).toBe(0)
  })

  it('snaps car visuals onto authoritative positions in one frame', () => {
    const state = makeTestState()
    // A shaft only validates against floors that exist to land on.
    for (let floor = 0; floor <= 8; floor += 1) {
      placeSlabRow(state, floor, 0, 20)
    }
    const shaftId = placeShaft(state, 'standard', 4, 0, 8)
    const shaft = state.shafts.find((s) => s.id === shaftId)!
    shaft.cars[0]!.y = 6

    const glides = createCarGlideStore()
    // Seed the glide cache at the bottom so there is real distance to cover.
    prepareSceneFrame(state, glides, 0)
    glides.carVisual.get(`${shaftId}:0`)!.y = 0

    prepareSceneFrame(state, glides, Number.POSITIVE_INFINITY)

    expect(glides.carVisual.get(`${shaftId}:0`)!.y).toBe(6)
  })
})
