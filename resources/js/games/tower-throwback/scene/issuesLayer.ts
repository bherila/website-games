/**
 * Issues overlay — a yellow/red badge pip at the top-right corner of every unit
 * with an active problem, so the player can scan the whole tower for trouble and
 * click in to resolve it. Driven directly from `state.units` each frame (only
 * when the overlay is enabled) via the shared `worstUnitSeverity` derivation, so
 * the map badges and the inspect panel always agree on severity. One draw call.
 */

import * as THREE from 'three'

import { worstUnitSeverity } from '../engine/unitIssues'
import type { EngineState } from '../gameTypes'
import {
  createInstancedQuadLayer,
  disposeInstancedQuadLayer,
  type InstancedQuadLayer,
  syncInstancedQuadLayer,
} from './instancedQuadLayer'
import { FLOOR_H, TILE_W } from './palette'

const BADGE_CAP = 4096
// Above the catchment highlight (z=1.9) and the toggle heatmap (z=2) so severity
// colors stay vivid when both diagnostics are shown at once; below the ghost (z=3).
const Z_ISSUE = 2.6
const BADGE_SIZE = 1.1
const WARNING_COLOR = 0xf5c518
const CRITICAL_COLOR = 0xe23b2e

export type IssuesLayer = InstancedQuadLayer

export function createIssuesLayer(scene: THREE.Scene): IssuesLayer {
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false })
  return createInstancedQuadLayer(scene, material, BADGE_CAP, Z_ISSUE)
}

const dummy = new THREE.Object3D()
const colorScratch = new THREE.Color()

/** Redraw the badges from current unit health; no-op (hidden) when disabled. */
export function syncIssuesLayer(layer: IssuesLayer, state: EngineState): void {
  syncInstancedQuadLayer(layer, (mesh) => {
    let count = 0
    for (const unit of state.units) {
      if (count >= BADGE_CAP) {
        break
      }
      const severity = worstUnitSeverity(unit)
      if (severity === null) {
        continue
      }
      const x = (unit.x + unit.width) * TILE_W - BADGE_SIZE / 2 - 0.1
      const y = (unit.floor + unit.storeys) * FLOOR_H - BADGE_SIZE / 2 - 0.2
      dummy.position.set(x, y, 0)
      dummy.scale.set(BADGE_SIZE, BADGE_SIZE, 1)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(count, dummy.matrix)
      mesh.setColorAt(count, colorScratch.setHex(severity === 'critical' ? CRITICAL_COLOR : WARNING_COLOR))
      count += 1
    }
    return count
  })
}

export function disposeIssuesLayer(layer: IssuesLayer): void {
  disposeInstancedQuadLayer(layer)
}
