import * as THREE from 'three'

import type { GameState } from '../../gameEngine'
import { CELL_SIZE, FIELD_Z } from '../sceneConstants'

/**
 * The car field styled as a real parking lot: an asphalt slab with painted
 * white stall lines (a divider every other row/column so cells pair into
 * stalls) and a solid painted border, sitting slightly proud of the light
 * plaza ground around it.
 */
export function createField(state: GameState): THREE.Object3D {
  const group = new THREE.Group()
  const width = state.boardWidth * CELL_SIZE + 0.8
  const gridHeight = state.boardHeight * CELL_SIZE
  const bottomPad = 0.4
  const height = gridHeight + bottomPad

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.14, height),
    new THREE.MeshStandardMaterial({ color: '#aeb5c6', roughness: 0.88 }),
  )
  base.position.set(0, 0.01, FIELD_Z + bottomPad / 2)
  base.receiveShadow = true
  group.add(base)

  const paint = new THREE.MeshBasicMaterial({ color: '#f6f8fc', transparent: true, opacity: 0.38, depthWrite: false })
  const gridWidth = state.boardWidth * CELL_SIZE

  for (let x = 0; x <= state.boardWidth; x += 2) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, gridHeight), paint)
    line.position.set((x - state.boardWidth / 2) * CELL_SIZE, 0.1, FIELD_Z)
    group.add(line)
  }

  for (let y = 0; y <= state.boardHeight; y += 2) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(gridWidth, 0.02, 0.035), paint)
    line.position.set(0, 0.11, FIELD_Z + (y - state.boardHeight / 2) * CELL_SIZE)
    group.add(line)
  }

  const borderPaint = new THREE.MeshBasicMaterial({ color: '#f6f8fc', transparent: true, opacity: 0.7, depthWrite: false })
  const borderSpecs: Array<{ w: number, d: number, x: number, z: number }> = [
    { w: gridWidth + 0.1, d: 0.07, x: 0, z: FIELD_Z - gridHeight / 2 },
    { w: gridWidth + 0.1, d: 0.07, x: 0, z: FIELD_Z + gridHeight / 2 },
    { w: 0.07, d: gridHeight + 0.1, x: -gridWidth / 2, z: FIELD_Z },
    { w: 0.07, d: gridHeight + 0.1, x: gridWidth / 2, z: FIELD_Z },
  ]
  for (const spec of borderSpecs) {
    const border = new THREE.Mesh(new THREE.BoxGeometry(spec.w, 0.02, spec.d), borderPaint)
    border.position.set(spec.x, 0.115, spec.z)
    group.add(border)
  }

  return group
}
