import { act, fireEvent, render } from '@testing-library/react'
import { StrictMode } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { createPuzzle, removeScrew } from '../engine'
import * as geometry from '../houseGeometry'
import { PlateEscapeScene } from '../PlateEscapeScene'

jest.mock('../houseGeometry', () => ({ ...jest.requireActual<typeof import('../houseGeometry')>('../houseGeometry'), createStage: jest.fn(), createPlateMesh: jest.fn() }))
jest.mock('three', () => ({ ...jest.requireActual<typeof import('three')>('three'), WebGLRenderer: jest.fn() }))
jest.mock('three/examples/jsm/controls/OrbitControls.js', () => ({ OrbitControls: jest.fn() }))

describe('Plate Escape graphics lifecycle', () => {
  let frames: Map<number, FrameRequestCallback>
  let frameId: number
  let resize: ResizeObserverCallback
  let observe: jest.Mock
  let disconnect: jest.Mock
  let controls: { target: THREE.Vector3, update: jest.Mock, saveState: jest.Mock, reset: jest.Mock, dispose: jest.Mock }
  let graphics: { domElement: HTMLCanvasElement, setPixelRatio: jest.Mock, setClearColor: jest.Mock, setSize: jest.Mock, shadowMap: { enabled: boolean }, render: jest.Mock, dispose: jest.Mock, forceContextLoss: jest.Mock }

  beforeEach(() => {
    jest.restoreAllMocks()
    jest.mocked(geometry.createStage).mockReset().mockImplementation(jest.requireActual<typeof import('../houseGeometry')>('../houseGeometry').createStage)
    jest.mocked(geometry.createPlateMesh).mockReset().mockImplementation(jest.requireActual<typeof import('../houseGeometry')>('../houseGeometry').createPlateMesh)
    frames = new Map()
    frameId = 0
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
    graphics = { domElement: document.createElement('canvas'), setPixelRatio: jest.fn(), setClearColor: jest.fn(), setSize: jest.fn(), shadowMap: { enabled: false }, render: jest.fn(), dispose: jest.fn(), forceContextLoss: jest.fn() }
    jest.mocked(THREE.WebGLRenderer).mockReset().mockImplementation(() => graphics as unknown as THREE.WebGLRenderer)
    controls = { target: new THREE.Vector3(), update: jest.fn(), saveState: jest.fn(), reset: jest.fn(), dispose: jest.fn() }
    jest.mocked(OrbitControls).mockReset().mockImplementation(() => controls as unknown as OrbitControls)
  })

  function props() {
    return { state: createPuzzle(1), view: { action: 'reset' as const, sequence: 0 }, motion: true, onTargets: jest.fn(), onError: jest.fn(), onReady: jest.fn(), onPlateEvent: jest.fn() }
  }

  it.each(['constructor', 'configuration', 'controls', 'stage', 'plate', 'observe', 'resize', 'first draw', 'targets'])('contains a %s failure and rebuilds the same puzzle', (stage) => {
    const input = props()
    const before = JSON.stringify(input.state)
    const fail = (): never => { throw new Error('graphics unavailable') }
    if (stage === 'constructor') jest.mocked(THREE.WebGLRenderer).mockImplementationOnce(fail)
    else if (stage === 'configuration') graphics.setPixelRatio.mockImplementationOnce(fail)
    else if (stage === 'controls') controls.saveState.mockImplementationOnce(fail)
    else if (stage === 'stage') jest.mocked(geometry.createStage).mockImplementationOnce(fail)
    else if (stage === 'plate') jest.mocked(geometry.createPlateMesh).mockImplementationOnce(fail)
    else if (stage === 'observe') observe.mockImplementationOnce(fail)
    else if (stage === 'resize') graphics.setSize.mockImplementationOnce(fail)
    else if (stage === 'first draw') graphics.render.mockImplementationOnce(fail)
    else input.onTargets.mockImplementationOnce(fail)
    const view = render(<PlateEscapeScene {...input} />)
    expect(input.onError).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(0)
    expect(view.container.querySelector('canvas')).toBeNull()
    expect(JSON.stringify(input.state)).toBe(before)
    expect(input.onReady).not.toHaveBeenCalled()
    view.rerender(<PlateEscapeScene {...input} key="retry" />)
    expect(input.onReady).toHaveBeenCalled()
    expect(view.container.querySelector('canvas')).not.toBeNull()
    expect(frames.size).toBe(1)
    expect(JSON.stringify(input.state)).toBe(before)
  })

  it('stops context-loss callbacks and disposes every resource before the renderer despite teardown failures', () => {
    const input = props()
    const geometryDispose = jest.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementationOnce(() => { throw new Error('geometry') })
    const materialDispose = jest.spyOn(THREE.Material.prototype, 'dispose')
    const shadowDispose = jest.spyOn(THREE.LightShadow.prototype, 'dispose')
    const lightDispose = jest.spyOn(THREE.Light.prototype, 'dispose')
    controls.dispose.mockImplementation(() => { throw new Error('controls') })
    graphics.dispose.mockImplementation(() => {
      expect(geometryDispose).toHaveBeenCalled()
      expect(materialDispose).toHaveBeenCalled()
      expect(shadowDispose).toHaveBeenCalled()
      expect(lightDispose).toHaveBeenCalled()
      throw new Error('renderer')
    })
    const view = render(<PlateEscapeScene {...input} />)
    const staleFrame = frames.get(frameId)!
    const staleResize = resize
    fireEvent(graphics.domElement, new Event('webglcontextlost', { cancelable: true }))
    expect(frames.size).toBe(0)
    expect(disconnect).toHaveBeenCalled()
    expect(graphics.forceContextLoss).toHaveBeenCalled()
    expect(graphics.domElement.isConnected).toBe(false)
    const draws = graphics.render.mock.calls.length
    act(() => { staleFrame(performance.now() + 500); staleResize([], {} as ResizeObserver) })
    view.rerender(<PlateEscapeScene {...input} view={{ action: 'right', sequence: 1 }} />)
    expect(graphics.render).toHaveBeenCalledTimes(draws)
    expect(input.onError).toHaveBeenCalledTimes(1)
  })

  it('contains later frame, resize and view-command failures', () => {
    for (const stage of ['frame', 'resize', 'command']) {
      const input = props()
      const view = render(<PlateEscapeScene {...input} />)
      const fail = (): never => { throw new Error(stage) }
      if (stage === 'frame') {
        graphics.render.mockImplementationOnce(fail)
        act(() => frames.get(frameId)!(performance.now() + 200))
      } else if (stage === 'resize') {
        graphics.setSize.mockImplementationOnce(fail)
        act(() => resize([], {} as ResizeObserver))
      } else {
        controls.update.mockImplementationOnce(fail)
        view.rerender(<PlateEscapeScene {...input} view={{ action: 'right', sequence: 1 }} />)
      }
      expect(input.onError).toHaveBeenCalledTimes(1)
      expect(frames.size).toBe(0)
      expect(view.container.querySelector('canvas')).toBeNull()
      view.unmount()
    }
  })

  it('reconstructs removed screws and released panels settled without replaying effects', () => {
    const input = props()
    input.state = removeScrew(removeScrew(input.state, 'right-roof-1'), 'right-roof-2')
    const before = JSON.stringify(input.state)
    graphics.render.mockImplementation((scene: THREE.Scene) => {
      const screws: THREE.Object3D[] = []
      scene.traverse((object) => { if (object.userData.screwId) screws.push(object) })
      expect(screws.filter((screw) => input.state.removed.includes(String(screw.userData.screwId))).every((screw) => !screw.visible)).toBe(true)
    })
    render(<PlateEscapeScene {...input} />)
    act(() => frames.get(frameId)!(performance.now() + 200))
    expect(input.onPlateEvent).not.toHaveBeenCalled()
    expect(JSON.stringify(input.state)).toBe(before)
  })

  it('cleans StrictMode setup and unmount and keeps one live frame', () => {
    const input = props()
    const view = render(<StrictMode><PlateEscapeScene {...input} /></StrictMode>)
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
    expect(frames.size).toBe(1)
    expect(graphics.dispose).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(frames.size).toBe(0)
    expect(graphics.dispose).toHaveBeenCalledTimes(2)
  })
})
