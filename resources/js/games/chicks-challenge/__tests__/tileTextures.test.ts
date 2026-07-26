/**
 * Exhaustiveness + smoke tests for the procedural tile drawers. These run in
 * the DOM-less node Jest project, so drawers are exercised against a stub
 * CanvasRenderingContext2D (every method call/property write is a no-op)
 * rather than a real canvas — tileTextures.ts never touches `document`
 * except inside `createCanvasTexture`, which this test never calls.
 */
import type { TileKind } from '../engine/types'
import { LEGEND } from '../levels/legend'
import { TILE_DRAWERS } from '../scene/tileTextures'

function createStubContext(): CanvasRenderingContext2D {
  const gradientStub = { addColorStop: () => undefined }
  const store: Record<string, unknown> = {}

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => gradientStub
      }
      if (prop in target) {
        return target[prop as string]
      }
      // Any other method call (fillRect, arc, beginPath, moveTo, ...) is a no-op.
      return () => undefined
    },
    set(target, prop, value) {
      target[prop as string] = value
      return true
    },
  }

  return new Proxy(store, handler) as unknown as CanvasRenderingContext2D
}

function legendTileKinds(): Set<TileKind> {
  const kinds = new Set<TileKind>()
  for (const entry of Object.values(LEGEND)) {
    if (entry.kind === 'tile') {
      kinds.add(entry.tile)
    }
  }
  return kinds
}

describe('TILE_DRAWERS exhaustiveness', () => {
  it('has exactly one drawer per TileKind used by the legend (single source of truth)', () => {
    const expected = legendTileKinds()
    const actual = new Set(Object.keys(TILE_DRAWERS) as TileKind[])
    expect(actual).toEqual(expected)
  })

  it('every drawer is a function', () => {
    for (const kind of Object.keys(TILE_DRAWERS) as TileKind[]) {
      expect(typeof TILE_DRAWERS[kind]).toBe('function')
    }
  })

  it('every drawer renders without throwing against a stub 2D context', () => {
    for (const kind of Object.keys(TILE_DRAWERS) as TileKind[]) {
      expect(() => TILE_DRAWERS[kind](createStubContext(), 128)).not.toThrow()
    }
  })
})
