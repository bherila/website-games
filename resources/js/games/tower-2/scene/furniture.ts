/**
 * Low-poly furniture so each use reads at a glance: a café's counter and
 * tables, a shop's shelves and till, an office's desks, a studio's bed. Pieces
 * are laid out in room-local terms (u across the door wall, v inward from it)
 * and turned with the room, so the layout faces the door whichever way the
 * room is turned.
 */
import type { Facing, Room } from '../engine/building'
import type { UseKind } from '../engine/uses'

/** One box in room-local units: u across the door wall (0 to the use's width), v inward (0 at the door wall). */
export interface Piece {
  u0: number
  u1: number
  v0: number
  v1: number
  /** Height above the room's floor. */
  h0: number
  h1: number
  hex: number
}

const WOOD = 0xc98b5a
const WHITE = 0xf7f3ee
const STEEL = 0x8c8aa8
const SCREEN = 0x23214a
const GREEN = 0x3fbf7f

function piece(u0: number, u1: number, v0: number, v1: number, h0: number, h1: number, hex: number): Piece {
  return { u0, u1, v0, v1, h0, h1, hex }
}

/** A table with a chair on each side of it across u. */
function tableWithChairs(u: number, v: number, accent: number): Piece[] {
  return [
    piece(u - 0.24, u + 0.24, v - 0.24, v + 0.24, 0.22, 0.28, WOOD),
    piece(u - 0.05, u + 0.05, v - 0.05, v + 0.05, 0, 0.22, STEEL),
    piece(u - 0.48, u - 0.3, v - 0.1, v + 0.1, 0, 0.16, accent),
    piece(u + 0.3, u + 0.48, v - 0.1, v + 0.1, 0, 0.16, accent),
  ]
}

/** The pieces for a use, in its own width × depth (the door wall is v = 0, its middle left clear). */
export function furniture(use: UseKind, accent: number): Piece[] {
  switch (use) {
    case 'studio':
      return [
        // Bed against the back wall, sofa and rug by the door, kitchenette in the back corner.
        piece(0.25, 1.75, 2.55, 3.8, 0, 0.18, WHITE),
        piece(0.3, 1.7, 3.5, 3.78, 0.18, 0.26, accent),
        piece(1.95, 2.8, 0.75, 1.15, 0, 0.24, accent),
        piece(1.95, 2.8, 1.05, 1.15, 0.24, 0.36, accent),
        piece(0.4, 1.5, 0.9, 1.9, 0, 0.015, 0xffd6e8),
        piece(2.2, 2.85, 3.15, 3.85, 0, 0.42, STEEL),
      ]
    case 'office': {
      // Two rows of desks facing the door, each with a screen, and a plant in a corner.
      const desks: Piece[] = []
      for (const v of [1.7, 3.3]) {
        desks.push(piece(0.4, 3.6, v, v + 0.55, 0.22, 0.28, WOOD))
        for (const u of [0.95, 2.0, 3.05]) {
          desks.push(piece(u - 0.22, u + 0.22, v + 0.42, v + 0.5, 0.28, 0.5, SCREEN))
          desks.push(piece(u - 0.14, u + 0.14, v - 0.32, v - 0.08, 0, 0.18, accent))
        }
      }
      desks.push(piece(3.55, 3.85, 4.55, 4.85, 0, 0.45, GREEN))
      return desks
    }
    case 'shop':
      // Shelving down both side walls, a display table in the middle, the till by the door.
      return [
        piece(0.12, 0.42, 0.9, 2.85, 0, 0.55, WHITE),
        piece(0.12, 0.42, 0.9, 2.85, 0.55, 0.6, accent),
        piece(2.58, 2.88, 0.9, 2.85, 0, 0.55, WHITE),
        piece(2.58, 2.88, 0.9, 2.85, 0.55, 0.6, accent),
        piece(1.15, 1.85, 1.6, 2.3, 0, 0.26, accent),
        piece(1.95, 2.45, 0.35, 0.7, 0, 0.34, WOOD),
        piece(2.05, 2.25, 0.45, 0.6, 0.34, 0.44, SCREEN),
      ]
    case 'cafe':
      // A counter across the back with a coffee machine, and tables out front.
      return [
        piece(0.35, 3.65, 3.3, 3.75, 0, 0.38, WOOD),
        piece(0.35, 3.65, 3.3, 3.75, 0.38, 0.42, accent),
        piece(0.6, 0.95, 3.4, 3.65, 0.42, 0.62, STEEL),
        ...tableWithChairs(0.95, 1.25, accent),
        ...tableWithChairs(3.05, 1.25, accent),
        ...tableWithChairs(2.0, 2.35, accent),
      ]
  }
}

/** A piece's footprint on the site for a room's position and facing. */
export function placePiece(room: Pick<Room, 'x' | 'y' | 'width' | 'depth'> & { facing: Facing }, item: Piece): { x0: number, x1: number, y0: number, y1: number } {
  const { x, y, width, depth, facing } = room
  // Each facing maps (u, v) onto the site with the door wall at v = 0.
  const map = (u: number, v: number): [number, number] => {
    if (facing === 'south') return [x + u, y + depth - v]
    if (facing === 'north') return [x + width - u, y + v]
    if (facing === 'east') return [x + width - v, y + u]
    return [x + v, y + depth - u]
  }
  const [ax, ay] = map(item.u0, item.v0)
  const [bx, by] = map(item.u1, item.v1)
  return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by) }
}
