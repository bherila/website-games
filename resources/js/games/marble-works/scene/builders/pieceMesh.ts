import * as THREE from 'three'

import { type BoardSize, localToWorld, placementWalls, type WorldWall } from '../../board/grid'
import type { PiecePlacement } from '../../levels/levelTypes'
import { PIECES, type Vec2 } from '../../pieces/pieceCatalog'
import {
  FAMILY_COLORS,
  FIXED_PIECE_COLOR,
  GHOST_BAD_COLOR,
  GHOST_OK_COLOR,
  TRAMPOLINE_COLOR,
} from '../palette'
import { createWallGeometry, PIECE_DEPTH } from './wallGeometry'

export type PieceMeshStyle = 'player' | 'fixed' | 'ghost-ok' | 'ghost-bad'

export interface PieceMesh {
  group: THREE.Group
  /** Sub-group that squashes when a launcher fires / trampoline bounces. */
  spring: THREE.Group | null
}

const FRONT_Z = (PIECE_DEPTH / 2) + 0.002

function solidMaterial(color: string, style: PieceMeshStyle, options: { transparent?: boolean; opacity?: number; roughness?: number } = {}): THREE.Material {
  if (style === 'ghost-ok' || style === 'ghost-bad') {
    return new THREE.MeshBasicMaterial({
      color: style === 'ghost-ok' ? GHOST_OK_COLOR : GHOST_BAD_COLOR,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
  }

  return new THREE.MeshStandardMaterial({
    color: style === 'fixed' ? FIXED_PIECE_COLOR : color,
    roughness: options.roughness ?? 0.35,
    metalness: 0.05,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  })
}

function addWall(group: THREE.Group, wall: WorldWall, material: THREE.Material, castShadow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(createWallGeometry(wall), material)
  mesh.castShadow = castShadow
  mesh.receiveShadow = true
  group.add(mesh)

  return mesh
}

function tangentAt(points: readonly Vec2[], index: number): Vec2 {
  const a = points[Math.max(0, index - 1)] as Vec2
  const b = points[Math.min(points.length - 1, index + 1)] as Vec2
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1

  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
}

/** White chevrons on the front face pointing in the downhill direction of a ramp. */
function addChevrons(group: THREE.Group, wall: WorldWall): void {
  const [a, b] = [wall.points[0] as Vec2, wall.points[wall.points.length - 1] as Vec2]
  const downhill: Vec2 = a[1] > b[1] ? [b[0] - a[0], b[1] - a[1]] : [a[0] - b[0], a[1] - b[1]]
  const start = a[1] > b[1] ? a : b
  const length = Math.hypot(downhill[0], downhill[1])
  const dir: Vec2 = [downhill[0] / length, downhill[1] / length]
  const normal: Vec2 = [dir[1], -dir[0]]
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 })
  const count = Math.max(1, Math.round(length / 0.5))
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count
    const cx = start[0] + (downhill[0] * t) + (normal[0] * wall.thickness * 0.5)
    const cy = start[1] + (downhill[1] * t) + (normal[1] * wall.thickness * 0.5)
    const shape = new THREE.Shape([
      new THREE.Vector2(0.05, 0),
      new THREE.Vector2(-0.03, 0.035),
      new THREE.Vector2(-0.03, -0.035),
    ])
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material.clone())
    mesh.position.set(cx, cy, FRONT_Z)
    mesh.rotation.z = Math.atan2(dir[1], dir[0])
    group.add(mesh)
  }
  material.dispose()
}

/** Two little silver bolts marking a piece as fixed to the board. */
function addBolts(group: THREE.Group, walls: readonly WorldWall[]): void {
  const points = walls.flatMap((wall) => [wall.points[0], wall.points[wall.points.length - 1]]).filter((point): point is Vec2 => Boolean(point))
  const chosen = points.length > 2 ? [points[0], points[points.length - 1]] : points
  for (const point of chosen) {
    if (!point) {
      continue
    }
    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.02, 12),
      new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.7, roughness: 0.3 }),
    )
    bolt.rotation.x = Math.PI / 2
    bolt.position.set(point[0], point[1] - 0.05, FRONT_Z + 0.01)
    group.add(bolt)
  }
}

/** Translucent back panel between the two walls of a tube. */
function addTubePanel(group: THREE.Group, walls: readonly WorldWall[], style: PieceMeshStyle): void {
  const [first, second] = walls
  if (!first || !second || style === 'ghost-ok' || style === 'ghost-bad') {
    return
  }
  const outline = [...first.points, ...[...second.points].reverse()]
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)))
  const panel = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: style === 'fixed' ? FIXED_PIECE_COLOR : FAMILY_COLORS.tube, transparent: true, opacity: 0.18, depthWrite: false }),
  )
  panel.position.z = -(PIECE_DEPTH / 2) + 0.01
  group.add(panel)
}

/** Darker collars at each tube opening. */
function addCollars(group: THREE.Group, walls: readonly WorldWall[], style: PieceMeshStyle): void {
  if (style === 'ghost-ok' || style === 'ghost-bad') {
    return
  }
  const material = new THREE.MeshStandardMaterial({ color: style === 'fixed' ? '#475569' : '#0891b2', roughness: 0.4 })
  for (const wall of walls) {
    for (const index of [0, wall.points.length - 1]) {
      const point = wall.points[index] as Vec2
      const [tx, ty] = tangentAt(wall.points, index)
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.08, wall.thickness + 0.08, PIECE_DEPTH + 0.06), material.clone())
      const inset = index === 0 ? 0.04 : -0.04
      collar.position.set(point[0] + (tx * inset) + (ty * wall.thickness * 0.5), point[1] + (ty * inset) - (tx * wall.thickness * 0.5), 0)
      collar.rotation.z = Math.atan2(ty, tx)
      collar.castShadow = true
      group.add(collar)
    }
  }
  material.dispose()
}

function addLauncherDecor(group: THREE.Group, board: BoardSize, placement: PiecePlacement, style: PieceMeshStyle): void {
  const behavior = PIECES.launcher.behavior
  if (behavior?.kind !== 'launcher' || style === 'ghost-ok' || style === 'ghost-bad') {
    return
  }
  const direction = placement.flipped ? -1 : 1
  const angle = (behavior.angleDeg * Math.PI) / 180
  const [cx, cy] = localToWorld(board, placement, [0.5, 0.3])
  const arrow = new THREE.Shape([
    new THREE.Vector2(0, -0.035),
    new THREE.Vector2(0.4, -0.035),
    new THREE.Vector2(0.4, -0.09),
    new THREE.Vector2(0.56, 0),
    new THREE.Vector2(0.4, 0.09),
    new THREE.Vector2(0.4, 0.035),
    new THREE.Vector2(0, 0.035),
  ])
  const decal = new THREE.Mesh(
    new THREE.ShapeGeometry(arrow),
    new THREE.MeshBasicMaterial({ color: style === 'fixed' ? FIXED_PIECE_COLOR : FAMILY_COLORS.jump, transparent: true, opacity: 0.55, depthWrite: false }),
  )
  decal.position.set(cx - (direction * 0.2), cy - 0.05, -(PIECE_DEPTH / 2) + 0.02)
  decal.rotation.z = direction > 0 ? angle : Math.PI - angle
  group.add(decal)
}

/** Coil spring drawn under a launcher / trampoline pad. */
function addCoil(group: THREE.Group, x: number, top: number, bottom: number): void {
  const turns = 4
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= turns * 16; i += 1) {
    const t = i / (turns * 16)
    const angle = t * turns * Math.PI * 2
    points.push(new THREE.Vector3(x + (Math.cos(angle) * 0.1), top - ((top - bottom) * t), Math.sin(angle) * 0.1))
  }
  const coil = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 0.018, 6, false),
    new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.8, roughness: 0.3 }),
  )
  coil.castShadow = true
  group.add(coil)
}

/**
 * Builds the visual for one placement. Geometry comes from the same `placementWalls`
 * the physics uses, so the marble always collides with exactly what is drawn.
 */
export function createPieceMesh(board: BoardSize, placement: PiecePlacement, style: PieceMeshStyle): PieceMesh {
  const piece = PIECES[placement.pieceId]
  const walls = placementWalls(board, placement)
  const group = new THREE.Group()
  group.name = `piece:${placement.pieceId}`
  let spring: THREE.Group | null = null

  switch (piece.family) {
    case 'tube': {
      addTubePanel(group, walls, style)
      const material = style === 'ghost-ok' || style === 'ghost-bad'
        ? solidMaterial(FAMILY_COLORS.tube, style)
        : new THREE.MeshPhysicalMaterial({
          color: style === 'fixed' ? '#94a3b8' : '#a5f3fc',
          roughness: 0.08,
          metalness: 0,
          clearcoat: 1,
          transparent: true,
          opacity: 0.6,
        })
      walls.forEach((wall, index) => addWall(group, wall, index === 0 ? material : material.clone(), false))
      addCollars(group, walls, style)
      break
    }
    case 'jump':
    case 'bouncer': {
      if (piece.behavior) {
        spring = new THREE.Group()
        const color = piece.id === 'trampoline' ? '#1f2937' : FAMILY_COLORS.jump
        walls.forEach((wall) => addWall(spring as THREE.Group, wall, solidMaterial(color, style)))
        group.add(spring)
        if (style === 'player' || style === 'fixed') {
          const [left, bottom] = localToWorld(board, placement, [0, 0])
          if (piece.id === 'trampoline') {
            const frameMaterial = solidMaterial(TRAMPOLINE_COLOR, style)
            for (const x of [0.06, 0.94]) {
              const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, PIECE_DEPTH), frameMaterial.clone())
              leg.position.set(left + x, bottom + 0.13, 0)
              leg.castShadow = true
              group.add(leg)
            }
            frameMaterial.dispose()
          } else {
            addCoil(group, left + 0.5, bottom + 0.06, bottom)
            addLauncherDecor(group, board, placement, style)
          }
        }
      } else {
        const color = piece.family === 'bouncer' ? FAMILY_COLORS.bouncer : FAMILY_COLORS.jump
        walls.forEach((wall) => addWall(group, wall, solidMaterial(color, style, { roughness: piece.family === 'bouncer' ? 0.6 : 0.35 })))
      }
      break
    }
    default: {
      const color = FAMILY_COLORS[piece.family]
      walls.forEach((wall) => addWall(group, wall, solidMaterial(color, style)))
      if (piece.family === 'ramp' && style !== 'ghost-ok' && style !== 'ghost-bad') {
        walls.forEach((wall) => addChevrons(group, wall))
      }
    }
  }

  if (style === 'fixed') {
    addBolts(group, walls)
  }

  return { group, spring }
}
