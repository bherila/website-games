import * as THREE from 'three'

import type { Vec2 } from '../../pieces/pieceCatalog'
import { seededRandom } from '../textures'

interface Shard {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  spin: THREE.Vector3
}

export interface ShardBurst {
  group: THREE.Group
  shards: Shard[]
  startedAt: number
  duration: number
}

const SHARD_COUNT = 16
const SHARD_DURATION_S = 1.1

/**
 * Glass shards flying from a shattered piece: thin triangles scattered along the piece's
 * walls, flung away from the steel ball's direction of travel, tumbling and fading out.
 * Seeded per piece so the same smash always looks the same.
 */
export function createShardBurst(points: readonly Vec2[], impact: Vec2, seed: number, now: number, material: THREE.Material): ShardBurst {
  const random = seededRandom(seed)
  const group = new THREE.Group()
  const shards: Shard[] = []
  const impactLength = Math.hypot(impact[0], impact[1]) || 1
  for (let i = 0; i < SHARD_COUNT; i += 1) {
    const segment = Math.floor(random() * Math.max(1, points.length - 1))
    const a = points[segment] ?? [0, 0]
    const b = points[Math.min(points.length - 1, segment + 1)] ?? a
    const t = random()
    const size = 0.05 + (random() * 0.09)
    const shape = new THREE.Shape([
      new THREE.Vector2(0, size),
      new THREE.Vector2(-size * (0.4 + random() * 0.6), -size * 0.6),
      new THREE.Vector2(size * (0.4 + random() * 0.6), -size * (0.3 + random() * 0.5)),
    ])
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material)
    mesh.position.set(a[0] + ((b[0] - a[0]) * t), a[1] + ((b[1] - a[1]) * t), (random() - 0.5) * 0.4)
    mesh.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI)
    group.add(mesh)
    const carry = 0.35 + (random() * 0.5)
    shards.push({
      mesh,
      velocity: new THREE.Vector3(
        ((impact[0] / impactLength) * carry * 2.5) + ((random() - 0.5) * 2.2),
        ((impact[1] / impactLength) * carry * 2.5) + (random() * 1.6),
        (random() - 0.2) * 1.6,
      ),
      spin: new THREE.Vector3((random() - 0.5) * 14, (random() - 0.5) * 14, (random() - 0.5) * 14),
    })
  }

  return { group, shards, startedAt: now, duration: SHARD_DURATION_S }
}

/** Advances the burst; returns true once it has finished and can be removed. */
export function updateShardBurst(burst: ShardBurst, now: number, gravity: number, dt: number): boolean {
  const age = now - burst.startedAt
  const fade = Math.max(0, 1 - (age / burst.duration))
  for (const shard of burst.shards) {
    shard.velocity.y += gravity * dt
    shard.mesh.position.addScaledVector(shard.velocity, dt)
    shard.mesh.rotation.x += shard.spin.x * dt
    shard.mesh.rotation.y += shard.spin.y * dt
    shard.mesh.rotation.z += shard.spin.z * dt
    shard.mesh.scale.setScalar(0.4 + (0.6 * fade))
  }

  return age >= burst.duration
}

export function disposeShardBurst(burst: ShardBurst): void {
  for (const shard of burst.shards) {
    shard.mesh.geometry.dispose()
  }
}
