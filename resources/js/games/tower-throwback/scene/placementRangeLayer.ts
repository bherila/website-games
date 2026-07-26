import * as THREE from 'three'

import { FLOOR_H, TILE_W } from './palette'
import { PLACEMENT_RANGE_TILE_CAP, type PlacementRangeTile } from './placementRange'
import { disposeObject } from './threeUtils'

const Z_PLACEMENT_RANGE = 6.5
const BENEFIT_COLOR = new THREE.Color(0x38bdf8)
const BENEFIT_EDGE_COLOR = new THREE.Color(0x0e7490)
const IMPACT_COLOR = new THREE.Color(0xf97316)
const IMPACT_EDGE_COLOR = new THREE.Color(0xfbbf24)

export interface PlacementRangeLayer {
  mesh: THREE.InstancedMesh
}

export function createPlacementRangeLayer(scene: THREE.Scene): PlacementRangeLayer {
  const material = new THREE.MeshBasicMaterial({
    depthTest: false,
    depthWrite: false,
    opacity: 0.28,
    toneMapped: false,
    transparent: true,
  })
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, PLACEMENT_RANGE_TILE_CAP)
  mesh.count = 0
  mesh.visible = false
  mesh.position.z = Z_PLACEMENT_RANGE
  mesh.renderOrder = 50
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false
  scene.add(mesh)
  return { mesh }
}

const dummy = new THREE.Object3D()
const color = new THREE.Color()

export function setPlacementRange(layer: PlacementRangeLayer, tiles: readonly PlacementRangeTile[]): void {
  let count = 0
  for (const tile of tiles) {
    if (count >= PLACEMENT_RANGE_TILE_CAP) {
      break
    }
    dummy.position.set(tile.x * TILE_W + TILE_W / 2, tile.floor * FLOOR_H + FLOOR_H / 2, 0)
    dummy.scale.set(TILE_W, FLOOR_H, 1)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    layer.mesh.setMatrixAt(count, dummy.matrix)
    layer.mesh.setColorAt(
      count,
      tile.kind === 'benefit'
        ? color.copy(BENEFIT_EDGE_COLOR).lerp(BENEFIT_COLOR, tile.strength)
        : color.copy(IMPACT_EDGE_COLOR).lerp(IMPACT_COLOR, tile.strength),
    )
    count += 1
  }
  layer.mesh.count = count
  layer.mesh.visible = count > 0
  layer.mesh.instanceMatrix.needsUpdate = true
  if (layer.mesh.instanceColor) {
    layer.mesh.instanceColor.needsUpdate = true
  }
}

export function disposePlacementRangeLayer(layer: PlacementRangeLayer): void {
  layer.mesh.parent?.remove(layer.mesh)
  disposeObject(layer.mesh)
}
