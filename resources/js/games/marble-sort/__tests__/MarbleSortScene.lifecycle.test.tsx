import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import {
  arriveFallingMarble,
  createInitialProgress,
  generateLevel,
  isBoxOpenable,
  MARBLE_SORT_PROGRESS_STORAGE_KEY,
  openBox,
  saveLevelSnapshot,
  saveProgress,
} from '../gameEngine'
import { MARBLE_SORT_SNAPSHOT_STORAGE_KEY } from '../gameProgress'
import { MarbleSortGame } from '../MarbleSortGame'
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
  domElement: HTMLCanvasElement
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
  window.localStorage.clear()
  jest.clearAllMocks()
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
  jest.useRealTimers()
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

it('rebuilds an idle shadow map after context restoration and removes the listener on unmount', () => {
  const view = render(<MarbleSortScene state={generateLevel(1, 41_004)} colorblindMode={false} onBoxClick={jest.fn()} onMarbleArrived={jest.fn()} />)
  const current = renderer()
  const updates: boolean[] = []
  current.render.mockImplementation(() => {
    updates.push(current.shadowMap.needsUpdate)
    current.shadowMap.needsUpdate = false
  })
  advanceFrame()
  advanceFrame()
  expect(updates).toEqual([true, false])

  void act(() => current.domElement.dispatchEvent(new Event('webglcontextrestored')))
  advanceFrame()
  advanceFrame()
  expect(updates.slice(-2)).toEqual([true, false])

  view.unmount()
  current.domElement.dispatchEvent(new Event('webglcontextrestored'))
  expect(current.shadowMap.needsUpdate).toBe(false)
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
  // Both directional lights own shadow resources, including the rim light.
  expect(shadowDispose).toHaveBeenCalledTimes(2)
  expect(scene.environment).toBeNull()
  expect(current.dispose).toHaveBeenCalledTimes(1)
})


it.each(['renderer', 'configuration', 'environment', 'first frame'] as const)(
  'cleans up a failed %s initialization and rebuilds the latest state on retry',
  (failure) => {
    const rendererMock = jest.mocked(THREE.WebGLRenderer)
    const rendererImplementation = rendererMock.getMockImplementation()!
    if (failure === 'renderer') {
      rendererMock.mockImplementationOnce(() => { throw new Error('WebGL unavailable') })
    } else if (failure === 'environment') {
      const pmremMock = jest.mocked(THREE.PMREMGenerator)
      const implementation = pmremMock.getMockImplementation()!
      pmremMock.mockImplementationOnce((...args) => {
        const pmrem = implementation(...args)
        jest.mocked(pmrem.fromScene).mockImplementationOnce(() => { throw new Error('Environment unavailable') })
        return pmrem
      })
    } else {
      rendererMock.mockImplementationOnce((...args) => {
        const current = rendererImplementation(...args)
        const method = failure === 'configuration' ? current.setPixelRatio : current.render
        jest.mocked(method).mockImplementationOnce(() => { throw new Error('Graphics unavailable') })
        return current
      })
    }
    const skyDispose = jest.spyOn(THREE.CanvasTexture.prototype, 'dispose')
    const onReadyChange = jest.fn()
    const onHintPosition = jest.fn()
    const state = generateLevel(1, 41_004)
    const props = { state, colorblindMode: false, onBoxClick: jest.fn(), onMarbleArrived: jest.fn(), onReadyChange, onHintPosition }
    const view = render(<MarbleSortScene {...props} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Graphics unavailable')
    expect(view.container.querySelector('canvas')).toBeNull()
    expect(onReadyChange).toHaveBeenLastCalledWith(false)
    expect(onHintPosition).toHaveBeenLastCalledWith(null)
    expect(skyDispose).toHaveBeenCalled()
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
    if (failure !== 'renderer') expect(renderer().dispose).toHaveBeenCalledTimes(1)
    if (failure === 'environment') {
      const pmrem = jest.mocked(THREE.PMREMGenerator).mock.results.at(-1)?.value as THREE.PMREMGenerator
      expect(pmrem.dispose).toHaveBeenCalledTimes(1)
    }

    // An ordinary state/preference update while failed must not touch stale refs
    // or retry behind the user's back. The explicit retry uses this latest board.
    const next = { ...state, boxes: state.boxes.slice(1) }
    view.rerender(<MarbleSortScene {...props} colorblindMode state={next} />)
    expect(rendererMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
    expect(onReadyChange).toHaveBeenLastCalledWith(true)
    advanceFrame()
    const scene = renderer().render.mock.calls.at(-1)?.[0]
    const visibleBoxIds: string[] = []
    scene?.traverse((object) => {
      if (typeof object.userData.boxId === 'string') visibleBoxIds.push(object.userData.boxId)
    })
    expect(new Set(visibleBoxIds)).toEqual(new Set(next.boxes.filter((box) => isBoxOpenable(box, next.boxes)).map((box) => box.id)))
    view.unmount()
  },
)

it('keeps a moving saved board and HUD usable through repeated StrictMode failures, menu, and retry', async () => {
  jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  const progress = { ...createInitialProgress(), unlockedLevel: 3, highScore: 800, totalScore: 1200, powerUps: { extraBelt: 2, magnet: 2, shuffle: 2 } }
  saveProgress(progress)
  const initial = { ...generateLevel(1, 41_004), powerUps: { ...progress.powerUps } }
  const box = initial.boxes.find((candidate) => isBoxOpenable(candidate, initial.boxes))!
  let moving = openBox(initial, box.id)
  for (const marble of [...moving.fallingMarbles]) moving = arriveFallingMarble(moving, marble.id)
  expect(moving.conveyor.length).toBeGreaterThan(0)
  saveLevelSnapshot(moving)
  const savedBoard = window.localStorage.getItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)
  const savedProgress = window.localStorage.getItem(MARBLE_SORT_PROGRESS_STORAGE_KEY)
  const constructor = jest.mocked(THREE.WebGLRenderer)
  const working = constructor.getMockImplementation()!
  constructor.mockImplementation(() => { throw new Error('WebGL unavailable') })
  const skyDispose = jest.spyOn(THREE.CanvasTexture.prototype, 'dispose')
  const view = render(<StrictMode><MarbleSortGame /></StrictMode>)

  expect(screen.getByRole('alert')).toHaveTextContent('Your level is paused')
  expect(constructor).toHaveBeenCalledTimes(2)
  expect(skyDispose).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  expect(constructor).toHaveBeenCalledTimes(3)
  for (const name of ['Magnet', 'Shuffle', 'Extra Belt']) expect(screen.getByRole('button', { name })).toBeDisabled()
  for (const name of ['Reset', 'Level select', 'Tutorial']) expect(screen.getByRole('button', { name })).toBeEnabled()
  fireEvent.click(screen.getByLabelText('Colorblind mode', { selector: '#marble-sort-colorblind-desktop' }))
  expect(window.localStorage.getItem('bwh.marble-sort.colorblind.v1')).toBe('1')
  fireEvent.click(screen.getByRole('button', { name: 'Tutorial' }))
  expect(screen.getByRole('dialog', { name: 'Marble Sort' })).toBeInTheDocument()
  await act(async () => {
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    jest.advanceTimersByTime(1200)
  })
  expect(JSON.parse(window.localStorage.getItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)!)).toEqual(JSON.parse(savedBoard!))
  expect(JSON.parse(window.localStorage.getItem(MARBLE_SORT_PROGRESS_STORAGE_KEY)!)).toEqual(JSON.parse(savedProgress!))

  fireEvent.click(screen.getByRole('button', { name: 'Level select' }))
  expect(screen.getByTestId('level-tile-1')).toBeInTheDocument()
  expect(JSON.parse(window.localStorage.getItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)!)).toEqual(JSON.parse(savedBoard!))
  fireEvent.click(screen.getByTestId('level-tile-1'))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  constructor.mockImplementation(working)
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Magnet' })).toBeEnabled()
  expect(JSON.parse(window.localStorage.getItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)!)).toEqual(JSON.parse(savedBoard!))
  advanceFrame()
  act(() => jest.advanceTimersByTime(200))
  expect(window.localStorage.getItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)).not.toBe(savedBoard)

  const staleFrame = jest.mocked(window.requestAnimationFrame).mock.calls.at(-1)![0]
  const current = renderer()
  const renders = current.render.mock.calls.length
  const frames = jest.mocked(window.requestAnimationFrame).mock.calls.length
  view.unmount()
  act(() => staleFrame(performance.now()))
  expect(current.render).toHaveBeenCalledTimes(renders)
  expect(window.requestAnimationFrame).toHaveBeenCalledTimes(frames)
  expect(current.dispose).toHaveBeenCalledTimes(1)
})
