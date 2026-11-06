import * as THREE from 'three'

import { loadAtlas } from '../atlasMaterials'
import { attachBackdrop } from '../backdrop'
import { loadFloorAtlas } from '../floorMaterials'
import { Tower2Renderer } from '../Tower2Renderer'

jest.mock('three', () => ({ ...jest.requireActual('three'), WebGLRenderer: jest.fn() }))
jest.mock('../backdrop', () => ({ attachBackdrop: jest.fn() }))
jest.mock('../floorMaterials', () => ({ loadFloorAtlas: jest.fn() }))
jest.mock('../atlasMaterials', () => ({ loadAtlas: jest.fn() }))

afterEach(() => jest.restoreAllMocks())

test('releases earlier startup resources and the renderer when later atlas setup fails', () => {
  const releaseBackdrop = jest.fn()
  const releaseFloorAtlas = jest.fn()
  const webgl = { setClearColor: jest.fn(), dispose: jest.fn() }
  jest.mocked(THREE.WebGLRenderer).mockImplementation(() => webgl as unknown as THREE.WebGLRenderer)
  jest.mocked(attachBackdrop).mockReturnValue(releaseBackdrop)
  jest.mocked(loadFloorAtlas).mockReturnValue(releaseFloorAtlas)
  jest.mocked(loadAtlas).mockImplementationOnce(() => { throw new Error('Atlas initialization failed') })
  const disposeMaterial = jest.spyOn(THREE.MeshBasicMaterial.prototype, 'dispose')
  expect(() => new Tower2Renderer(document.createElement('canvas'), { width: 40, depth: 40 })).toThrow('Atlas initialization failed')
  expect(releaseBackdrop).toHaveBeenCalledTimes(1)
  expect(releaseFloorAtlas).toHaveBeenCalledTimes(1)
  expect(webgl.dispose).toHaveBeenCalledTimes(1)
  expect(disposeMaterial).toHaveBeenCalledTimes(6)
})

test('releases preallocated materials when WebGL construction itself fails', () => {
  jest.mocked(THREE.WebGLRenderer).mockImplementationOnce(() => { throw new Error('WebGL unavailable') })
  const disposeMaterial = jest.spyOn(THREE.MeshBasicMaterial.prototype, 'dispose')
  expect(() => new Tower2Renderer(document.createElement('canvas'), { width: 40, depth: 40 })).toThrow('WebGL unavailable')
  expect(disposeMaterial).toHaveBeenCalledTimes(6)
})
