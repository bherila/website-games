import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import { CarsGame } from '../CarsGame'
import { CarsScene } from '../CarsScene'
import { createInitialProgress, GAME_PROGRESS_STORAGE_KEY, generateLevel, LEVEL_SNAPSHOT_STORAGE_KEY, moveCarToParking, saveLevelSnapshot, saveProgress } from '../gameEngine'

jest.mock('../audio/audioManager', () => ({ playSfx: jest.fn(), preloadSfx: jest.fn(() => Promise.resolve()), setMuted: jest.fn() }))
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
      shadowMap: { enabled: false },
      setPixelRatio: jest.fn(),
      setSize: jest.fn(),
      render: jest.fn(),
      dispose: jest.fn(),
    })),
  }
})

interface RendererStub {
  domElement: HTMLCanvasElement
  render: jest.Mock<void, [THREE.Scene, THREE.Camera]>
  dispose: jest.Mock
}
function renderer(): RendererStub {
  return jest.mocked(THREE.WebGLRenderer).mock.results.at(-1)?.value as RendererStub
}
const props = () => ({ state: generateLevel(1), colorblindMode: false, blockedCarAttempt: null, vipSelectionActive: false, onCarClick: jest.fn(), onPassengerGate: jest.fn(), onReadyChange: jest.fn() })

beforeEach(() => {
  localStorage.clear()
  jest.clearAllMocks()
  jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    save: jest.fn(), restore: jest.fn(), arc: jest.fn(), ellipse: jest.fn(), fillRect: jest.fn(), clearRect: jest.fn(), beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(), quadraticCurveTo: jest.fn(), closePath: jest.fn(), fill: jest.fn(), stroke: jest.fn(), strokeText: jest.fn(), fillText: jest.fn(),
  } as unknown as CanvasRenderingContext2D)
})
afterEach(() => jest.restoreAllMocks())

it.each(['renderer', 'configuration', 'environment', 'resize', 'first frame', 'cleanup'] as const)('recovers from %s failure without stale resources or callbacks', (failure) => {
  const constructor = jest.mocked(THREE.WebGLRenderer)
  const working = constructor.getMockImplementation()!
  if (failure === 'renderer') constructor.mockImplementationOnce(() => { throw new Error('No WebGL') })
  else if (failure === 'environment') {
    const pmrem = jest.mocked(THREE.PMREMGenerator)
    const implementation = pmrem.getMockImplementation()!
    pmrem.mockImplementationOnce((...args) => {
      const instance = implementation(...args)
      jest.mocked(instance.fromScene).mockImplementationOnce(() => { throw new Error('No environment') })
      return instance
    })
  } else constructor.mockImplementationOnce((...args) => {
    const instance = working(...args)
    const method = failure === 'configuration' ? instance.setPixelRatio : failure === 'resize' ? instance.setSize : instance.render
    jest.mocked(method).mockImplementationOnce(() => { throw new Error('Initialization failed') })
    if (failure === 'cleanup') jest.mocked(instance.dispose).mockImplementationOnce(() => { throw new Error('Cleanup failed') })
    return instance
  })
  const initial = props()
  const view = render(<CarsScene {...initial} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Your level is paused')
  expect(view.container.querySelector('canvas')).toBeNull()
  expect(initial.onReadyChange).toHaveBeenLastCalledWith(false)
  expect(requestAnimationFrame).not.toHaveBeenCalled()
  if (failure !== 'renderer') expect(renderer().dispose).toHaveBeenCalledTimes(1)
  const next = { ...initial.state, cars: initial.state.cars.slice(1) }
  view.rerender(<CarsScene {...initial} colorblindMode state={next} />)
  expect(constructor).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
  expect(initial.onReadyChange).toHaveBeenLastCalledWith(true)
  const scene = renderer().render.mock.calls.at(-1)![0]
  const ids = new Set<string>()
  scene.traverse((object) => { if (typeof object.userData.carId === 'string') ids.add(object.userData.carId) })
  expect(ids).toEqual(new Set(next.cars.map((car) => car.id)))
  const staleFrame = jest.mocked(requestAnimationFrame).mock.calls.at(-1)![0]
  const current = renderer()
  view.unmount()
  act(() => staleFrame(performance.now()))
  expect(current.render).toHaveBeenCalledTimes(1)
  expect(current.dispose).toHaveBeenCalledTimes(1)
})

it('disposes environment, shadow maps and scene resources before the renderer', () => {
  const roomDispose = jest.spyOn(RoomEnvironment.prototype, 'dispose')
  const shadowDispose = jest.spyOn(THREE.LightShadow.prototype, 'dispose')
  const view = render(<CarsScene {...props()} />)
  const current = renderer()
  const scene = current.render.mock.calls.at(-1)![0]
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>()
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (mesh.geometry && mesh.geometry.userData.cached !== true) resources.add(mesh.geometry)
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (!material) continue
      resources.add(material)
      const map = (material as THREE.MeshBasicMaterial).map
      if (map && map.userData.cached !== true) resources.add(map)
    }
  })
  const disposals = [...resources].map((resource) => jest.spyOn(resource, 'dispose'))
  const environment = jest.mocked(THREE.PMREMGenerator).mock.results.at(-1)!.value.fromScene.mock.results[0].value as THREE.WebGLRenderTarget
  const environmentDispose = jest.spyOn(environment, 'dispose')
  view.unmount()
  expect(roomDispose).toHaveBeenCalledTimes(1)
  expect(shadowDispose).toHaveBeenCalledTimes(2)
  expect(environmentDispose).toHaveBeenCalledTimes(1)
  expect(scene.environment).toBeNull()
  for (const disposal of [...disposals, environmentDispose, shadowDispose]) {
    expect(disposal).toHaveBeenCalled()
    for (const call of disposal.mock.invocationCallOrder) expect(call).toBeLessThan(current.dispose.mock.invocationCallOrder[0]!)
  }
})

it('preserves the real parent board, progress and preferences through repeated StrictMode failures and menu resume', () => {
  const progress = { ...createInitialProgress(), unlockedLevel: 3, powerUps: { vip: 2, shuffle: 2, fill: 2 } }
  saveProgress(progress)
  const initial = { ...generateLevel(1), powerUps: progress.powerUps }
  const moving = moveCarToParking(initial, initial.cars[0]!.id)
  expect(moving.moves).toBe(1)
  saveLevelSnapshot(moving)
  const savedBoard = localStorage.getItem(LEVEL_SNAPSHOT_STORAGE_KEY)
  const savedProgress = localStorage.getItem(GAME_PROGRESS_STORAGE_KEY)
  const constructor = jest.mocked(THREE.WebGLRenderer)
  const working = constructor.getMockImplementation()!
  constructor.mockImplementation(() => { throw new Error('No WebGL') })
  const view = render(<StrictMode><CarsGame /></StrictMode>)
  expect(constructor).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  expect(screen.getByRole('alert')).toBeVisible()
  for (const name of ['VIP', 'Shuffle', 'Fill', 'Open Spot', 'Reset']) expect(screen.getByRole('button', { name })).toBeDisabled()
  for (const name of ['Level select', 'Tutorial', 'Mute sound']) expect(screen.getByRole('button', { name })).toBeEnabled()
  fireEvent.click(screen.getByLabelText('Colorblind mode', { selector: '#cars-colorblind-desktop' }))
  expect(localStorage.getItem('bwh.cars-game.colorblind.v1')).toBe('1')
  expect(localStorage.getItem(LEVEL_SNAPSHOT_STORAGE_KEY)).toBe(savedBoard)
  expect(localStorage.getItem(GAME_PROGRESS_STORAGE_KEY)).toBe(savedProgress)
  fireEvent.click(screen.getByRole('button', { name: 'Level select' }))
  fireEvent.click(screen.getByTestId('level-tile-1'))
  expect(screen.getByRole('alert')).toBeVisible()
  constructor.mockImplementation(working)
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'VIP' })).toBeEnabled()
  expect(localStorage.getItem(LEVEL_SNAPSHOT_STORAGE_KEY)).toBe(savedBoard)
  expect(localStorage.getItem(GAME_PROGRESS_STORAGE_KEY)).toBe(savedProgress)
  view.unmount()
})

it('replays a successful StrictMode setup with one active canvas and loop', () => {
  const view = render(<StrictMode><CarsScene {...props()} /></StrictMode>)
  const results = jest.mocked(THREE.WebGLRenderer).mock.results
  expect(results).toHaveLength(2)
  const first = results[0]!.value as RendererStub
  const second = results[1]!.value as RendererStub
  expect(first.dispose).toHaveBeenCalledTimes(1)
  expect(second.dispose).not.toHaveBeenCalled()
  expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
  const callbacks = jest.mocked(requestAnimationFrame).mock.calls.map(([callback]) => callback)
  act(() => callbacks[0]!(performance.now()))
  expect(first.render).toHaveBeenCalledTimes(1)
  expect(requestAnimationFrame).toHaveBeenCalledTimes(2)
  act(() => callbacks[1]!(performance.now()))
  expect(second.render).toHaveBeenCalledTimes(2)
  expect(requestAnimationFrame).toHaveBeenCalledTimes(3)
  view.unmount()
  expect(second.dispose).toHaveBeenCalledTimes(1)
})
