import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import * as THREE from 'three'

import { ChicksGame } from '../ChicksGame'
import { ChicksScene } from '../ChicksScene'
import { STEP_TWEEN_MS } from '../gameTypes'
import { getLevelById } from '../levels'
import { parseLevel } from '../levels/parseLevel'

let mockFault: 'constructor' | 'setup' | 'render' | null = null
const mockRender = jest.fn()
const mockDispose = jest.fn()
const mockRenderers: HTMLCanvasElement[] = []

jest.mock('three', () => {
  const actual = jest.requireActual<typeof import('three')>('three')
  return {
    ...actual,
    WebGLRenderer: jest.fn().mockImplementation(() => {
      if (mockFault === 'constructor') throw new Error('No context')
      const domElement = document.createElement('canvas')
      mockRenderers.push(domElement)
      return {
        domElement,
        setClearColor: () => { if (mockFault === 'setup') throw new Error('Partial setup') },
        setPixelRatio: jest.fn(),
        setSize: jest.fn(),
        render: (scene: THREE.Scene) => {
          mockRender(scene)
          if (mockFault === 'render') throw new Error('Draw failed')
        },
        dispose: mockDispose,
      }
    }),
  }
})

let frames: Map<number, FrameRequestCallback>
let nextFrame: number

function frame(): void {
  const pending = [...frames.values()]
  frames.clear()
  act(() => pending.forEach((callback) => callback(0)))
}

function advance(ms = STEP_TWEEN_MS): void {
  act(() => { jest.advanceTimersByTime(ms) })
}

function press(key: string): void {
  fireEvent.keyDown(window, { key })
  fireEvent.keyUp(window, { key })
}

function context(): CanvasRenderingContext2D {
  return new Proxy({}, {
    get: (_target, property) => property === 'createLinearGradient' || property === 'createRadialGradient'
      ? () => ({ addColorStop: jest.fn() }) : jest.fn(),
    set: () => true,
  }) as CanvasRenderingContext2D
}

beforeEach(() => {
  jest.useFakeTimers()
  mockFault = null
  mockRender.mockReset()
  mockDispose.mockReset()
  mockRenderers.length = 0
  frames = new Map()
  nextFrame = 0
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id) })
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context())
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  window.localStorage.clear()
  window.history.pushState({}, '', '/chicks-challenge?level=1')
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

it.each(['constructor', 'setup', 'render'] as const)('recovers from a %s failure and keeps menu and preferences usable', (fault) => {
  mockFault = fault
  render(<ChicksGame />)
  expect(screen.getByRole('alert')).toHaveTextContent('Graphics unavailable')
  const retry = screen.getByRole('button', { name: 'Retry graphics' })
  expect(retry).toHaveFocus()
  expect(retry.closest('[aria-hidden="true"]')).toBeNull()
  expect(screen.getByRole('button', { name: 'Restart level' })).toBeDisabled()
  press('ArrowDown')
  press('r')
  press('Backspace')
  advance(1000)
  expect(screen.getByLabelText('0 of 16 moves')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('orientation-toggle'))
  expect(screen.getByTestId('orientation-toggle')).toHaveAttribute('data-orientation-preference', 'rotated')
  fireEvent.click(screen.getByRole('button', { name: /sound/i }))
  // Space/letters on a native button must not turn into gameplay shortcuts.
  fireEvent.keyDown(retry, { key: ' ' })
  fireEvent.keyDown(retry, { key: 'r' })
  expect(screen.getByRole('alert')).toBeInTheDocument()
  mockFault = null
  fireEvent.click(retry)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByTestId('chips-board')).toHaveFocus()
  expect(screen.getByTestId('chips-board')).toHaveAttribute('data-graphics-status', 'ready')
  const scene = mockRender.mock.calls.at(-1)?.[0] as THREE.Scene
  let meshes = 0
  scene.traverse((object) => { if (object instanceof THREE.Mesh) meshes += 1 })
  expect(meshes).toBe(82)
  advance(1000)
  expect(screen.getByLabelText('0 of 16 moves')).toBeInTheDocument()
})

it('retains the current puzzle and undo history across repeated failures, clearing queued and held input', () => {
  render(<ChicksGame />)
  press('ArrowDown')
  advance()
  frame()
  expect(screen.getByLabelText('1 of 16 moves')).toBeInTheDocument()
  // A held key has queued a second move, but the failure must synchronously discard it.
  fireEvent.keyDown(window, { key: 'ArrowUp' })
  mockFault = 'render'
  frame()
  fireEvent.click(screen.getByRole('button', { name: 'Restart level' }))
  press('z')
  advance(2000)
  expect(screen.getByLabelText('1 of 16 moves')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  mockFault = null
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  advance(2000)
  expect(screen.getByLabelText('1 of 16 moves')).toBeInTheDocument()
  expect(screen.getByTestId('hint-banner')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Undo move' }))
  expect(screen.getByLabelText('0 of 16 moves')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Undo move' })).toBeDisabled()
})

it('keeps gameplay gated until the first populated retry draw completes', () => {
  mockFault = 'constructor'
  render(<ChicksGame />)
  mockFault = null
  mockRender.mockImplementationOnce(() => {
    press('ArrowDown')
    press('r')
    press('z')
    jest.advanceTimersByTime(1000)
    expect(screen.getByLabelText('0 of 16 moves')).toBeInTheDocument()
  })
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  advance(1000)
  expect(screen.getByLabelText('0 of 16 moves')).toBeInTheDocument()
  press('ArrowDown')
  advance()
  expect(screen.getByLabelText('1 of 16 moves')).toBeInTheDocument()
})

it.each(['Restart level', 'Undo move', 'Board rotation: automatic', 'Mute sound'])(
  'keeps game shortcuts working with the healthy %s button focused', (name) => {
    render(<ChicksGame />)
    press('ArrowDown')
    advance()
    press('ArrowUp')
    advance()
    const button = screen.getByRole('button', { name })
    button.focus()
    fireEvent.click(button)
    expect(button).toHaveFocus()
    const movesAfterClick = name === 'Restart level' ? 0 : name === 'Undo move' ? 1 : 2
    // Dispatch on the actual focused element, as the browser does.
    const pressFocused = (key: string): void => {
      fireEvent.keyDown(document.activeElement!, { key })
      fireEvent.keyUp(document.activeElement!, { key })
    }
    expect(fireEvent.keyDown(document.activeElement!, { key: ' ' })).toBe(true)
    expect(fireEvent.keyDown(document.activeElement!, { key: 'Enter' })).toBe(true)
    advance()
    expect(screen.getByLabelText(`${movesAfterClick} of 16 moves`)).toBeInTheDocument()
    pressFocused('ArrowDown')
    advance()
    pressFocused('w')
    advance()
    expect(screen.getByLabelText(`${movesAfterClick + 2} of 16 moves`)).toBeInTheDocument()
    pressFocused('r')
    expect(screen.getByLabelText('0 of 16 moves')).toBeInTheDocument()
    pressFocused('z')
    expect(screen.getByLabelText(`${movesAfterClick + 2} of 16 moves`)).toBeInTheDocument()
    pressFocused('Escape')
    expect(screen.getByTestId('level-tile-1')).toBeInTheDocument()
  },
)

it('leaves form and editable keyboard input alone while graphics are healthy', () => {
  const { container } = render(<ChicksGame />)
  for (const tag of ['input', 'textarea', 'select', 'div']) {
    const editable = document.createElement(tag)
    if (tag === 'div') editable.setAttribute('contenteditable', '')
    container.appendChild(editable)
    editable.focus()
    for (const key of ['ArrowDown', 'w', 'r', 'z', 'Escape', ' ']) {
      expect(fireEvent.keyDown(editable, { key })).toBe(true)
      fireEvent.keyUp(editable, { key })
    }
  }
  advance(1000)
  expect(screen.getByLabelText('0 of 16 moves')).toBeInTheDocument()
})

it('returns to level select safely after repeated startup failures', () => {
  mockFault = 'constructor'
  render(<ChicksGame />)
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Level select' }).at(-1)!)
  expect(screen.getByTestId('level-tile-1')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('disposes partial board geometry and all cached textures/materials before the renderer, even if disposal throws', () => {
  const order: string[] = []
  const geometry = jest.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(() => { order.push('geometry') })
  const material = jest.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(() => { order.push('material') })
  const texture = jest.spyOn(THREE.Texture.prototype, 'dispose').mockImplementation(() => { order.push('texture'); throw new Error('Lost texture') })
  // Tile drawing fails only after at least one material entered the cache.
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementationOnce(() => context()).mockImplementationOnce(() => null)
  mockDispose.mockImplementation(() => { order.push('renderer'); throw new Error('Lost renderer') })
  const { unmount } = render(<ChicksGame />)
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(geometry).toHaveBeenCalledTimes(2)
  expect(material).toHaveBeenCalledTimes(1)
  expect(texture).toHaveBeenCalledTimes(1)
  expect(order.at(-1)).toBe('renderer')
  expect(mockRenderers.every((canvas) => !canvas.isConnected)).toBe(true)
  unmount()
  expect(mockDispose).toHaveBeenCalledTimes(1)
})

it('cancels stale frames and observers across StrictMode setup, failure, retry and unmount', () => {
  const callbacks: ResizeObserverCallback[] = []
  const disconnect = jest.fn()
  jest.spyOn(window, 'ResizeObserver').mockImplementation((callback) => {
    callbacks.push(callback)
    return { observe: jest.fn(), unobserve: jest.fn(), disconnect }
  })
  const state = parseLevel(getLevelById(1)!)
  const status = jest.fn()
  const { rerender, unmount } = render(<StrictMode><ChicksScene state={state} events={[]} moveSeq={0} onGraphicsStatus={status} /></StrictMode>)
  expect(document.querySelectorAll('canvas')).toHaveLength(1)
  const staleFrames = [...frames.values()]
  mockFault = 'render'
  frame()
  expect(status).toHaveBeenLastCalledWith('failed')
  mockFault = null
  rerender(<StrictMode><ChicksScene state={state} events={[]} moveSeq={0} graphicsAttempt={1} onGraphicsStatus={status} /></StrictMode>)
  const renders = mockRender.mock.calls.length
  act(() => {
    staleFrames.forEach((callback) => callback(0))
    callbacks.slice(0, -1).forEach((callback) => callback([], {} as ResizeObserver))
  })
  expect(mockRender).toHaveBeenCalledTimes(renders)
  expect(status).toHaveBeenLastCalledWith('ready')
  expect(document.querySelectorAll('canvas')).toHaveLength(1)
  unmount()
  expect(document.querySelectorAll('canvas')).toHaveLength(0)
  expect(frames.size).toBe(0)
  expect(disconnect).toHaveBeenCalledTimes(3)
})
