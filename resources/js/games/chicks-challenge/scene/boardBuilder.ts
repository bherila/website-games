/**
 * Static tile layer: one quad mesh per tile, sharing a single PlaneGeometry
 * and per-kind cached materials (see tileTextures.ts). Rebuilt whenever the
 * board dimensions change (new level / restart into a different-size level);
 * otherwise `diffBoard` swaps only the materials of tiles that changed
 * between renders (door opened, item picked up, toggle flipped, ...).
 */
import * as THREE from 'three'

import type { TileKind } from '../engine/types'
import { tileCenterWorld } from './cameraRig'
import { Z_TILE } from './sceneConstants'
import type { TileMaterialCache } from './tileTextures'

export interface BoardHandle {
  readonly group: THREE.Group
  readonly geometry: THREE.PlaneGeometry
  /** Tile meshes indexed the same way as GameState.tiles: y * width + x. */
  readonly meshes: readonly THREE.Mesh[]
  readonly width: number
  readonly height: number
}

export function buildBoard(
  tiles: readonly TileKind[],
  width: number,
  height: number,
  materials: TileMaterialCache,
): BoardHandle {
  const geometry = new THREE.PlaneGeometry(1, 1)
  const group = new THREE.Group()
  const meshes: THREE.Mesh[] = []

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const kind = tiles[index] ?? 'wall'
      const mesh = new THREE.Mesh(geometry, materials.get(kind))
      const pos = tileCenterWorld(x, y)
      mesh.position.set(pos.x, pos.y, Z_TILE)
      group.add(mesh)
      meshes.push(mesh)
    }
  }

  return { group, geometry, meshes, width, height }
}

/** Swaps the material of every tile whose kind changed between `prevTiles` and `nextTiles`. */
export function diffBoard(
  handle: BoardHandle,
  prevTiles: readonly TileKind[],
  nextTiles: readonly TileKind[],
  materials: TileMaterialCache,
): void {
  for (let i = 0; i < nextTiles.length; i += 1) {
    const nextKind = nextTiles[i]
    if (nextKind && prevTiles[i] !== nextKind) {
      const mesh = handle.meshes[i]
      if (mesh) {
        mesh.material = materials.get(nextKind)
      }
    }
  }
}

/**
 * Disposes the board's own geometry. Materials are owned by the shared
 * TileMaterialCache and disposed separately (they're reused across rebuilds
 * within the same mount).
 */
export function disposeBoard(handle: BoardHandle): void {
  handle.group.clear()
  handle.geometry.dispose()
}
