import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import { cellCenter } from '../../board/grid'
import type { LevelDef } from '../../levels/levelTypes'
import { BASKET_WALL, PEG_RADIUS,pegPosition } from '../../physics/runWorld'
import type { Vec2 } from '../../pieces/pieceCatalog'
import {
  BASKET_COLOR,
  BASKET_DARK_COLOR,
  DROPPER_COLOR,
  FRAME_COLOR,
  NO_BUILD_COLOR,
  OBSTACLE_COLOR,
  PEG_COLOR,
  PEGBOARD_COLOR,
  PEGBOARD_HOLE_COLOR,
} from '../palette'
import { canvasTexture, seededRandom } from '../textures'
import { createWallGeometry, PIECE_DEPTH } from './wallGeometry'

export const PEGBOARD_Z = -(PIECE_DEPTH / 2) - 0.05
const PX_PER_CELL = 64

/** Birch pegboard with a hole at every cell centre, wood grain, and a rounded wooden frame. */
export function createPegboard(level: LevelDef): THREE.Group {
  const group = new THREE.Group()
  const random = seededRandom((level.id * 7919) + 17)
  const texture = canvasTexture(level.cols * PX_PER_CELL, level.rows * PX_PER_CELL, (context) => {
    const width = level.cols * PX_PER_CELL
    const height = level.rows * PX_PER_CELL
    context.fillStyle = PEGBOARD_COLOR
    context.fillRect(0, 0, width, height)
    // Soft grain streaks.
    for (let i = 0; i < level.rows * 10; i += 1) {
      const y = random() * height
      context.strokeStyle = `rgba(150, 110, 60, ${0.04 + (random() * 0.06)})`
      context.lineWidth = 1 + (random() * 2)
      context.beginPath()
      context.moveTo(0, y)
      context.bezierCurveTo(width * 0.3, y + ((random() - 0.5) * 12), width * 0.7, y + ((random() - 0.5) * 12), width, y + ((random() - 0.5) * 8))
      context.stroke()
    }
    context.fillStyle = PEGBOARD_HOLE_COLOR
    for (let row = 0; row < level.rows; row += 1) {
      for (let col = 0; col < level.cols; col += 1) {
        for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] as const) {
          context.beginPath()
          context.arc((col + dx) * PX_PER_CELL, (row + dy) * PX_PER_CELL, PX_PER_CELL * 0.045, 0, Math.PI * 2)
          context.fill()
        }
      }
    }
  })
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(level.cols, level.rows),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }),
  )
  board.position.set(level.cols / 2, level.rows / 2, PEGBOARD_Z)
  board.receiveShadow = true
  group.add(board)

  const frameMaterial = new THREE.MeshStandardMaterial({ color: FRAME_COLOR, roughness: 0.6 })
  const thickness = 0.3
  const depth = PIECE_DEPTH * 0.7
  const pieces: [number, number, number, number][] = [
    [level.cols / 2, level.rows + (thickness / 2), level.cols + (thickness * 2), thickness],
    [level.cols / 2, -(thickness / 2), level.cols + (thickness * 2), thickness],
    [-(thickness / 2), level.rows / 2, thickness, level.rows],
    [level.cols + (thickness / 2), level.rows / 2, thickness, level.rows],
  ]
  for (const [x, y, w, h] of pieces) {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(w, h, depth, 3, 0.08), frameMaterial.clone())
    rail.position.set(x, y, PEGBOARD_Z + (depth / 2) - 0.05)
    rail.castShadow = true
    rail.receiveShadow = true
    group.add(rail)
  }
  frameMaterial.dispose()

  return group
}

/** Faint cell outlines, shown only while building. */
export function createGridLines(level: LevelDef): THREE.LineSegments {
  const points: THREE.Vector3[] = []
  for (let col = 1; col < level.cols; col += 1) {
    points.push(new THREE.Vector3(col, 0, 0), new THREE.Vector3(col, level.rows, 0))
  }
  for (let row = 1; row < level.rows; row += 1) {
    points.push(new THREE.Vector3(0, row, 0), new THREE.Vector3(level.cols, row, 0))
  }
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: '#8b6b43', transparent: true, opacity: 0.35 }),
  )
  lines.position.z = PEGBOARD_Z + 0.01

  return lines
}

function hatchTexture(color: string, background: string | null): THREE.CanvasTexture {
  const texture = canvasTexture(64, 64, (context) => {
    if (background) {
      context.fillStyle = background
      context.fillRect(0, 0, 64, 64)
    }
    context.strokeStyle = color
    context.lineWidth = 6
    for (let offset = -64; offset < 128; offset += 16) {
      context.beginPath()
      context.moveTo(offset, 64)
      context.lineTo(offset + 64, 0)
      context.stroke()
    }
  })
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping

  return texture
}

/** Slate blocks, round pegs, and red-hatched no-build cells. */
export function createObstacles(level: LevelDef): THREE.Group {
  const group = new THREE.Group()
  for (const block of level.blocks) {
    const texture = hatchTexture('rgba(255,255,255,0.07)', OBSTACLE_COLOR)
    texture.repeat.set(block.w, block.h)
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(block.w, block.h, PIECE_DEPTH + 0.1, 3, 0.07),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7 }),
    )
    mesh.position.set(block.col + (block.w / 2), level.rows - block.row - (block.h / 2), 0)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    for (const [bx, by] of [[0.18, 0.18], [block.w - 0.18, block.h - 0.18]] as const) {
      const bolt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12),
        new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.7, roughness: 0.3 }),
      )
      bolt.rotation.x = Math.PI / 2
      bolt.position.set(block.col + bx, level.rows - block.row - block.h + by, (PIECE_DEPTH / 2) + 0.06)
      group.add(bolt)
    }
  }

  for (const peg of level.pegs) {
    const [x, y] = pegPosition(level, peg)
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(PEG_RADIUS, PEG_RADIUS, PIECE_DEPTH + 0.1, 24),
      new THREE.MeshStandardMaterial({ color: PEG_COLOR, metalness: 0.6, roughness: 0.3 }),
    )
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(x, y, 0)
    mesh.castShadow = true
    group.add(mesh)
  }

  for (const cell of level.noBuild) {
    const [x, y] = cellCenter(level, cell)
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.96, 0.96),
      new THREE.MeshBasicMaterial({ map: hatchTexture(NO_BUILD_COLOR, null), transparent: true, opacity: 0.35, depthWrite: false }),
    )
    mesh.position.set(x, y, PEGBOARD_Z + 0.02)
    group.add(mesh)
  }

  return group
}

export interface DropperMesh {
  group: THREE.Group
  /** Hinged gate under the marble; rotate to open. */
  gate: THREE.Group
}

/** Tower-top dropper cup with a gate the marble rests on. */
export function createDropper(level: LevelDef): DropperMesh {
  const group = new THREE.Group()
  const left = level.start.col
  const bottom = level.rows - level.start.row - 1
  const material = new THREE.MeshStandardMaterial({ color: DROPPER_COLOR, roughness: 0.35 })
  for (const x of [0.14, 0.86]) {
    const wall = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.8, PIECE_DEPTH, 2, 0.03), material.clone())
    wall.position.set(left + x, bottom + 0.55, 0)
    wall.castShadow = true
    group.add(wall)
  }
  const lip = new THREE.Mesh(new RoundedBoxGeometry(0.96, 0.1, PIECE_DEPTH + 0.06, 2, 0.04), material.clone())
  lip.position.set(left + 0.5, bottom + 0.97, 0)
  lip.castShadow = true
  group.add(lip)

  const gate = new THREE.Group()
  gate.position.set(left + 0.19, bottom + 0.25, 0)
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.06, PIECE_DEPTH - 0.05, 2, 0.025), new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.4 }))
  plate.position.x = 0.31
  plate.castShadow = true
  gate.add(plate)
  group.add(gate)
  material.dispose()

  return { group, gate }
}

export interface BasketMesh {
  group: THREE.Group
  glow: THREE.Mesh
  /** Wobbles on a win. */
  body: THREE.Group
}

/** Woven basket with a pennant flag and a soft glow ring. */
export function createBasket(level: LevelDef): BasketMesh {
  const group = new THREE.Group()
  const body = new THREE.Group()
  const left = level.goal.col
  const bottom = level.rows - level.goal.row - 1
  body.position.set(left + 0.5, bottom, 0)
  group.add(body)

  const weave = canvasTexture(64, 64, (context) => {
    context.fillStyle = BASKET_COLOR
    context.fillRect(0, 0, 64, 64)
    context.strokeStyle = BASKET_DARK_COLOR
    context.lineWidth = 3
    for (let y = 0; y < 64; y += 10) {
      for (let x = 0; x < 64; x += 16) {
        const offset = (y / 10) % 2 === 0 ? 0 : 8
        context.beginPath()
        context.moveTo(x + offset, y + 2)
        context.quadraticCurveTo(x + offset + 4, y + 8, x + offset + 8, y + 2)
        context.stroke()
      }
    }
  })
  weave.wrapS = THREE.RepeatWrapping
  weave.wrapT = THREE.RepeatWrapping
  weave.repeat.set(3, 3)

  const wall = {
    points: BASKET_WALL.map(([x, y]) => [x - 0.5, y] as Vec2),
    thickness: 0.1,
    material: 'basket' as const,
  }
  const rim = new THREE.Mesh(createWallGeometry(wall, PIECE_DEPTH + 0.1), new THREE.MeshStandardMaterial({ map: weave, roughness: 0.8 }))
  rim.castShadow = true
  body.add(rim)

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.64),
    new THREE.MeshStandardMaterial({ map: weave.clone(), color: '#d9a066', roughness: 0.9 }),
  )
  back.position.set(0, 0.38, -(PIECE_DEPTH / 2))
  body.add(back)

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 8), new THREE.MeshStandardMaterial({ color: '#78350f' }))
  pole.position.set(0.44, 0.95, 0)
  body.add(pole)
  const flag = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.26, -0.08), new THREE.Vector2(0, -0.16)])),
    new THREE.MeshStandardMaterial({ color: '#22c55e', side: THREE.DoubleSide }),
  )
  flag.position.set(0.45, 1.2, 0.01)
  body.add(flag)

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.62, 40),
    new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.35, depthWrite: false }),
  )
  glow.position.set(left + 0.5, bottom + 0.4, PEGBOARD_Z + 0.02)
  group.add(glow)

  return { group, glow, body }
}
