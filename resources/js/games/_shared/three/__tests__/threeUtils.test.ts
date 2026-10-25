import * as THREE from 'three'

import { clearGroup, disposeObject, hexColor } from '../threeUtils'

function watch<T extends THREE.EventDispatcher<{ dispose: object }>>(target: T): { disposed: boolean } {
  const state = { disposed: false }
  target.addEventListener('dispose', () => { state.disposed = true })
  return state
}

test('disposes owned resources but leaves cached geometry and textures shared across objects', () => {
  const ownGeometry = new THREE.BoxGeometry()
  const cachedGeometry = new THREE.BoxGeometry()
  cachedGeometry.userData.cached = true
  const ownNormal = new THREE.Texture()
  const cachedMap = new THREE.Texture()
  cachedMap.userData.cached = true
  const material = new THREE.MeshStandardMaterial({ map: cachedMap, normalMap: ownNormal })
  const group = new THREE.Group()
  group.add(new THREE.Mesh(ownGeometry, material), new THREE.Mesh(cachedGeometry, new THREE.MeshBasicMaterial()))
  const watched = { ownGeometry: watch(ownGeometry), cachedGeometry: watch(cachedGeometry), ownNormal: watch(ownNormal), cachedMap: watch(cachedMap), material: watch(material) }

  disposeObject(group)

  expect(watched.ownGeometry.disposed).toBe(true)
  expect(watched.ownNormal.disposed).toBe(true)
  expect(watched.material.disposed).toBe(true)
  expect(watched.cachedGeometry.disposed).toBe(false)
  expect(watched.cachedMap.disposed).toBe(false)
})

test('disposes lights and instanced-mesh buffers, and clearGroup detaches every child', () => {
  const light = new THREE.DirectionalLight()
  const lightDispose = jest.spyOn(light, 'dispose')
  const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 4)
  const instancedDispose = jest.spyOn(instanced, 'dispose')
  const group = new THREE.Group()
  group.add(light, instanced)

  clearGroup(group)

  expect(group.children).toHaveLength(0)
  expect(lightDispose).toHaveBeenCalled()
  expect(instancedDispose).toHaveBeenCalled()
})

test('hexColor clamps to a six-digit CSS color', () => {
  expect(hexColor(0x1a2b3c)).toBe('#1a2b3c')
  expect(hexColor(-5)).toBe('#000000')
  expect(hexColor(0x1000000)).toBe('#ffffff')
})
