import * as THREE from 'three'

import { LEVELS } from '../levels/levels'
import { createPegboard } from '../scene/builders/boardMesh'
import { buildOwned, own } from '../scene/resourceScope'
import { MarbleWorksSceneController } from '../scene/sceneController'

jest.mock('../scene/textures', () => ({
  ...jest.requireActual('../scene/textures'),
  canvasTexture: jest.fn(() => new THREE.Texture()),
}))
jest.mock('../scene/builders/boardMesh', () => ({
  ...jest.requireActual('../scene/builders/boardMesh'),
  createPegboard: jest.fn(jest.requireActual('../scene/builders/boardMesh').createPegboard),
}))
jest.mock('three', () => {
  const actual = jest.requireActual('three')
  return { ...actual, WebGLRenderer: jest.fn(), PMREMGenerator: jest.fn() }
})

const rendererFactory = jest.mocked(THREE.WebGLRenderer)
const pmremFactory = jest.mocked(THREE.PMREMGenerator)
const pegboardFactory = jest.mocked(createPegboard)
let renderer: { setPixelRatio: jest.Mock; getContext: jest.Mock; setSize: jest.Mock; render: jest.Mock; dispose: jest.Mock; shadowMap: object }
let target: THREE.WebGLRenderTarget
let generator: { fromEquirectangular: jest.Mock; dispose: jest.Mock }

beforeEach(() => {
  renderer = { setPixelRatio: jest.fn(), getContext: jest.fn(() => ({ getExtension: () => null, getParameter: () => 'software' })), setSize: jest.fn(), render: jest.fn(), dispose: jest.fn(), shadowMap: {} }
  target = new THREE.WebGLRenderTarget()
  generator = { fromEquirectangular: jest.fn(() => target), dispose: jest.fn() }
  rendererFactory.mockImplementation(() => renderer as unknown as THREE.WebGLRenderer)
  pmremFactory.mockImplementation(() => generator as unknown as THREE.PMREMGenerator)
  pegboardFactory.mockImplementation(jest.requireActual('../scene/builders/boardMesh').createPegboard)
})
afterEach(() => jest.restoreAllMocks())

it.each(['renderer', 'configuration', 'environment', 'board'] as const)('releases partially constructed graphics after %s fails', (stage) => {
  const targetDispose = jest.spyOn(target, 'dispose')
  if (stage === 'renderer') rendererFactory.mockImplementationOnce(() => { throw new Error(stage) })
  if (stage === 'configuration') renderer.setPixelRatio.mockImplementationOnce(() => { throw new Error(stage) })
  if (stage === 'environment') generator.fromEquirectangular.mockImplementationOnce(() => { throw new Error(stage) })
  if (stage === 'board') pegboardFactory.mockImplementationOnce(() => { throw new Error(stage) })
  expect(() => new MarbleWorksSceneController(document.createElement('canvas'), LEVELS[0]!, { reducedMotion: true, onError: jest.fn() })).toThrow(stage)
  expect(renderer.dispose).toHaveBeenCalledTimes(stage === 'renderer' ? 0 : 1)
  if (stage === 'environment' || stage === 'board') expect(generator.dispose).toHaveBeenCalledTimes(1)
  if (stage === 'board') expect(targetDispose.mock.invocationCallOrder[0]).toBeLessThan(renderer.dispose.mock.invocationCallOrder[0]!)
})

it('waits for a populated first render before RAF; late RAF cannot render a disposed scene', () => {
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(42)
  const cancel = jest.spyOn(window, 'cancelAnimationFrame')
  const onError = jest.fn()
  const scene = new MarbleWorksSceneController(document.createElement('canvas'), LEVELS[0]!, { reducedMotion: true, onError })
  expect(raf).not.toHaveBeenCalled()
  scene.resize(600, 800)
  scene.setPlacements([{ uid: 'one', pieceId: 'ramp-steep', col: 1, row: 3, variant: 0, flipped: false }])
  scene.renderFirstFrame()
  expect(renderer.render).toHaveBeenCalledTimes(1)
  const frame = raf.mock.calls[0]![0]
  renderer.render.mockImplementationOnce(() => { throw new Error('frame failed') })
  frame(16)
  expect(onError).toHaveBeenCalledTimes(1)
  scene.dispose()
  frame(32)
  expect(renderer.render).toHaveBeenCalledTimes(2)
  expect(cancel).toHaveBeenCalledWith(42)
})

it('releases scene textures, light shadows, instance buffers and the environment before the renderer even when disposal fails', () => {
  const scene = new MarbleWorksSceneController(document.createElement('canvas'), LEVELS[0]!, { reducedMotion: true, onError: jest.fn() })
  const texture = jest.spyOn(THREE.Texture.prototype, 'dispose').mockImplementation(() => { throw new Error('texture release failed') })
  const geometry = jest.spyOn(THREE.BufferGeometry.prototype, 'dispose')
  const material = jest.spyOn(THREE.Material.prototype, 'dispose')
  const instance = jest.spyOn(THREE.InstancedMesh.prototype, 'dispose')
  const light = jest.spyOn(THREE.DirectionalLight.prototype, 'dispose')
  const environment = jest.spyOn(target, 'dispose')
  scene.dispose()
  scene.dispose()
  for (const disposal of [texture, geometry, material, instance, light, environment]) {
    expect(disposal).toHaveBeenCalled()
    expect(disposal.mock.invocationCallOrder[0]).toBeLessThan(renderer.dispose.mock.invocationCallOrder[0]!)
  }
  expect(renderer.dispose).toHaveBeenCalledTimes(1)
})

it('factory ownership releases unattached resources and keeps the original failure when one disposer throws', () => {
  const geometry = { dispose: jest.fn(() => { throw new Error('cleanup failed') }) }
  const texture = { dispose: jest.fn() }
  expect(() => buildOwned(() => {
    own(texture)
    buildOwned(() => { own(geometry); throw new Error('factory failed') })
  })).toThrow('factory failed')
  expect(geometry.dispose).toHaveBeenCalledTimes(1)
  expect(texture.dispose).toHaveBeenCalledTimes(1)
})
