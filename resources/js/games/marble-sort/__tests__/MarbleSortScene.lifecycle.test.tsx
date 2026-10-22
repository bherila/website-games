import { act, render } from '@testing-library/react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import { generateLevel, isBoxOpenable, openBox } from '../gameEngine'
import { MarbleSortScene } from '../MarbleSortScene'

jest.mock('three', () => {
  const actual = jest.requireActual<typeof THREE>('three')
  return {
    ...actual,
    PMREMGenerator: jest.fn().mockImplementation(() => ({
      fromScene: jest.fn(() => new actual.WebGLRenderTarget(8, 8)),
      dispose: jest.fn(),
    })),
    WebGLRenderer: jest.fn().mockImplementation(() => ({
      domElement: document.createElement('canvas'),
      shadowMap: { enabled: false, autoUpdate: true, needsUpdate: false },
      setPixelRatio: jest.fn(),
      setSize: jest.fn(),
      render: jest.fn(),
      dispose: jest.fn(),
    })),
  }
})

interface RendererStub {
  shadowMap: { autoUpdate: boolean, needsUpdate: boolean }
  render: jest.Mock<void, [THREE.Scene, THREE.Camera]>
  dispose: jest.Mock
}

function renderer(): RendererStub {
  return jest.mocked(THREE.WebGLRenderer).mock.results.at(-1)?.value as RendererStub
}

function advanceFrame(): void {
  const callback = jest.mocked(window.requestAnimationFrame).mock.calls.at(-1)?.[0]
  if (!callback) {
    throw new Error('The scene did not schedule its next frame')
  }
  act(() => callback(performance.now()))
}

beforeEach(() => {
  jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createLinearGradient: () => ({ addColorStop: jest.fn() }),
    createRadialGradient: () => ({ addColorStop: jest.fn() }),
    arc: jest.fn(),
    ellipse: jest.fn(),
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    quadraticCurveTo: jest.fn(),
    closePath: jest.fn(),
    fill: jest.fn(),
    strokeText: jest.fn(),
    fillText: jest.fn(),
  } as unknown as CanvasRenderingContext2D)
})

afterEach(() => {
  jest.restoreAllMocks()
})

it('refreshes shadows while boxes and marbles move, then reuses the settled map', () => {
  const state = generateLevel(1, 41_004)
  const props = { state, colorblindMode: false, onBoxClick: jest.fn(), onMarbleArrived: jest.fn() }
  const view = render(<MarbleSortScene {...props} />)
  const current = renderer()
  const updates: boolean[] = []
  current.render.mockImplementation(() => {
    updates.push(current.shadowMap.needsUpdate)
    // WebGLShadowMap consumes the request when it has rendered the map.
    current.shadowMap.needsUpdate = false
  })

  expect(current.shadowMap.autoUpdate).toBe(false)
  advanceFrame()
  advanceFrame()
  expect(updates).toEqual([true, false])

  const box = state.boxes.find((candidate) => isBoxOpenable(candidate, state.boxes))
  if (!box) {
    throw new Error('Expected an openable box')
  }
  view.rerender(<MarbleSortScene {...props} state={openBox(state, box.id)} />)
  advanceFrame()
  advanceFrame()
  expect(updates.slice(-2)).toEqual([true, true])

  // Reset removes every moving marble; its old shadow must disappear once.
  view.rerender(<MarbleSortScene {...props} />)
  advanceFrame()
  advanceFrame()
  expect(updates.slice(-2)).toEqual([true, false])
  view.unmount()
})

it('releases the environment, shadow map, and every scene resource when leaving a level', () => {
  const roomDispose = jest.spyOn(RoomEnvironment.prototype, 'dispose')
  const shadowDispose = jest.spyOn(THREE.LightShadow.prototype, 'dispose')
  const view = render(<MarbleSortScene state={generateLevel(1, 41_004)} colorblindMode={false} onBoxClick={jest.fn()} onMarbleArrived={jest.fn()} />)
  const current = renderer()
  advanceFrame()
  const scene = current.render.mock.calls.at(-1)?.[0]
  if (!scene) {
    throw new Error('Expected a rendered scene')
  }
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>()
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (mesh.geometry) resources.add(mesh.geometry)
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (!material) continue
      resources.add(material)
      const map = (material as THREE.MeshBasicMaterial).map
      if (map) resources.add(map)
    }
  })
  if (scene.background instanceof THREE.Texture) resources.add(scene.background)
  const disposals = [...resources].map((resource) => jest.spyOn(resource, 'dispose'))
  const environment = jest.mocked(THREE.PMREMGenerator).mock.results.at(-1)?.value.fromScene.mock.results[0].value as THREE.WebGLRenderTarget
  const environmentDispose = jest.spyOn(environment, 'dispose')

  expect(roomDispose).toHaveBeenCalledTimes(1)
  view.unmount()
  for (const disposal of disposals) expect(disposal).toHaveBeenCalled()
  expect(environmentDispose).toHaveBeenCalledTimes(1)
  expect(shadowDispose).toHaveBeenCalledTimes(1)
  expect(scene.environment).toBeNull()
  expect(current.dispose).toHaveBeenCalledTimes(1)
})
