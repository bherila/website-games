import type * as THREE from 'three'

import { createRng } from '../engine/rng'
import type { WeatherKind } from '../maps/mapTypes'
import { createWeather } from '../scene/weather'

const KINDS: WeatherKind[] = ['snow', 'rain', 'sandstorm']

function readPositions(effect: ReturnType<typeof createWeather>): Float32Array {
  return effect.points.geometry.getAttribute('position').array as Float32Array
}

describe('hover weather', () => {
  test.each(KINDS)('%s: builds a particle cloud that is never frustum-culled', (kind) => {
    const effect = createWeather(kind)
    expect(effect.kind).toBe(kind)
    expect(effect.points.frustumCulled).toBe(false)
    expect(readPositions(effect).length).toBeGreaterThan(0)
    expect(readPositions(effect).length % 3).toBe(0)
  })

  test.each(KINDS)('%s: particles stay wrapped inside the box around the player', (kind) => {
    const effect = createWeather(kind)
    const positions = readPositions(effect)
    const count = positions.length / 3

    for (let frame = 0; frame < 240; frame++) {
      effect.update(1 / 60, 300, -150)
    }

    for (let i = 0; i < count; i++) {
      const x = positions[i * 3] ?? Number.NaN
      const y = positions[i * 3 + 1] ?? Number.NaN
      const z = positions[i * 3 + 2] ?? Number.NaN
      expect(Number.isFinite(x)).toBe(true)
      expect(Math.abs(x - 300)).toBeLessThanOrEqual(50)
      expect(Math.abs(z - -150)).toBeLessThanOrEqual(50)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(30)
    }
  })

  test('rain actually falls between updates', () => {
    const effect = createWeather('rain')
    const positions = readPositions(effect)
    const before = positions[1] ?? 0

    effect.update(0.005, 0, 0)

    const after = positions[1] ?? 0
    const boxHeight = 28
    const fell = after < before || after > before + boxHeight / 2
    expect(fell).toBe(true)
  })

  test('a seeded random source makes the cloud deterministic', () => {
    const a = createWeather('snow', createRng(42))
    const b = createWeather('snow', createRng(42))
    expect(Array.from(readPositions(a))).toEqual(Array.from(readPositions(b)))

    a.update(1 / 60, 0, 0)
    b.update(1 / 60, 0, 0)
    expect(Array.from(readPositions(a))).toEqual(Array.from(readPositions(b)))
  })

  test('update marks the position attribute for re-upload', () => {
    const effect = createWeather('snow')
    const attribute = effect.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const versionBefore = attribute.version

    effect.update(1 / 60, 0, 0)

    expect(attribute.version).toBeGreaterThan(versionBefore)
  })
})
