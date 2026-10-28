import * as THREE from 'three'

import { loadAtlas } from '../atlasMaterials'

test('signs stay hidden until loaded, share their atlas, and cannot reattach after disposal', () => {
  const texture = new THREE.Texture<HTMLImageElement>()
  const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22 })]
  let ready: (texture: THREE.Texture<HTMLImageElement>) => void = () => {}
  let fail: () => void = () => {}
  const loader: Pick<THREE.TextureLoader, 'load'> = { load(_url, onLoad, _progress, onError) {
    ready = onLoad!
    fail = () => onError!(new Error('Unavailable image'))
    return texture
  } }
  const dispose = jest.spyOn(texture, 'dispose')
  const release = loadAtlas(materials, 'signs.webp', { loader, hideUntilLoaded: true })
  expect(materials.every(material => !material.visible && material.map === null)).toBe(true)
  fail()
  expect(materials.every(material => !material.visible && material.map === null)).toBe(true)
  ready(texture)
  expect(materials.every(material => material.visible && material.map === texture)).toBe(true)
  expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
  expect(texture.userData.cached).toBe(true)
  expect(materials[1]!.opacity).toBe(0.22)
  release()
  release()
  ready(texture)
  fail()
  expect(dispose).toHaveBeenCalledTimes(1)
  expect(materials.every(material => !material.visible && material.map === null)).toBe(true)
})
