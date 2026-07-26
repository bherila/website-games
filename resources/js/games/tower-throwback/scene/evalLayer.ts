import * as THREE from 'three'

import type { EngineState } from '../gameTypes'
import type { DiagnosticPaletteMode } from '../presentationPrefs'
import { evalTint } from './evalTint'
import {
  createInstancedQuadLayer,
  disposeInstancedQuadLayer,
  type InstancedQuadLayer,
  syncInstancedQuadLayer,
} from './instancedQuadLayer'
import { FLOOR_H, TILE_W } from './palette'

const EVAL_CAP = 4096
const Z_EVAL = 2.0

export type EvalLayer = InstancedQuadLayer

export function createEvalLayer(scene: THREE.Scene): EvalLayer {
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false })
  return createInstancedQuadLayer(scene, material, EVAL_CAP, Z_EVAL)
}

const dummy = new THREE.Object3D()
const colorScratch = new THREE.Color()

export function syncEvalLayer(layer: EvalLayer, state: EngineState, mode: DiagnosticPaletteMode = 'classic'): void {
  syncInstancedQuadLayer(layer, (mesh) => {
    let count = 0
    for (const unit of state.units) {
      if (count >= EVAL_CAP) {
        break
      }
      const tint = evalTint(unit, mode)
      if (tint === null) {
        continue
      }
      dummy.position.set(unit.x * TILE_W + (unit.width * TILE_W) / 2, unit.floor * FLOOR_H + (unit.storeys * FLOOR_H) / 2, 0)
      dummy.scale.set(unit.width * TILE_W, unit.storeys * FLOOR_H, 1)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(count, dummy.matrix)
      mesh.setColorAt(count, colorScratch.setHex(tint))
      count += 1
    }
    return count
  })
}

export function disposeEvalLayer(layer: EvalLayer): void {
  disposeInstancedQuadLayer(layer)
}
