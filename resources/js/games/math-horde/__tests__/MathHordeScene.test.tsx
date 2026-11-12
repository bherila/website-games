import { act, fireEvent, render } from '@testing-library/react'
import { StrictMode } from 'react'
import * as THREE from 'three'

import { createGameState } from '../gameEngine'
import { levelById } from '../levels'
import { MathHordeScene } from '../MathHordeScene'
import * as environment from '../scene/environment'
import { SceneResources } from '../scene/resources'

jest.mock('../scene/environment', () => ({ createEnvironment: jest.fn() }))

jest.mock('three', () => ({ ...jest.requireActual('three'), WebGLRenderer: jest.fn() }))

describe('Math Horde graphics lifecycle', () => {
  let frames: Map<number, FrameRequestCallback>
  let frameId: number
  let resize: ResizeObserverCallback
  let observe: jest.Mock
  let disconnect: jest.Mock
  let graphics: { setPixelRatio: jest.Mock, setSize: jest.Mock, shadowMap: { enabled: boolean }, render: jest.Mock, dispose: jest.Mock }

  beforeEach(() => {
    jest.restoreAllMocks()
    jest.mocked(environment.createEnvironment).mockReset().mockImplementation(jest.requireActual('../scene/environment').createEnvironment)
    frames = new Map()
    frameId = 0
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = ++frameId
      frames.set(id, (time) => { frames.delete(id); callback(time) })

      return id
    })
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id) })
    observe = jest.fn()
    disconnect = jest.fn()
    globalThis.ResizeObserver = jest.fn((callback) => {
      resize = callback

      return { observe, disconnect }
    }) as unknown as typeof ResizeObserver
    graphics = { setPixelRatio: jest.fn(), setSize: jest.fn(), shadowMap: { enabled: false }, render: jest.fn(), dispose: jest.fn() }
    jest.mocked(THREE.WebGLRenderer).mockReset().mockImplementation(() => graphics as unknown as THREE.WebGLRenderer)
  })

  function setup() {
    const state = createGameState(levelById(1)!)
    state.events.push({ type: 'gateUpgraded', pairId: 'pending', side: 'left', value: 4 })
    const props = { active: true, state, graphicsAttempt: 0, onGraphicsStatus: jest.fn(), onHud: jest.fn(), onFinish: jest.fn(), playSfx: jest.fn() }

    return { props, state }
  }

  it.each(['constructor', 'pixel ratio', 'view construction', 'observe', 'resize', 'view update', 'first draw'])('contains a %s fault before any unseen simulation or callbacks, then retries the same run', (stage) => {
    const { props, state } = setup()
    const before = JSON.stringify(state)
    const fail = (): never => { throw new Error('graphics unavailable') }
    let restore = (): void => {}
    if (stage === 'constructor') {
      jest.mocked(THREE.WebGLRenderer).mockImplementationOnce(fail)
    } else if (stage === 'pixel ratio') {
      graphics.setPixelRatio.mockImplementationOnce(fail)
    } else if (stage === 'view construction') {
      const original = jest.requireActual('../scene/environment').createEnvironment as typeof environment.createEnvironment
      const spy = jest.mocked(environment.createEnvironment).mockImplementationOnce((...args) => { original(...args); return fail() })
      restore = () => { spy.mockImplementation(original) }
    } else if (stage === 'observe') {
      observe.mockImplementationOnce(fail)
    } else if (stage === 'resize') {
      graphics.setSize.mockImplementationOnce(fail)
    } else if (stage === 'view update') {
      const original = jest.requireActual('../scene/environment').createEnvironment as typeof environment.createEnvironment
      const spy = jest.mocked(environment.createEnvironment).mockImplementationOnce((...args) => ({ ...original(...args), update: fail }))
      restore = () => { spy.mockImplementation(original) }
    } else {
      graphics.render.mockImplementationOnce(fail)
    }
    const view = render(<MathHordeScene {...props} />)
    expect(props.onGraphicsStatus.mock.calls).toEqual([['loading'], ['error']])
    expect(JSON.stringify(state)).toBe(before)
    expect(props.onHud).not.toHaveBeenCalled()
    expect(props.onFinish).not.toHaveBeenCalled()
    expect(props.playSfx).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
    expect(view.container.querySelector('canvas')).toBeNull()
    restore()
    view.rerender(<MathHordeScene {...props} active={false} graphicsAttempt={1} />)
    expect(props.onGraphicsStatus).toHaveBeenLastCalledWith('ready')
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
    expect(frames.size).toBe(1)
    expect(JSON.stringify(state)).toBe(before)
    act(() => frames.get(frameId)!(performance.now() + 200))
    expect(state.elapsed).toBe(0)
    view.unmount()
    expect(frames.size).toBe(0)
  })

  it('populates the initial draw, then advances only on subsequent active frames', () => {
    const { props, state } = setup()
    graphics.render.mockImplementationOnce((scene: THREE.Scene) => {
      expect(scene.children.some((child) => child instanceof THREE.InstancedMesh && child.count === state.armySize)).toBe(true)
      expect(props.onHud).not.toHaveBeenCalled()
      expect(props.onGraphicsStatus).not.toHaveBeenCalledWith('ready')
      expect(state.elapsed).toBe(0)
      expect(state.events).toHaveLength(1)
    })
    render(<MathHordeScene {...props} />)
    act(() => frames.get(frameId)!(performance.now() + 100))
    expect(state.elapsed).toBeGreaterThan(0)
    expect(props.onGraphicsStatus).toHaveBeenLastCalledWith('ready')
  })

  it('does not revive readiness when context loss fires during the first draw', () => {
    const { props } = setup()
    graphics.render.mockImplementationOnce(() => {
      const canvas = jest.mocked(THREE.WebGLRenderer).mock.calls.at(-1)![0]!.canvas as HTMLCanvasElement
      fireEvent(canvas, new Event('webglcontextlost', { cancelable: true }))
    })
    const view = render(<MathHordeScene {...props} />)
    expect(props.onGraphicsStatus.mock.calls).toEqual([['loading'], ['error']])
    expect(frames.size).toBe(0)
    expect(view.container.querySelector('canvas')).toBeNull()
  })

  it('cleans partial and shared resources before renderer disposal even when disposal throws', () => {
    const { props } = setup()
    const calls: string[] = []
    const original = jest.requireActual('../scene/environment').createEnvironment as typeof environment.createEnvironment
    jest.mocked(environment.createEnvironment).mockImplementation((...args) => {
      const view = original(...args)
      const resources = args[2]
      const shared = resources.own({ dispose: jest.fn(() => calls.push('shared')) })
      resources.own(shared)
      resources.own({ dispose: () => { calls.push('broken'); throw new Error('dispose') } })

      return view
    })
    const instance = jest.spyOn(THREE.InstancedMesh.prototype, 'dispose')
    const geometry = jest.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    const material = jest.spyOn(THREE.Material.prototype, 'dispose')
    const texture = jest.spyOn(THREE.Texture.prototype, 'dispose')
    const light = jest.spyOn(THREE.DirectionalLight.prototype, 'dispose')
    const shadow = jest.spyOn(THREE.LightShadow.prototype, 'dispose')
    graphics.dispose.mockImplementation(() => {
      expect(instance).toHaveBeenCalled()
      expect(geometry).toHaveBeenCalled()
      expect(material).toHaveBeenCalled()
      expect(texture).toHaveBeenCalled()
      expect(light).toHaveBeenCalled()
      expect(shadow).toHaveBeenCalled()
      calls.push('renderer')
      throw new Error('renderer disposal')
    })
    const view = render(<MathHordeScene {...props} />)
    const canvas = view.container.querySelector('canvas')!
    view.unmount()
    expect(calls).toEqual(['broken', 'shared', 'renderer'])
    expect(canvas.isConnected).toBe(false)
    expect(disconnect).toHaveBeenCalled()
    expect(frames.size).toBe(0)
  })

  it('blocks stale frame, resize and input callbacks after failure, and discards old touch input on retry', () => {
    const { props, state } = setup()
    const view = render(<MathHordeScene {...props} />)
    const canvas = view.container.querySelector('canvas')!
    const frame = frames.get(frameId)!
    const staleResize = resize
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100 })
    fireEvent(canvas, new Event('webglcontextlost', { cancelable: true }))
    const before = JSON.stringify(state)
    const draws = graphics.render.mock.calls.length
    act(() => {
      frame(performance.now() + 500)
      staleResize([], {} as ResizeObserver)
    })
    fireEvent.wheel(canvas, { deltaX: 200 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 10, pointerType: 'touch' })
    expect(JSON.stringify(state)).toBe(before)
    expect(graphics.render).toHaveBeenCalledTimes(draws)
    view.rerender(<MathHordeScene {...props} active={false} graphicsAttempt={1} />)
    const nextCanvas = view.container.querySelector('canvas')!
    view.rerender(<MathHordeScene {...props} graphicsAttempt={1} />)
    fireEvent.pointerMove(nextCanvas, { pointerId: 1, clientX: 10, pointerType: 'touch' })
    expect(JSON.stringify(state)).toBe(before)
  })

  it('survives StrictMode setup, cleanup and setup with one live canvas and frame', () => {
    const { props } = setup()
    const view = render(<StrictMode><MathHordeScene {...props} /></StrictMode>)
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
    expect(frames.size).toBe(1)
    expect(graphics.dispose).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(frames.size).toBe(0)
    expect(graphics.dispose).toHaveBeenCalledTimes(2)
  })

  it('continues cleanup for resources allocated before a view can attach them', () => {
    const resources = new SceneResources()
    const geometry = resources.own(new THREE.BoxGeometry())
    const dispose = jest.spyOn(geometry, 'dispose')
    resources.dispose()
    resources.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
