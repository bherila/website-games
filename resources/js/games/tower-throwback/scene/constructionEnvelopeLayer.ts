import * as THREE from 'three'

import { horizontalBuildRegions } from '../engine/mapGeometry'
import { getMap } from '../engine/maps'
import type { MapDefinition } from '../gameTypes'
import { FLOOR_H, TILE_W } from './palette'
import { disposeObject } from './threeUtils'

const Z_CONSTRUCTION_ENVELOPE = 6.2
const BUILDABLE_COLOR = new THREE.Color(0x2f8f83)
const BRIDGE_ONLY_COLOR = new THREE.Color(0xc47b3c)
const ENVELOPE_CAP = 8

export interface ConstructionEnvelopeRegion {
  kind: 'buildable' | 'bridgeOnly'
  xMin: number
  xMaxExclusive: number
}

export interface ConstructionEnvelopeLayer {
  mesh: THREE.InstancedMesh
}

export function constructionEnvelopeForMap(map: MapDefinition): ConstructionEnvelopeRegion[] {
  if (!map.horizontalBuildExclusions || map.horizontalBuildExclusions.length === 0) {
    return []
  }
  return [
    ...horizontalBuildRegions(map).map((region) => ({ ...region, kind: 'buildable' as const })),
    ...map.horizontalBuildExclusions.map((exclusion) => ({
      kind: 'bridgeOnly' as const,
      xMin: exclusion.xMin,
      xMaxExclusive: exclusion.xMaxExclusive,
    })),
  ]
}

export function createConstructionEnvelopeLayer(scene: THREE.Scene): ConstructionEnvelopeLayer {
  const material = new THREE.MeshBasicMaterial({
    depthTest: false,
    depthWrite: false,
    opacity: 0.13,
    toneMapped: false,
    transparent: true,
  })
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, ENVELOPE_CAP)
  mesh.count = 0
  mesh.visible = false
  mesh.position.z = Z_CONSTRUCTION_ENVELOPE
  mesh.renderOrder = 45
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false
  scene.add(mesh)
  return { mesh }
}

const dummy = new THREE.Object3D()

export function setConstructionEnvelope(layer: ConstructionEnvelopeLayer, mapId: string, enabled: boolean): void {
  const map = getMap(mapId)
  const regions = enabled ? constructionEnvelopeForMap(map) : []
  const worldBottom = map.floorRange.min * FLOOR_H
  const worldHeight = (map.floorRange.max - map.floorRange.min + 1) * FLOOR_H
  let count = 0
  for (const region of regions) {
    if (count >= ENVELOPE_CAP) {
      break
    }
    const width = (region.xMaxExclusive - region.xMin) * TILE_W
    dummy.position.set(region.xMin * TILE_W + width / 2, worldBottom + worldHeight / 2, 0)
    dummy.scale.set(width, worldHeight, 1)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    layer.mesh.setMatrixAt(count, dummy.matrix)
    layer.mesh.setColorAt(count, region.kind === 'buildable' ? BUILDABLE_COLOR : BRIDGE_ONLY_COLOR)
    count += 1
  }
  layer.mesh.count = count
  layer.mesh.visible = count > 0
  layer.mesh.instanceMatrix.needsUpdate = true
  if (layer.mesh.instanceColor) {
    layer.mesh.instanceColor.needsUpdate = true
  }
}

export function disposeConstructionEnvelopeLayer(layer: ConstructionEnvelopeLayer): void {
  layer.mesh.parent?.remove(layer.mesh)
  disposeObject(layer.mesh)
}
