import * as THREE from 'three'

import { FACINGS, STOREFRONT_USES } from '../../engine/building'
import { LOBBY_SIGN, SIGN_HEIGHT, SIGN_NAMES, SIGN_PADDING, SIGN_STRIDE_X, SIGN_STRIDE_Y, SIGN_WIDTH, signChoice, signUV, wallFace, wallNormal, wallPoint } from '../storefronts'

describe('original storefront signs', () => {
  test('every storefront use has three stable variants, independent of call and render order', () => {
    expect([...STOREFRONT_USES].sort()).toEqual(['cafe', 'shop'])
    for (const use of STOREFRONT_USES) {
      const choices = Array.from({ length: 60 }, (_, id) => signChoice(use, id + 1))
      expect(new Set(choices)).toEqual(new Set(use === 'shop' ? [0, 1, 2] : [3, 4, 5]))
      for (let id = 60; id >= 1; id--) {
        signChoice(use, 1000 + id)
        expect(signChoice(use, id)).toBe(choices[id - 1])
      }
    }
    expect(SIGN_NAMES[LOBBY_SIGN]).toBe('42')
    expect(signChoice('studio', 3)).toBeNull()
    expect(signChoice('office', 7)).toBeNull()
    expect(signChoice('shop', -1)).toBeNull()
  })

  test.each(SIGN_NAMES.map((name, index) => [name, index] as const))('%s stays inside its own atlas cell', (_name, index) => {
    const x0 = (index % 2) * SIGN_STRIDE_X + SIGN_PADDING
    const y0 = Math.floor(index / 2) * SIGN_STRIDE_Y + SIGN_PADDING
    for (const u of [0, 0.5, 1]) for (const v of [0, 0.5, 1]) {
      const uv = signUV(index, u, v)
      expect(uv[0] * SIGN_STRIDE_X * 2).toBeGreaterThan(x0)
      expect(uv[0] * SIGN_STRIDE_X * 2).toBeLessThan(x0 + SIGN_WIDTH)
      expect((1 - uv[1]) * SIGN_STRIDE_Y * 4).toBeGreaterThan(y0)
      expect((1 - uv[1]) * SIGN_STRIDE_Y * 4).toBeLessThan(y0 + SIGN_HEIGHT)
    }
  })

  test.each(FACINGS)('the %s sign faces outward, reads left-to-right and sits proud of its wall', side => {
    const face = wallFace(3, 5, side, 0.05, 0.95, 0.8, 1.04, 0.09).map(point => new THREE.Vector3(...point))
    const normal = new THREE.Vector3(...wallNormal(side))
    const geometricNormal = face[1]!.clone().sub(face[0]!).cross(face[2]!.clone().sub(face[0]!)).normalize()
    expect(geometricNormal.dot(normal)).toBeCloseTo(1)
    const right = normal.clone().cross(new THREE.Vector3(0, 1, 0)).negate()
    expect(face[1]!.clone().sub(face[0]!).dot(right)).toBeGreaterThan(0)
    const wall = new THREE.Vector3(...wallPoint(3, 5, side, 0.5, 0.9, 0))
    expect(face[0]!.clone().sub(wall).dot(normal)).toBeCloseTo(0.09)
    expect(face[2]!.y).toBeGreaterThan(face[0]!.y)
  })
})
