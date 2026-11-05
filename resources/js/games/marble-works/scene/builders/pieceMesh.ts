import * as THREE from 'three'

import { type BoardSize, localToWorld, placementWalls, type WorldWall } from '../../board/grid'
import type { PiecePlacement } from '../../levels/levelTypes'
import { PIECES, type Vec2 } from '../../pieces/pieceCatalog'
import { markGlass } from '../glassQuality'
import {
  FAMILY_COLORS,
  FIXED_PIECE_COLOR,
  GHOST_BAD_COLOR,
  GHOST_OK_COLOR,
  GLASS_PIECE_EDGE,
  GLASS_PIECE_TINT,
  TRAMPOLINE_COLOR,
} from '../palette'
import { createWallGeometry, PIECE_DEPTH } from './wallGeometry'

export type PieceMeshStyle = 'player' | 'fixed' | 'ghost-ok' | 'ghost-bad'

export interface PieceMesh {
  group: THREE.Group
  /** Sub-group that squashes when a launcher fires / trampoline bounces. */
  spring: THREE.Group | null
  /** Toggle: the paddle, posed by `poseToggle`. */
  paddle: TogglePaddle | null
  /** Fragile glass: the walls, hidden when they shatter. */
  glass: THREE.Group | null
}

/** A toggle's paddle and the two poses it swings between (world space, z rotation). */
export interface TogglePaddle {
  mesh: THREE.Mesh
  /** Pose for the placement as placed (`flipped` = the placement's own flip) and mirrored. */
  poses: Record<'placed' | 'mirrored', { x: number; y: number; angle: number }>
}

/** Glass for tubes and glass pieces: refractive and lightly tinted, like the marbles. */
export function pieceGlassMaterial(tint: string, opacity = 1, attenuation = '#ffffff', liteOpacity = 0.6): THREE.MeshPhysicalMaterial {
  return markGlass(new THREE.MeshPhysicalMaterial({
    color: tint,
    metalness: 0,
    roughness: 0.06,
    transmission: 1,
    thickness: 0.25,
    ior: 1.45,
    attenuationColor: new THREE.Color(attenuation),
    attenuationDistance: 0.6,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    transparent: opacity < 1,
    opacity,
    envMapIntensity: 1.2,
  }), liteOpacity)
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
  let paddle: TogglePaddle | null = null
  let glass: THREE.Group | null = null
  const ghost = style === 'ghost-ok' || style === 'ghost-bad'

  switch (piece.family) {
    case 'glass': {
      glass = new THREE.Group()
      const material = ghost ? solidMaterial(FAMILY_COLORS.glass, style) : pieceGlassMaterial(GLASS_PIECE_TINT, 1, GLASS_PIECE_EDGE)
      walls.forEach((wall) => addWall(glass as THREE.Group, wall, material.clone(), false))
      if (!ghost) {
        // Bright edges: glass seen head-on is mostly its rim.
        for (const wall of walls) {
          const edge = new THREE.Mesh(
            createWallGeometry({ ...wall, thickness: 0.03 }, PIECE_DEPTH + 0.02),
            new THREE.MeshBasicMaterial({ color: GLASS_PIECE_EDGE, transparent: true, opacity: 0.9 }),
          )
          glass.add(edge)
        }
      }
      material.dispose()
      group.add(glass)
      break
    }
    case 'sorter': {
      const color = FAMILY_COLORS.sorter
      if (piece.id === 'toggle') {
        paddle = createTogglePaddle(board, placement, solidMaterial(color, style))
        group.add(paddle.mesh)
        if (!ghost) {
          const hub = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.07, PIECE_DEPTH + 0.08, 16),
            new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.7, roughness: 0.3 }),
          )
          hub.rotation.x = Math.PI / 2
          hub.position.set(paddle.poses.placed.x, paddle.poses.placed.y, 0)
          group.add(hub)
        }
      } else {
        // Sieve: a grate — short bars with gaps a mini marble drops through.
        for (const wall of walls) {
          const [a, b] = [wall.points[0] as Vec2, wall.points[wall.points.length - 1] as Vec2]
          const bars = Math.max(3, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 5))
          for (let i = 0; i < bars; i += 1) {
            const t0 = (i + 0.18) / bars
            const t1 = (i + 0.82) / bars
            const bar: WorldWall = {
              ...wall,
              points: [[a[0] + ((b[0] - a[0]) * t0), a[1] + ((b[1] - a[1]) * t0)], [a[0] + ((b[0] - a[0]) * t1), a[1] + ((b[1] - a[1]) * t1)]],
            }
            addWall(group, bar, solidMaterial(color, style))
          }
          const rail: WorldWall = { ...wall, thickness: 0.03, points: wall.points.map(([x, y]) => [x, y - wall.thickness + 0.015] as Vec2) }
          addWall(group, rail, solidMaterial('#5b21b6', style))
        }
      }
      break
    }
    case 'tube': {
      addTubePanel(group, walls, style)
      const material = style === 'ghost-ok' || style === 'ghost-bad'
        ? solidMaterial(FAMILY_COLORS.tube, style)
        : pieceGlassMaterial(style === 'fixed' ? '#cbd5e1' : '#a5f3fc')
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

  return { group, spring, paddle, glass }
}

const TOGGLE_THICKNESS = 0.1

/**
 * The toggle's paddle is one bar that swings about the point where its two orientations
 * cross. Each pose lays the bar's top face exactly on that orientation's rolling surface.
 */
function createTogglePaddle(board: BoardSize, placement: PiecePlacement, material: THREE.Material): TogglePaddle {
  const poseFor = (flipped: boolean): { x: number; y: number; angle: number; length: number } => {
    const [wall] = placementWalls(board, { ...placement, flipped })
    const [a, b] = [wall?.points[0] as Vec2, wall?.points[(wall?.points.length ?? 1) - 1] as Vec2]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const length = Math.hypot(dx, dy)
    // Centre of the bar: the surface midpoint pushed half a thickness into the solid side.
    const nx = dy / length
    const ny = -dx / length

    return {
      x: ((a[0] + b[0]) / 2) + (nx * TOGGLE_THICKNESS / 2),
      y: ((a[1] + b[1]) / 2) + (ny * TOGGLE_THICKNESS / 2),
      angle: Math.atan2(dy, dx),
      length,
    }
  }
  const placed = poseFor(placement.flipped)
  const mirrored = poseFor(!placement.flipped)
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(placed.length, TOGGLE_THICKNESS, PIECE_DEPTH), material)
  mesh.castShadow = true
  mesh.position.set(placed.x, placed.y, 0)
  mesh.rotation.z = placed.angle

  return { mesh, poses: { placed, mirrored } }
}

/** Poses a paddle part-way between its placed (t = 0) and mirrored (t = 1) orientations. */
export function poseToggle(paddle: TogglePaddle, t: number): void {
  const { placed, mirrored } = paddle.poses
  paddle.mesh.position.set(placed.x + ((mirrored.x - placed.x) * t), placed.y + ((mirrored.y - placed.y) * t), 0)
  paddle.mesh.rotation.z = placed.angle + ((mirrored.angle - placed.angle) * t)
}
