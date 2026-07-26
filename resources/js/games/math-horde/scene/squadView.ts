import * as THREE from 'three'

import type { GameState } from '../gameTypes'
import { MAX_ARMY_SIZE } from '../gameTypes'
import { PLAYER_WORLD_Z } from './constants'
import { CanvasLabel } from './labels'

const COLUMNS = 8
const COLUMN_SPACING = 0.42
const ROW_SPACING = 0.5
const POP_IN_SECONDS = 0.25

export interface SquadView {
  update(state: GameState, dt: number): void
}

export function createSquadView(scene: THREE.Scene): SquadView {
  const bodyGeometry = new THREE.CapsuleGeometry(0.18, 0.42, 3, 8)
  const gunGeometry = new THREE.BoxGeometry(0.09, 0.09, 0.5)
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#3cf5ff', emissive: '#007c90', emissiveIntensity: 0.7 })
  const gunMaterial = new THREE.MeshStandardMaterial({ color: '#d4d4d8', metalness: 0.8, roughness: 0.25 })
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, MAX_ARMY_SIZE)
  const guns = new THREE.InstancedMesh(gunGeometry, gunMaterial, MAX_ARMY_SIZE)
  bodies.castShadow = true
  scene.add(bodies, guns)

  const countLabel = new CanvasLabel({ color: '#7dfbff', glow: '#0891b2', background: '#0b355088' })
  countLabel.sprite.scale.set(1.9, 0.95, 1)
  scene.add(countLabel.sprite)

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const spawnAt = new Float32Array(MAX_ARMY_SIZE).fill(-POP_IN_SECONDS)
  let clock = 0
  let previousCount = 0

  return {
    update(state: GameState, dt: number): void {
      clock += dt
      const count = Math.min(MAX_ARMY_SIZE, state.armySize)
      for (let index = previousCount; index < count; index += 1) {
        spawnAt[index] = clock
      }
      previousCount = count
      for (let index = 0; index < count; index += 1) {
        const row = Math.floor(index / COLUMNS)
        const columns = Math.min(COLUMNS, count - row * COLUMNS)
        const column = index % COLUMNS
        const x = state.playerX + (column - (columns - 1) / 2) * COLUMN_SPACING
        const z = PLAYER_WORLD_Z + row * ROW_SPACING
        const grow = Math.min(1, (clock - spawnAt[index]!) / POP_IN_SECONDS)
        const eased = grow * (2 - grow)
        scale.set(eased, eased, eased)
        position.set(x, 0.42 * eased, z)
        matrix.compose(position, quaternion, scale)
        bodies.setMatrixAt(index, matrix)
        position.set(x, 0.52 * eased, z - 0.3)
        matrix.compose(position, quaternion, scale)
        guns.setMatrixAt(index, matrix)
      }
      scale.set(1, 1, 1)
      bodies.count = count
      guns.count = count
      bodies.instanceMatrix.needsUpdate = true
      guns.instanceMatrix.needsUpdate = true

      countLabel.setText(String(state.armySize))
      countLabel.tick(dt)
      countLabel.sprite.position.set(state.playerX, 2.3, PLAYER_WORLD_Z + 0.4)
    },
  }
}
