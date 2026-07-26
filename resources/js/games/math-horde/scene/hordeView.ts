import * as THREE from 'three'

import type { GameState, RuntimeHorde } from '../gameTypes'
import { toDisplayZ } from './constants'
import { createLabelPool } from './labels'

const MAX_ENEMY_INSTANCES = 360
const UNITS_PER_HORDE = 48
const LABEL_POOL_SIZE = 8
const LABEL_RANGE = 42

export interface HordeView {
  update(state: GameState, dt: number): void
}

export function createHordeView(scene: THREE.Scene): HordeView {
  const unitGeometry = new THREE.OctahedronGeometry(0.32, 0)
  const unitMaterial = new THREE.MeshStandardMaterial({ color: '#ff2d78', emissive: '#b00048', emissiveIntensity: 0.9 })
  const units = new THREE.InstancedMesh(unitGeometry, unitMaterial, MAX_ENEMY_INSTANCES)
  scene.add(units)

  const bossGeometry = new THREE.OctahedronGeometry(0.48, 0)
  const bossMaterial = new THREE.MeshStandardMaterial({ color: '#ff8a00', emissive: '#a32b00', emissiveIntensity: 1.3, metalness: 0.45 })
  const bossUnits = new THREE.InstancedMesh(bossGeometry, bossMaterial, MAX_ENEMY_INSTANCES)
  scene.add(bossUnits)

  const labels = createLabelPool(scene, LABEL_POOL_SIZE, { color: '#ffd166', glow: '#e11d48', background: '#50122bcc' })

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)

  function placeHorde(horde: RuntimeHorde, target: THREE.InstancedMesh, startIndex: number, progress: number, elapsed: number): number {
    const baseZ = toDisplayZ(horde.z, progress)
    const shown = Math.min(horde.count, UNITS_PER_HORDE)
    const unitScale = horde.boss ? 1.5 : 1
    const bob = Math.sin(elapsed * 5 + horde.z) * 0.05
    scale.set(unitScale, unitScale, unitScale)
    let placed = startIndex
    for (let unit = 0; unit < shown && placed < MAX_ENEMY_INSTANCES; unit += 1) {
      const row = Math.floor(unit / 6)
      const columns = Math.min(6, shown - row * 6)
      const column = unit % 6
      position.set(
        horde.x + (column - (columns - 1) / 2) * 0.42 * unitScale,
        0.4 * unitScale + bob,
        baseZ - row * 0.46 * unitScale,
      )
      matrix.compose(position, quaternion, scale)
      target.setMatrixAt(placed, matrix)
      placed += 1
    }

    return placed
  }

  return {
    update(state: GameState, dt: number): void {
      let unitCount = 0
      let bossCount = 0
      let labelIndex = 0
      for (const horde of state.hordes) {
        if (horde.status !== 'active') {
          continue
        }
        if (horde.boss) {
          bossCount = placeHorde(horde, bossUnits, bossCount, state.progress, state.elapsed)
        } else {
          unitCount = placeHorde(horde, units, unitCount, state.progress, state.elapsed)
        }

        const distance = horde.z - state.progress
        if (labelIndex < LABEL_POOL_SIZE && distance > -2 && distance <= LABEL_RANGE) {
          const label = labels.borrow(labelIndex)
          label.setText(String(horde.count))
          const rows = Math.ceil(Math.min(horde.count, UNITS_PER_HORDE) / 6)
          label.sprite.position.set(horde.x, (horde.boss ? 2.4 : 1.7) + rows * 0.08, toDisplayZ(horde.z, state.progress))
          label.sprite.scale.set(horde.boss ? 2.4 : 1.7, horde.boss ? 1.2 : 0.85, 1)
          labelIndex += 1
        }
      }
      labels.hideFrom(labelIndex)
      labels.tick(dt)
      scale.set(1, 1, 1)
      units.count = unitCount
      bossUnits.count = bossCount
      units.instanceMatrix.needsUpdate = true
      bossUnits.instanceMatrix.needsUpdate = true
    },
  }
}
