import { act, render } from '@testing-library/react'
import { StrictMode } from 'react'
import * as THREE from 'three'

import { createEngineState } from '../engine/engine'
import { createRng } from '../engine/rng'
import type { EngineState } from '../gameTypes'
import { HoverScene } from '../HoverScene'
import { neutralInput } from '../input/inputState'
import { drawMinimap } from '../scene/minimap'
import { renderMirror } from '../scene/mirror'
import { buildMapScene } from '../scene/sceneBuilder'

jest.mock('three', () => {
  const actual = jest.requireActual<typeof import('three')>('three')
  return { ...actual, WebGLRenderer: jest.fn(), Clock: class {
    elapsedTime = 0
    getDelta() { this.elapsedTime += 0.1; return 0.1 }
  } }
})
jest.mock('../scene/minimap', () => ({ drawMinimap: jest.fn() }))
jest.mock('../scene/sceneBuilder', () => ({ buildMapScene: jest.fn() }))
jest.mock('../scene/craftMeshes', () => {
  const three = jest.requireActual<typeof import('three')>('three')
  return { createCockpitDash: () => new three.Group(), createDroneMesh: () => new three.Group(), animateDroneRings: jest.fn() }
})
jest.mock('../scene/flagMeshes', () => {
  const three = jest.requireActual<typeof import('three')>('three')
  return { createFlagMesh: () => new three.Group(), createPodMesh: () => new three.Group(), createTrapMesh: () => new three.Group(), createArrowPadMesh: () => new three.Group(), animateFlagCloth: jest.fn(), podFloatHeight: () => 1 }
})
jest.mock('../scene/mirror', () => {
  const actual = jest.requireActual<typeof import('../scene/mirror')>('../scene/mirror')
  return { ...actual, renderMirror: jest.fn() }
})

function round(): EngineState {
  return createEngineState({ roundIndex: 0, score: 1234, lossesOnMap: 2, rng: createRng(42) })
}

function rendererStub() {
  return { domElement: document.createElement('canvas'), shadowMap: {}, setPixelRatio: jest.fn(), setSize: jest.fn(), clear: jest.fn(), render: jest.fn(), dispose: jest.fn() }
}

describe('Hover graphics startup', () => {
  let renderer: ReturnType<typeof rendererStub>
  let frames: Map<number, FrameRequestCallback>
  let nextFrame: number
  let staleResize: ResizeObserverCallback
  let disconnect: jest.Mock

  const frame = (): void => {
    const queued = [...frames.values()]
    frames.clear()
    act(() => queued.forEach((callback) => callback(performance.now())))
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    staleResize = () => {}
    renderer = rendererStub()
    jest.mocked(THREE.WebGLRenderer).mockImplementation(() => renderer as unknown as THREE.WebGLRenderer)
    jest.mocked(buildMapScene).mockImplementation(() => {})
    jest.mocked(renderMirror).mockImplementation(() => {})
    frames = new Map()
    nextFrame = 0
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.set(++nextFrame, callback); return nextFrame })
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id) })
    disconnect = jest.fn()
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { staleResize = callback }
      observe = jest.fn()
      unobserve = jest.fn()
      disconnect = disconnect
    }
  })

  afterEach(() => jest.restoreAllMocks())

  function props(state: EngineState | null = round()) {
    return { engineRef: { current: state }, graphicsAttempt: 0, onGraphicsStatus: jest.fn(), running: true, idle: false, readInput: neutralInput, onEvents: jest.fn(), onHudSnapshot: jest.fn(), minimapCanvasRef: { current: null as HTMLCanvasElement | null } }
  }

  test.each(['constructor', 'setup', 'clear', 'build', 'main', 'mirror'])('%s failure is contained and retry draws the unchanged engine before stepping', (fault) => {
    const options = props(fault === 'clear' ? null : round())
    const state = options.engineRef.current
    const before = JSON.stringify(state)
    if (fault === 'constructor') jest.mocked(THREE.WebGLRenderer).mockImplementationOnce(() => { throw new Error('context unavailable') })
    if (fault === 'setup') renderer.setSize.mockImplementationOnce(() => { throw new Error('size failed') })
    if (fault === 'clear') renderer.clear.mockImplementationOnce(() => { throw new Error('clear failed') })
    if (fault === 'build') jest.mocked(buildMapScene).mockImplementationOnce(() => { throw new Error('build failed') })
    if (fault === 'main') renderer.render.mockImplementationOnce(() => { throw new Error('draw failed') })
    if (fault === 'mirror') jest.mocked(renderMirror).mockImplementationOnce(() => { throw new Error('mirror failed') })
    const view = render(<HoverScene {...options} />)
    expect(options.onGraphicsStatus).toHaveBeenLastCalledWith('failed')
    expect(options.onHudSnapshot).not.toHaveBeenCalled()
    expect(view.container.querySelector('canvas')).toBeNull()
    expect(frames.size).toBe(0)
    expect(JSON.stringify(state)).toBe(before)
    act(() => staleResize([], {} as ResizeObserver))
    view.rerender(<HoverScene {...options} graphicsAttempt={1} />)
    expect(options.engineRef.current).toBe(state)
    expect(JSON.stringify(state)).toBe(before)
    expect(options.onGraphicsStatus).toHaveBeenLastCalledWith('ready')
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
    if (state) {
      expect(renderer.render).toHaveBeenCalled()
      expect(renderMirror).toHaveBeenCalled()
    }
  })

  test.each(['build', 'mirror'])('attract clear parks; a later round %s failure recovers without consuming round time', (fault) => {
    const options = props(null)
    const view = render(<HoverScene {...options} />)
    expect(frames.size).toBe(0)
    options.engineRef.current = round()
    const before = JSON.stringify(options.engineRef.current)
    if (fault === 'build') jest.mocked(buildMapScene).mockImplementationOnce(() => { throw new Error('first round build failed') })
    else jest.mocked(renderMirror).mockImplementationOnce(() => { throw new Error('first populated mirror failed') })
    view.rerender(<HoverScene {...options} />)
    expect(options.onGraphicsStatus).toHaveBeenLastCalledWith('failed')
    expect(JSON.stringify(options.engineRef.current)).toBe(before)
    view.rerender(<HoverScene {...options} graphicsAttempt={1} />)
    expect(options.onGraphicsStatus).toHaveBeenLastCalledWith('ready')
    expect(JSON.stringify(options.engineRef.current)).toBe(before)
  })

  test('the first successful main and mirror frame precedes simulation, then a healthy loop steps', () => {
    const options = props()
    options.onHudSnapshot.mockImplementation(() => {
      expect(renderer.render).toHaveBeenCalled()
      expect(renderMirror).toHaveBeenCalled()
    })
    render(<HoverScene {...options} />)
    expect(options.engineRef.current?.elapsedSec).toBe(0)
    expect(renderer.render).toHaveBeenCalledTimes(1)
    expect(renderMirror).toHaveBeenCalledTimes(1)
    frame()
    expect(options.engineRef.current!.elapsedSec).toBeGreaterThan(0)
  })

  test('partial build cleanup releases all scene resources before renderer even when disposals throw', () => {
    const options = props()
    const geometry = new THREE.BoxGeometry()
    const texture = new THREE.Texture()
    const background = new THREE.Texture()
    const material = new THREE.MeshBasicMaterial({ map: texture })
    const sun = new THREE.DirectionalLight()
    const order: string[] = []
    jest.spyOn(geometry, 'dispose').mockImplementation(() => { order.push('geometry'); throw new Error('driver') })
    jest.spyOn(texture, 'dispose').mockImplementation(() => { order.push('texture') })
    jest.spyOn(material, 'dispose').mockImplementation(() => { order.push('material') })
    jest.spyOn(sun, 'dispose').mockImplementation(() => { order.push('shadow') })
    jest.spyOn(background, 'dispose').mockImplementation(() => { order.push('background') })
    renderer.dispose.mockImplementation(() => { order.push('renderer'); throw new Error('dispose') })
    jest.mocked(buildMapScene).mockImplementationOnce((scene, group) => {
      group.add(new THREE.Mesh(geometry, material), sun)
      scene.background = background
      throw new Error('partial map')
    })
    const view = render(<HoverScene {...options} />)
    expect(order).toEqual(['geometry', 'texture', 'material', 'shadow', 'background', 'renderer'])
    expect(view.container.querySelector('canvas')).toBeNull()
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(0)
  })

  test('a paused retry paints its remounted minimap before parking', () => {
    const options = props()
    render(<HoverScene {...options} idle />)
    // The first synchronous populated frame reports ready before the parent
    // remounts its HUD canvas. The remaining settle frame must paint it.
    expect(drawMinimap).not.toHaveBeenCalled()
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 200
    const context = { save: jest.fn(), scale: jest.fn(), restore: jest.fn() } as unknown as CanvasRenderingContext2D
    jest.spyOn(canvas, 'getContext').mockReturnValue(context)
    options.minimapCanvasRef.current = canvas
    frame()
    expect(drawMinimap).toHaveBeenCalledWith(context, options.engineRef.current, 200, 200)
    frame()
    expect(frames.size).toBe(0)
  })

  test('StrictMode cleanup blocks stale frames and resize; pause still parks and wakes', () => {
    const options = props()
    const view = render(<StrictMode><HoverScene {...options} idle /></StrictMode>)
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
    frame()
    frame()
    expect(frames.size).toBe(0)
    view.rerender(<StrictMode><HoverScene {...options} idle={false} /></StrictMode>)
    expect(frames.size).toBe(1)
    const staleFrame = [...frames.values()][0]!
    const draws = renderer.render.mock.calls.length
    const resizes = renderer.setSize.mock.calls.length
    view.unmount()
    act(() => { staleFrame(performance.now()); staleResize([], {} as ResizeObserver) })
    expect(renderer.render).toHaveBeenCalledTimes(draws)
    expect(renderer.setSize).toHaveBeenCalledTimes(resizes)
    expect(frames.size).toBe(0)
  })
})
