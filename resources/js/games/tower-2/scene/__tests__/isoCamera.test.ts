import * as THREE from 'three'

import { applyCamera, clampZoom, FLOOR_HEIGHT, followFloor, frameRect, type IsoView, MAX_ZOOM, panView, projectionFor, rotateView, zoomViewAt } from '../isoCamera'
import type { QuarterTurn } from '../isoProjection'

const viewport = { width: 800, height: 600 }

/** Where the real three.js camera draws a world point, in CSS pixels. */
function drawnAt(view: IsoView, x: number, y: number, floor: number) {
  const camera = new THREE.OrthographicCamera()
  applyCamera(camera, view, viewport)
  const ndc = new THREE.Vector3(x, floor * FLOOR_HEIGHT, y).project(camera)
  return { x: (ndc.x + 1) / 2 * viewport.width, y: (1 - ndc.y) / 2 * viewport.height }
}

describe('camera and picking agree', () => {
  test.each([0, 1, 2, 3] as QuarterTurn[])('at rotation %i, drawn positions match the projection and pick back to their tile', (rotation) => {
    const view: IsoView = { zoom: 23, rotation, origin: { x: 310, y: 170 } }
    const projection = projectionFor(view)
    for (const [x, y, floor] of [[0, 0, 0], [12.5, 30.5, 2], [39.5, 0.5, 5], [7.25, 18.75, 3]] as const) {
      const expected = projection.tileToScreen({ x, y, floor })
      const actual = drawnAt(view, x, y, floor)
      expect(actual.x).toBeCloseTo(expected.x, 6)
      expect(actual.y).toBeCloseTo(expected.y, 6)
      expect(projection.screenToTile(actual, floor)).toEqual({ x: Math.floor(x), y: Math.floor(y), floor })
    }
  })
})

describe('view changes', () => {
  const view: IsoView = { zoom: 20, rotation: 0, origin: { x: 400, y: 100 } }

  test('pan moves content by the dragged pixels', () => {
    const before = projectionFor(view).tileToScreen({ x: 5, y: 5, floor: 1 })
    const after = projectionFor(panView(view, 30, -12)).tileToScreen({ x: 5, y: 5, floor: 1 })
    expect([after.x - before.x, after.y - before.y]).toEqual([30, -12])
  })

  test('zoom keeps the point under the cursor fixed, within limits', () => {
    const cursor = { x: 250, y: 330 }
    const world = projectionFor(view).screenToFloor(cursor, 2)
    const zoomed = zoomViewAt(view, 1.5, cursor, 2)
    expect(zoomed.zoom).toBe(30)
    const at = projectionFor(zoomed).tileToScreen(world)
    expect(at.x).toBeCloseTo(cursor.x, 6)
    expect(at.y).toBeCloseTo(cursor.y, 6)
    expect(zoomViewAt(view, 100, cursor, 2).zoom).toBe(MAX_ZOOM)
    expect(clampZoom(0)).toBeGreaterThan(0)
  })

  test('rotation turns about the viewport centre and wraps', () => {
    const centre = { x: 400, y: 300 }
    const world = projectionFor(view).screenToFloor(centre, 1)
    const turned = rotateView(view, -1, viewport, 1)
    expect(turned.rotation).toBe(3)
    const at = projectionFor(turned).tileToScreen(world)
    expect(at.x).toBeCloseTo(400, 6)
    expect(at.y).toBeCloseTo(300, 6)
    expect(rotateView(turned, 5, viewport, 1).rotation).toBe(0)
  })

  test('stepping floors keeps the active floor in place, and framing centres a rectangle', () => {
    const centre = { x: 400, y: 300 }
    const below = projectionFor(view).screenToFloor(centre, 0)
    const up = followFloor(view, 0, 3, viewport)
    const at = projectionFor(up).tileToScreen({ ...below, floor: 3 })
    expect(at.x).toBeCloseTo(400, 6)
    expect(at.y).toBeCloseTo(300, 6)
    const framed = frameRect(viewport, { x: 10, y: 10, width: 20, depth: 12 }, 0)
    const mid = projectionFor(framed).tileToScreen({ x: 20, y: 16, floor: 0 })
    expect(mid.x).toBeCloseTo(400, 6)
    expect(mid.y).toBeCloseTo(300, 6)
    const bounds = projectionFor(framed).floorBounds({ x: 10, y: 10, width: 20, depth: 12, floor: 0 })
    expect(bounds.width).toBeLessThanOrEqual(viewport.width)
    expect(bounds.height).toBeLessThanOrEqual(viewport.height)
  })
})
