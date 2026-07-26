/**
 * Heatmap overlay — one InstancedMesh of translucent per-tile quads over
 * built (non-zero) tiles only, colored on the shared diagnostic ramp
 * (`diagnosticPalette.ts`, colour-vision mode aware). Rebuilt
 * only on setHeatmap (fields come from engine/heatmaps.ts on demand, not per
 * frame). One draw call while visible.
 */

import * as THREE from 'three'

import { inBounds, tileIndex } from '../engine/grid'
import { FLOOR_COUNT, FLOOR_MIN, GRID_WIDTH } from '../gameTypes'
import type { DiagnosticPaletteMode } from '../presentationPrefs'
import { diagnosticRamp } from './diagnosticPalette'
import { FLOOR_H } from './palette'
import { disposeObject } from './threeUtils'

export type HeatmapKind = 'noise' | 'congestion' | 'catchment'
export type InspectableHeatmapKind = Exclude<HeatmapKind, 'catchment'>

export interface HeatmapTileSample {
  floor: number
  kind: InspectableHeatmapKind
  value: number
  x: number
}

const TILE_CAP = 20_000
const Z_HEATMAP = 2

/** Normalization ceilings: exposure/wait at (or above) this maps to full red. */
export const HEATMAP_FIELD_MAX: Record<HeatmapKind, number> = {
  noise: 30,
  congestion: 20,
  catchment: 1,
}

export function sampleHeatmapField(
  field: Float32Array,
  kind: InspectableHeatmapKind,
  tile: { floor: number; x: number },
): HeatmapTileSample | null {
  if (!inBounds(tile.floor, tile.x)) {
    return null
  }

  return {
    floor: tile.floor,
    kind,
    value: field[tileIndex(tile.floor, tile.x)] ?? 0,
    x: tile.x,
  }
}

export interface HeatmapLayer {
  mesh: THREE.InstancedMesh
  /**
   * Colour-vision mode for this layer's ramp. Owned by the scene controller so
   * the mesh and the HTML legend always read the same `DIAGNOSTIC_RAMPS` entry.
   */
  paletteMode: DiagnosticPaletteMode
}

const QUAD = new THREE.PlaneGeometry(1, 1)
QUAD.userData.cached = true

export function createHeatmapLayer(scene: THREE.Scene): HeatmapLayer {
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false })
  const mesh = new THREE.InstancedMesh(QUAD, material, TILE_CAP)
  mesh.count = 0
  mesh.visible = false
  mesh.position.z = Z_HEATMAP
  mesh.frustumCulled = false
  scene.add(mesh)
  return { mesh, paletteMode: 'classic' }
}

const dummy = new THREE.Object3D()
const color = new THREE.Color()
const low = new THREE.Color()
const mid = new THREE.Color()
const high = new THREE.Color()

function rampColor(t: number): THREE.Color {
  if (t < 0.5) {
    return color.copy(low).lerp(mid, t * 2)
  }
  return color.copy(mid).lerp(high, (t - 0.5) * 2)
}

/** Show `field` as the overlay (null hides). Skips zero tiles; capped at TILE_CAP. */
export function setHeatmap(layer: HeatmapLayer, field: Float32Array | null, kind: HeatmapKind): void {
  if (field === null) {
    layer.mesh.visible = false
    layer.mesh.count = 0
    return
  }
  const ramp = diagnosticRamp(layer.paletteMode)
  low.setHex(ramp.low)
  mid.setHex(ramp.mid)
  high.setHex(ramp.high)
  const max = HEATMAP_FIELD_MAX[kind]

  let count = 0
  for (let row = 0; row < FLOOR_COUNT && count < TILE_CAP; row++) {
    const floor = row + FLOOR_MIN
    for (let x = 0; x < GRID_WIDTH && count < TILE_CAP; x++) {
      const value = field[tileIndex(floor, x)] ?? 0
      if (value <= 0) {
        continue
      }
      dummy.position.set(x + 0.5, floor * FLOOR_H + FLOOR_H / 2, 0)
      dummy.scale.set(1, FLOOR_H, 1)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      layer.mesh.setMatrixAt(count, dummy.matrix)
      layer.mesh.setColorAt(count, kind === 'catchment' ? color.setHex(ramp.catchment) : rampColor(Math.min(1, value / max)))
      count += 1
    }
  }
  layer.mesh.count = count
  layer.mesh.visible = count > 0
  layer.mesh.instanceMatrix.needsUpdate = true
  if (layer.mesh.instanceColor) {
    layer.mesh.instanceColor.needsUpdate = true
  }
}

export function disposeHeatmapLayer(layer: HeatmapLayer): void {
  layer.mesh.parent?.remove(layer.mesh)
  disposeObject(layer.mesh)
}
