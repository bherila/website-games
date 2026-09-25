import * as THREE from 'three'

import type { WorldWall } from '../../board/grid'
import type { Vec2 } from '../../pieces/pieceCatalog'

/** Depth (z) of piece bodies. The marble rolls in the z = 0 plane. */
export const PIECE_DEPTH = 0.6

/**
 * The solid outline of a wall: its surface polyline plus the same line pushed along the
 * right-hand normal by the wall thickness. Mirrors how the physics boxes are laid out.
 */
export function wallOutline(wall: WorldWall): Vec2[] {
  const points = wall.points
  const offset: Vec2[] = points.map((point, index) => {
    const prev = points[Math.max(0, index - 1)] as Vec2
    const next = points[Math.min(points.length - 1, index + 1)] as Vec2
    const dx = next[0] - prev[0]
    const dy = next[1] - prev[1]
    const length = Math.hypot(dx, dy) || 1

    return [point[0] + ((dy / length) * wall.thickness), point[1] - ((dx / length) * wall.thickness)]
  })

  return [...points, ...offset.reverse()]
}

/** Extruded, lightly bevelled prism for one wall, centred on z = 0. */
export function createWallGeometry(wall: WorldWall, depth = PIECE_DEPTH): THREE.ExtrudeGeometry {
  const outline = wallOutline(wall)
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)))
  const bevel = Math.min(0.025, wall.thickness * 0.25)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - (bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  })
  geometry.translate(0, 0, -(depth / 2) + bevel)

  return geometry
}
