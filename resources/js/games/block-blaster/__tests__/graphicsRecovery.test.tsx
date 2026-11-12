import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import * as THREE from 'three'

import { BlockBlasterGame } from '../BlockBlasterGame'
import { BlockBlasterScene } from '../BlockBlasterScene'
import type { SceneProps } from '../gameTypes'
import { LEVELS } from '../levels/levels'

const mockGraphics = {
  failure: '' as '' | 'constructor' | 'pixelRatio' | 'size' | 'render',
  disposeThrows: false,
  canvases: [] as HTMLCanvasElement[],
  disposals: [] as string[],
}

jest.mock('three', () => {
  const actual = jest.requireActual<typeof import('three')>('three')
  return {
    ...actual,
    WebGLRenderer: jest.fn().mockImplementation(({ canvas }: { canvas: HTMLCanvasElement }) => {
      mockGraphics.canvases.push(canvas)
      if (mockGraphics.failure === 'constructor') {
        throw new Error('No WebGL context')
      }
      return {
        domElement: canvas,
        shadowMap: {},
        setPixelRatio: () => {
          if (mockGraphics.failure === 'pixelRatio') throw new Error('Pixel ratio failed')
        },
        setSize: () => {
          if (mockGraphics.failure === 'size') throw new Error('Resize failed')
        },
        render: () => {
          if (mockGraphics.failure === 'render') throw new Error('First render failed')
        },
        dispose: () => {
          mockGraphics.disposals.push('renderer')
          if (mockGraphics.disposeThrows) throw new Error('Dispose failed')
        },
      }
    }),
  }
})

// Exercise the real scene/world/builders without requiring a 2D or WebGL implementation.
jest.mock('../scene/threeUtils', () => ({
  ...jest.requireActual<typeof import('../scene/threeUtils')>('../scene/threeUtils'),
  createCanvasTexture: () => new (jest.requireActual<typeof import('three')>('three').Texture)(),
}))

let frames: FrameRequestCallback[]
let resizes: ResizeObserverCallback[]
let disconnects: jest.Mock[]

function props(): SceneProps {
  const level = LEVELS[0]
  if (!level) throw new Error('Missing tutorial level')
  return {
    level,
    status: 'playing',
    ballsRemaining: level.balls,
    hintVisible: true,
    onShotFired: jest.fn(),
    onBlocksCleared: jest.fn(),
    onWin: jest.fn(),
    onLose: jest.fn(),
    onHintPosition: jest.fn(),
    onReturnToMenu: jest.fn(),
  }
}

beforeEach(() => {
  window.localStorage.clear()
  window.history.pushState({}, '', '/block-blaster')
  mockGraphics.failure = ''
  mockGraphics.disposeThrows = false
  mockGraphics.canvases = []
  mockGraphics.disposals = []
  frames = []
  resizes = []
  disconnects = []
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback))
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  jest.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(() => { mockGraphics.disposals.push('geometry') })
  jest.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(() => { mockGraphics.disposals.push('material') })
  jest.spyOn(THREE.Texture.prototype, 'dispose').mockImplementation(() => { mockGraphics.disposals.push('texture') })
  jest.spyOn(THREE.DirectionalLight.prototype, 'dispose').mockImplementation(() => { mockGraphics.disposals.push('shadow') })
  jest.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 600, width: 400, height: 600, toJSON: () => ({}) })
  jest.spyOn(window, 'ResizeObserver').mockImplementation((callback) => {
    resizes.push(callback)
    const disconnect = jest.fn()
    disconnects.push(disconnect)
    return { observe: jest.fn(), unobserve: jest.fn(), disconnect }
  })
})

afterEach(() => { jest.restoreAllMocks() })

it.each(['constructor', 'pixelRatio', 'size', 'render'] as const)('recovers from %s failure without starting a new level attempt', (failure) => {
  mockGraphics.failure = failure
  render(<BlockBlasterGame />)
  fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Graphics unavailable')
  expect(screen.queryByRole('button', { name: /^Retry$/ })).not.toBeInTheDocument()
  expect(screen.getByTestId('block-blaster-scene').querySelector('canvas')).toBeNull()
  expect(frames).toHaveLength(0)

  // Repeated failures keep the recovery actions available and leave progress alone.
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(window.localStorage.length).toBe(0)
  mockGraphics.failure = ''
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Level 1')).toBeInTheDocument()
  expect(screen.getByLabelText('Balls remaining 5')).toBeInTheDocument()
  expect(screen.getByTestId('block-blaster-scene').querySelectorAll('canvas')).toHaveLength(1)
  const canvas = mockGraphics.canvases.at(-1)!
  fireEvent.pointerUp(canvas, { clientX: 360, clientY: 420 })
  expect(screen.getByLabelText('Balls remaining 4')).toBeInTheDocument()
})

it('releases resources before renderer disposal and removes failed canvases even when cleanup throws', () => {
  mockGraphics.failure = 'render'
  mockGraphics.disposeThrows = true
  jest.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementationOnce(() => { throw new Error('Geometry disposal failed') })
  const callbacks = props()
  render(<BlockBlasterScene {...callbacks} />)
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(mockGraphics.disposals).toEqual(expect.arrayContaining(['texture', 'material', 'shadow', 'renderer']))
  expect(mockGraphics.disposals.at(-1)).toBe('renderer')
  expect(mockGraphics.canvases.every((canvas) => !canvas.isConnected)).toBe(true)
  expect(disconnects.every((disconnect) => disconnect.mock.calls.length === 1)).toBe(true)
  expect(callbacks.onShotFired).not.toHaveBeenCalled()
  expect(callbacks.onWin).not.toHaveBeenCalled()
  expect(callbacks.onLose).not.toHaveBeenCalled()
  expect(callbacks.onHintPosition).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Level menu' }))
  expect(callbacks.onReturnToMenu).toHaveBeenCalledTimes(1)
})

it('returns to the level menu after failure without completing or unlocking anything', () => {
  mockGraphics.failure = 'constructor'
  render(<BlockBlasterGame />)
  fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))
  fireEvent.click(screen.getByRole('button', { name: 'Level menu' }))
  expect(screen.getByRole('button', { name: 'Level 1, 0 stars' })).toBeInTheDocument()
  expect(screen.getByLabelText('Level 2 locked')).toBeInTheDocument()
  expect(window.localStorage.length).toBe(0)
})

it('ignores stale frames, observers and pointer listeners after StrictMode cleanup', () => {
  const callbacks = props()
  const view = render(<StrictMode><BlockBlasterScene {...callbacks} /></StrictMode>)
  expect(mockGraphics.canvases).toHaveLength(2)
  const [oldCanvas, canvas] = mockGraphics.canvases
  if (!oldCanvas || !canvas) throw new Error('Missing StrictMode canvases')
  expect(oldCanvas.isConnected).toBe(false)
  const frameCount = frames.length
  act(() => { frames[0]?.(0); resizes[0]?.([], {} as ResizeObserver) })
  fireEvent.pointerUp(oldCanvas, { clientX: 200, clientY: 300 })
  expect(frames).toHaveLength(frameCount)
  expect(callbacks.onShotFired).not.toHaveBeenCalled()
  fireEvent.pointerUp(canvas, { clientX: 360, clientY: 420 })
  expect(callbacks.onShotFired).toHaveBeenCalledTimes(1)
  // Same-frame duplicate input cannot bypass the synchronous budget/cooldown guard.
  fireEvent.pointerUp(canvas, { clientX: 360, clientY: 420 })
  expect(callbacks.onShotFired).toHaveBeenCalledTimes(1)
  view.unmount()
  const calls = mockGraphics.disposals.length
  act(() => { frames.at(-1)?.(16); resizes.at(-1)?.([], {} as ResizeObserver) })
  fireEvent.pointerUp(canvas, { clientX: 200, clientY: 300 })
  expect(callbacks.onShotFired).toHaveBeenCalledTimes(1)
  expect(mockGraphics.disposals).toHaveLength(calls)
  expect(mockGraphics.disposals.at(-1)).toBe('renderer')
})
