import * as THREE from 'three'

import { placementWalls } from '../board/grid'
import { PIECE_IDS, PIECES } from '../pieces/pieceCatalog'
import { createPieceMesh } from '../scene/builders/pieceMesh'
import { wallOutline } from '../scene/builders/wallGeometry'

const BOARD = { cols: 8, rows: 8 }

describe('piece meshes', () => {
  it.each(PIECE_IDS)('%s builds for every variant, flip and style', (pieceId) => {
    PIECES[pieceId].variants.forEach((_, variant) => {
      for (const flipped of [false, true]) {
        for (const style of ['player', 'fixed', 'ghost-ok', 'ghost-bad'] as const) {
          const mesh = createPieceMesh(BOARD, { pieceId, col: 2, row: 2, variant, flipped }, style)
          let vertices = 0
          mesh.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              vertices += (child.geometry as THREE.BufferGeometry).getAttribute('position').count
            }
          })

          expect(vertices).toBeGreaterThan(0)
          expect(Boolean(mesh.spring)).toBe(Boolean(PIECES[pieceId].behavior))
        }
      }
    })
  })

  it('draws a wall’s solid on the same side the physics puts it', () => {
    const [floor] = placementWalls(BOARD, { pieceId: 'track-short', col: 0, row: 7, variant: 0, flipped: false })
    if (!floor) {
      throw new Error('missing wall')
    }
    const outline = wallOutline(floor)

    // Surface at y = SURFACE; the solid extends *below* it by the wall thickness.
    expect(Math.min(...outline.map(([, y]) => y))).toBeCloseTo(floor.points[0]![1] - floor.thickness)
    expect(Math.max(...outline.map(([, y]) => y))).toBeCloseTo(floor.points[0]![1])
  })
})
