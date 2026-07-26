/**
 * Entity layer: one textured quad per player/block/monster, keyed by a
 * stable EntityId so `syncEntitySprites` can add sprites for newly spawned
 * ids (clones) and remove sprites for despawned ids (drowned blocks/monsters)
 * without touching anyone else's mesh.
 */
import * as THREE from 'three'

import type { Direction, GameState } from '../engine/types'
import { Z_ENTITY } from './sceneConstants'
import type { EntityMaterialCache } from './tileTextures'

export type EntityId = 'player' | `block:${number}` | `monster:${number}`

export function blockEntityId(id: number): EntityId {
  return `block:${id}`
}

export function monsterEntityId(id: number): EntityId {
  return `monster:${id}`
}

/**
 * Local "forward" in every entity texture points toward texture-space up;
 * rotating the quad by this angle (radians, counter-clockwise) turns that
 * forward direction to face `facing` on the tile grid (screen-down = +row).
 */
export function facingToAngle(facing: Direction): number {
  switch (facing) {
    case 'up':
      return 0
    case 'right':
      return -Math.PI / 2
    case 'down':
      return Math.PI
    case 'left':
      return Math.PI / 2
  }
}

export interface EntityLayerHandle {
  readonly group: THREE.Group
  readonly geometry: THREE.PlaneGeometry
  readonly sprites: Map<EntityId, THREE.Mesh>
}

export function createEntityLayer(): EntityLayerHandle {
  return {
    group: new THREE.Group(),
    geometry: new THREE.PlaneGeometry(1, 1),
    sprites: new Map(),
  }
}

export interface EntitySyncResult {
  readonly spawned: readonly EntityId[]
  readonly despawned: readonly EntityId[]
}

/**
 * Ensures exactly one sprite exists per id present in `state` (player, every
 * block, every monster) and removes sprites for ids no longer present.
 * Positions/facings for existing sprites are left untouched here — the tween
 * scheduler drives those every frame.
 */
export function syncEntitySprites(handle: EntityLayerHandle, state: GameState, materials: EntityMaterialCache): EntitySyncResult {
  const wantedIds = new Set<EntityId>(['player'])
  for (const block of state.blocks) {
    wantedIds.add(blockEntityId(block.id))
  }
  for (const monster of state.monsters) {
    wantedIds.add(monsterEntityId(monster.id))
  }

  const spawned: EntityId[] = []
  const despawned: EntityId[] = []

  if (!handle.sprites.has('player')) {
    const mesh = new THREE.Mesh(handle.geometry, materials.get('player'))
    mesh.position.z = Z_ENTITY
    handle.group.add(mesh)
    handle.sprites.set('player', mesh)
    spawned.push('player')
  }

  for (const block of state.blocks) {
    const id = blockEntityId(block.id)
    if (!handle.sprites.has(id)) {
      const mesh = new THREE.Mesh(handle.geometry, materials.get('block'))
      mesh.position.z = Z_ENTITY
      handle.group.add(mesh)
      handle.sprites.set(id, mesh)
      spawned.push(id)
    }
  }

  for (const monster of state.monsters) {
    const id = monsterEntityId(monster.id)
    if (!handle.sprites.has(id)) {
      const mesh = new THREE.Mesh(handle.geometry, materials.get(monster.kind))
      mesh.position.z = Z_ENTITY
      handle.group.add(mesh)
      handle.sprites.set(id, mesh)
      spawned.push(id)
    }
  }

  for (const [id, mesh] of handle.sprites) {
    if (!wantedIds.has(id)) {
      handle.group.remove(mesh)
      handle.sprites.delete(id)
      despawned.push(id)
    }
  }

  return { spawned, despawned }
}

export function setSpritePosition(handle: EntityLayerHandle, id: EntityId, x: number, y: number): void {
  const mesh = handle.sprites.get(id)
  if (mesh) {
    mesh.position.set(x, y, Z_ENTITY)
  }
}

export function setSpriteFacing(handle: EntityLayerHandle, id: EntityId, facing: Direction): void {
  const mesh = handle.sprites.get(id)
  if (mesh) {
    mesh.rotation.z = facingToAngle(facing)
  }
}

/** Disposes the shared entity geometry. Materials are owned by the EntityMaterialCache. */
export function disposeEntityLayer(handle: EntityLayerHandle): void {
  handle.group.clear()
  handle.geometry.dispose()
  handle.sprites.clear()
}
