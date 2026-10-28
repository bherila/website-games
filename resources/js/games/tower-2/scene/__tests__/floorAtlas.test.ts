import * as THREE from 'three'

import { FINISH_ATLAS_HEIGHT, FINISH_ATLAS_WIDTH, FINISH_CELL, FINISH_INDEX, FINISH_PADDING, FINISH_REPEAT, FINISH_STRIDE, finishSpans, finishUV, type FloorFinish } from '../floorAtlas'
import { GeometryBuilder } from '../floorGeometry'
import { loadFloorAtlas } from '../floorMaterials'

describe('floor atlas mapping', () => {
  test.each(Object.keys(FINISH_INDEX) as FloorFinish[])('%s maps only inside its padded cell', finish => {
    const index = FINISH_INDEX[finish]
    const left = (index % 4) * FINISH_STRIDE + FINISH_PADDING
    const top = Math.floor(index / 4) * FINISH_STRIDE + FINISH_PADDING
    for (const u of [0, 0.25, 0.5, 1]) for (const v of [0, 0.25, 0.5, 1]) {
      const uv = finishUV(finish, u, v)
      expect(uv[0] * FINISH_ATLAS_WIDTH).toBeGreaterThan(left)
      expect(uv[0] * FINISH_ATLAS_WIDTH).toBeLessThan(left + FINISH_CELL)
      expect((1 - uv[1]) * FINISH_ATLAS_HEIGHT).toBeGreaterThan(top)
      expect((1 - uv[1]) * FINISH_ATLAS_HEIGHT).toBeLessThan(top + FINISH_CELL)
    }
  })

  test('splits partial and negative runs exactly at repeat boundaries', () => {
    expect(finishSpans(0.04, 4.96)).toEqual([[0.04, 2], [2, 4], [4, 4.96]])
    expect(finishSpans(-3, 1)).toEqual([[-3, -2], [-2, 0], [0, 1]])
    expect(finishSpans(2, 2)).toEqual([])
    expect(FINISH_REPEAT).toBe(2)
  })

  test('floor tops repeat without interpolating through another cell; walls keep a neutral texel', () => {
    const out = new GeometryBuilder()
    out.box(0.04, 0, 0.04, 4.96, 0.03, 2.96, 0xffffff, 'studio')
    const geometry = out.build()
    const uv = geometry.getAttribute('uv')
    const positions = geometry.getAttribute('position')
    // 3×2 top quads and four unsplit side quads, still in one geometry/material.
    expect(positions.count).toBe(10 * 4)
    expect(uv.count).toBe(positions.count)
    const neutral = finishUV('neutral', 0.5, 0.5)
    for (let i = 0; i < uv.count; i++) {
      if (i < 24) {
        expect(uv.getX(i)).toBeGreaterThan(0)
        expect(uv.getX(i)).toBeLessThan(0.25)
        expect(uv.getY(i)).toBeGreaterThan(0.5)
      } else {
        expect(uv.getX(i)).toBeCloseTo(neutral[0])
        expect(uv.getY(i)).toBeCloseTo(neutral[1])
      }
    }
    geometry.dispose()
  })
})

function pendingAtlas() {
  const texture = new THREE.Texture<HTMLImageElement>()
  const materials = [new THREE.MeshBasicMaterial({ vertexColors: true }), new THREE.MeshBasicMaterial({ vertexColors: true, opacity: 0.22, transparent: true })]
  let ready: (texture: THREE.Texture<HTMLImageElement>) => void = () => { throw new Error('No load callback') }
  let fail: () => void = () => { throw new Error('No error callback') }
  const loader: Pick<THREE.TextureLoader, 'load'> = { load(_url, onLoad, _progress, onError) {
    ready = onLoad!
    fail = () => onError!(new Error('Unavailable image'))
    return texture
  } }
  const release = loadFloorAtlas(materials, loader)
  return { texture, materials, ready: () => ready(texture), fail: () => fail(), release }
}

describe('floor texture fallback and lifetime', () => {
  test('keeps the original vertex colours before loading and after failure', () => {
    const atlas = pendingAtlas()
    for (const material of atlas.materials) expect(material.map).toBeNull()
    atlas.fail()
    for (const material of atlas.materials) {
      expect(material.map).toBeNull()
      expect(material.vertexColors).toBe(true)
    }
    atlas.release()
  })

  test('shares one complete sRGB atlas between solid and ghost floors and releases it once', () => {
    const atlas = pendingAtlas()
    const disposed = jest.spyOn(atlas.texture, 'dispose')
    atlas.ready()
    for (const material of atlas.materials) expect(material.map).toBe(atlas.texture)
    expect(atlas.texture.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(atlas.texture.userData.cached).toBe(true)
    expect(atlas.materials[1]!.opacity).toBe(0.22)
    atlas.release()
    atlas.release()
    expect(disposed).toHaveBeenCalledTimes(1)
    for (const material of atlas.materials) expect(material.map).toBeNull()
  })

  test('a late image or failure cannot attach to a disposed scene', () => {
    const atlas = pendingAtlas()
    const disposed = jest.spyOn(atlas.texture, 'dispose')
    atlas.release()
    atlas.ready()
    atlas.fail()
    expect(disposed).toHaveBeenCalledTimes(1)
    for (const material of atlas.materials) expect(material.map).toBeNull()
  })
})
