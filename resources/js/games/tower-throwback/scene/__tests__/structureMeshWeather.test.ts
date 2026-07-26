import * as THREE from 'three'

import { makeTestState } from '../../engine/__tests__/testState'
import { createEngineState, stepEngine } from '../../engine/engine'
import { getMap } from '../../engine/maps'
import { FLOOR_H } from '../palette'
import { applyTimeOfDay, applyWeather, createStructureLayer, disposeStructureLayer, type StructureLayer, syncStructure } from '../structureMesh'
import { weatherForDay,type WeatherKind } from '../weather'

function firstDayWith(kind: WeatherKind): number {
  for (let day = 1; day < 5000; day++) {
    if (weatherForDay(day) === kind) {
      return day
    }
  }
  throw new Error(`no day produced weather kind ${kind}`)
}

function makeLayer(): { scene: THREE.Scene; layer: StructureLayer } {
  const scene = new THREE.Scene()
  return { scene, layer: createStructureLayer(scene) }
}

const NOON = 12 * 60

describe('Niagara falls geometry contract', () => {
  it('reads its waterfall placement from the map config, which must define the void', () => {
    // structureMesh derives the falls quad and mist plume from this exclusion.
    // Asserting it here keeps the invariant loud without an import-time throw
    // that would break every map's scene rather than just Niagara's.
    const gap = getMap('niagara-falls').horizontalBuildExclusions?.[0]

    expect(gap).toBeDefined()
    expect(gap!.xMaxExclusive).toBeGreaterThan(gap!.xMin)
  })
})

describe('weather precipitation layer', () => {
  it('creates exactly two precipitation quads, both initially hidden', () => {
    const { layer } = makeLayer()
    expect(layer.rainMesh.visible).toBe(false)
    expect(layer.snowMesh.visible).toBe(false)
    // Bounded object count: only the two precip meshes carry a texture map.
    const textured = layer.group.children.filter(
      (child) => child instanceof THREE.Mesh && child.name.startsWith('weather.')
        && (child.material as THREE.MeshBasicMaterial).map != null,
    )
    expect(textured).toHaveLength(2)
    disposeStructureLayer(layer)
  })

  it('swaps the city earth mass for Niagara gorge presentation even when structure versions match', () => {
    const { layer } = makeLayer()
    const city = createEngineState({ seed: 11, mapId: 'city-tower', lobbyHeight: 1 })
    const falls = createEngineState({ seed: 11, mapId: 'niagara-falls', lobbyHeight: 1 })

    syncStructure(layer, city)
    expect(layer.ground.visible).toBe(true)
    expect(layer.waterfallMesh.visible).toBe(false)
    expect(layer.waterfallMist.visible).toBe(false)

    syncStructure(layer, falls)
    expect(layer.ground.visible).toBe(false)
    expect(layer.waterfallMesh.visible).toBe(true)
    expect(layer.waterfallMist.visible).toBe(true)
    expect(layer.mapId).toBe('niagara-falls')
    disposeStructureLayer(layer)
  })

  it('pins the Niagara waterfall crest to the clifftop lobby anchor', () => {
    const { layer } = makeLayer()
    const falls = createEngineState({ seed: 11, mapId: 'niagara-falls', lobbyHeight: 1 })
    syncStructure(layer, falls)

    const waterfallTop = layer.waterfallMesh.position.y + layer.waterfallMesh.scale.y / 2
    expect(waterfallTop).toBe(getMap('niagara-falls').lobbyAnchorFloor * FLOOR_H)
    const gap = getMap('niagara-falls').horizontalBuildExclusions![0]!
    expect(layer.waterfallMesh.position.x).toBe((gap.xMin + gap.xMaxExclusive) / 2)
    expect(layer.waterfallMesh.scale.x).toBe(gap.xMaxExclusive - gap.xMin)
    disposeStructureLayer(layer)
  })

  it('animates Niagara mist deterministically from simulation time', () => {
    const { layer } = makeLayer()
    const falls = createEngineState({ seed: 11, mapId: 'niagara-falls', lobbyHeight: 1 })
    syncStructure(layer, falls)

    applyWeather(layer, 100, 3)
    const positionsA = Array.from(layer.waterfallMist.geometry.getAttribute('position').array)
    applyWeather(layer, 133.7, 3)
    const positionsB = Array.from(layer.waterfallMist.geometry.getAttribute('position').array)
    expect(positionsB).not.toEqual(positionsA)

    applyWeather(layer, 100, 3)
    expect(Array.from(layer.waterfallMist.geometry.getAttribute('position').array)).toEqual(positionsA)
    disposeStructureLayer(layer)
  })

  it('shows only rain on a rain day and only snow on a snow day', () => {
    const { layer } = makeLayer()

    applyWeather(layer, NOON, firstDayWith('rain'))
    expect(layer.rainMesh.visible).toBe(true)
    expect(layer.snowMesh.visible).toBe(false)
    expect((layer.rainMesh.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0)

    applyWeather(layer, NOON, firstDayWith('snow'))
    expect(layer.rainMesh.visible).toBe(false)
    expect(layer.snowMesh.visible).toBe(true)

    applyWeather(layer, NOON, firstDayWith('clear'))
    expect(layer.rainMesh.visible).toBe(false)
    expect(layer.snowMesh.visible).toBe(false)

    disposeStructureLayer(layer)
  })

  it('scrolls precipitation deterministically with sim time and never mutates day/night state elsewhere', () => {
    const { layer } = makeLayer()
    const rainDay = firstDayWith('rain')

    applyWeather(layer, 100, rainDay)
    const offsetA = (layer.rainMesh.material as THREE.MeshBasicMaterial).map!.offset.clone()

    applyWeather(layer, 133.7, rainDay)
    const offsetB = (layer.rainMesh.material as THREE.MeshBasicMaterial).map!.offset.clone()
    expect(offsetB.equals(offsetA)).toBe(false)

    // Same (minute, day) reproduces the identical offset — pure function.
    applyWeather(layer, 100, rainDay)
    const offsetC = (layer.rainMesh.material as THREE.MeshBasicMaterial).map!.offset.clone()
    expect(offsetC.equals(offsetA)).toBe(true)

    disposeStructureLayer(layer)
  })

  it('composes a weather sky tint onto the daytime sky without disturbing night', () => {
    const clearDay = firstDayWith('clear')
    const overcastDay = firstDayWith('overcast')

    const clear = makeLayer()
    applyTimeOfDay(clear.layer, NOON, clearDay)
    const clearNoonSky = clear.layer.skyMaterial.color.getHex()

    const overcast = makeLayer()
    applyTimeOfDay(overcast.layer, NOON, overcastDay)
    const overcastNoonSky = overcast.layer.skyMaterial.color.getHex()

    // Daytime sky is tinted by overcast weather; clear leaves the base sky.
    expect(overcastNoonSky).not.toBe(clearNoonSky)

    // Deep night: weather tint is scaled to zero, so both days match the night sky.
    const clearNight = makeLayer()
    applyTimeOfDay(clearNight.layer, 2 * 60, clearDay)
    const overcastNight = makeLayer()
    applyTimeOfDay(overcastNight.layer, 2 * 60, overcastDay)
    expect(overcastNight.layer.skyMaterial.color.getHex()).toBe(clearNight.layer.skyMaterial.color.getHex())

    disposeStructureLayer(clear.layer)
    disposeStructureLayer(overcast.layer)
    disposeStructureLayer(clearNight.layer)
    disposeStructureLayer(overcastNight.layer)
  })

  it('disposes precipitation textures and detaches from the scene on rebuild', () => {
    const { scene, layer } = makeLayer()
    const rainTexture = (layer.rainMesh.material as THREE.MeshBasicMaterial).map!
    const snowTexture = (layer.snowMesh.material as THREE.MeshBasicMaterial).map!
    const rainSpy = jest.spyOn(rainTexture, 'dispose')
    const snowSpy = jest.spyOn(snowTexture, 'dispose')

    disposeStructureLayer(layer)

    expect(scene.children).not.toContain(layer.group)
    expect(rainSpy).toHaveBeenCalled()
    expect(snowSpy).toHaveBeenCalled()
  })
})

describe('weather rendering determinism', () => {
  it('consumes no rng and writes no engine state when animating weather', () => {
    const state = makeTestState()
    const { layer } = makeLayer()

    const rngBefore = state.rng.state()
    const stateBefore = JSON.stringify(state)
    for (let day = 1; day <= 40; day++) {
      for (const minute of [0, 480, 960, 1439]) {
        applyTimeOfDay(layer, minute, day)
        applyWeather(layer, minute, day)
      }
    }

    expect(state.rng.state()).toBe(rngBefore)
    expect(JSON.stringify(state)).toBe(stateBefore)
    disposeStructureLayer(layer)
  })

  it('leaves the engine rng draw count identical whether or not weather renders', () => {
    const withWeather = createEngineState({ seed: 4242, mapId: 'city-tower', lobbyHeight: 1 })
    const withoutWeather = createEngineState({ seed: 4242, mapId: 'city-tower', lobbyHeight: 1 })
    const { layer } = makeLayer()

    for (let i = 0; i < 60; i++) {
      stepEngine(withWeather, [], 1)
      // The render path runs against `withWeather` every frame.
      applyTimeOfDay(layer, withWeather.clock.minute, withWeather.clock.day)
      applyWeather(layer, withWeather.clock.minute, withWeather.clock.day)

      stepEngine(withoutWeather, [], 1)
    }

    expect(withWeather.rng.state()).toBe(withoutWeather.rng.state())
    expect(withWeather.funds).toBe(withoutWeather.funds)
    disposeStructureLayer(layer)
  })
})
