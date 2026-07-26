/**
 * Cheap, procedural, self-cleaning effects: splash, puff, sparkle, pop,
 * flash, and the win confetti burst (pattern imitated from
 * marble-sort/scene/animation/confetti.ts, hand-rolled here to keep this
 * game's scene layer self-contained). Every effect exposes a normalized
 * [0,1] `update(progress)` so EffectsManager owns the actual clock.
 */
import * as THREE from 'three'

import type { Position } from '../engine/types'
import {
  CONFETTI_EFFECT_MS,
  PALETTE,
  POP_EFFECT_MS,
  PUFF_EFFECT_MS,
  SPARKLE_EFFECT_MS,
  SPLASH_EFFECT_MS,
  TELEPORT_FLASH_MS,
  Z_EFFECT,
} from './sceneConstants'

export interface Effect {
  readonly object: THREE.Object3D
  readonly durationSeconds: number
  /** Called every frame with progress in [0,1] until the manager retires it. */
  update(progress: number): void
  dispose(): void
}

function tileCenter(pos: Position): { x: number; y: number } {
  return { x: pos.x + 0.5, y: -(pos.y + 0.5) }
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose()
  const material = mesh.material
  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose()
    }
  } else {
    material.dispose()
  }
}

export function createSplashEffect(pos: Position): Effect {
  const center = tileCenter(pos)
  const geometry = new THREE.RingGeometry(0.06, 0.16, 24)
  const material = new THREE.MeshBasicMaterial({ color: PALETTE.waterRipple, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(center.x, center.y, Z_EFFECT)

  return {
    object: mesh,
    durationSeconds: SPLASH_EFFECT_MS / 1000,
    update(progress) {
      mesh.scale.setScalar(0.4 + progress * 2.2)
      material.opacity = 0.9 * (1 - progress)
    },
    dispose() {
      disposeMesh(mesh)
    },
  }
}

export function createPuffEffect(pos: Position): Effect {
  const center = tileCenter(pos)
  const geometry = new THREE.CircleGeometry(0.16, 20)
  const material = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.85 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(center.x, center.y, Z_EFFECT)

  return {
    object: mesh,
    durationSeconds: PUFF_EFFECT_MS / 1000,
    update(progress) {
      mesh.scale.setScalar(0.6 + progress * 1.6)
      mesh.position.y = center.y + progress * 0.2
      material.opacity = 0.85 * (1 - progress)
    },
    dispose() {
      disposeMesh(mesh)
    },
  }
}

export function createSparkleEffect(pos: Position): Effect {
  const center = tileCenter(pos)
  const group = new THREE.Group()
  group.position.set(center.x, center.y, Z_EFFECT)
  const count = 6
  const particles: { mesh: THREE.Mesh; angle: number }[] = []

  for (let i = 0; i < count; i += 1) {
    const geometry = new THREE.PlaneGeometry(0.07, 0.07)
    const material = new THREE.MeshBasicMaterial({ color: PALETTE.chipPin, transparent: true, opacity: 1, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.z = Math.PI / 4
    group.add(mesh)
    particles.push({ mesh, angle: (i / count) * Math.PI * 2 })
  }

  return {
    object: group,
    durationSeconds: SPARKLE_EFFECT_MS / 1000,
    update(progress) {
      for (const { mesh, angle } of particles) {
        const radius = progress * 0.32
        mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
        ;(mesh.material as THREE.MeshBasicMaterial).opacity = 1 - progress
      }
    },
    dispose() {
      for (const { mesh } of particles) {
        disposeMesh(mesh)
      }
    },
  }
}

/** Door/socket opened: a brief expanding diamond outline. */
export function createPopEffect(pos: Position, color: number = PALETTE.exitRing): Effect {
  const center = tileCenter(pos)
  const geometry = new THREE.RingGeometry(0.32, 0.4, 4)
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(center.x, center.y, Z_EFFECT)
  mesh.rotation.z = Math.PI / 4

  return {
    object: mesh,
    durationSeconds: POP_EFFECT_MS / 1000,
    update(progress) {
      mesh.scale.setScalar(0.5 + progress * 1.1)
      material.opacity = 0.9 * (1 - progress)
    },
    dispose() {
      disposeMesh(mesh)
    },
  }
}

/** Teleport / boots-stolen / monster-touch flash: a bright disc that shrinks and fades fast. */
export function createFlashEffect(pos: Position, color: number = 0xffffff, durationMs: number = TELEPORT_FLASH_MS): Effect {
  const center = tileCenter(pos)
  const geometry = new THREE.CircleGeometry(0.5, 24)
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(center.x, center.y, Z_EFFECT)

  return {
    object: mesh,
    durationSeconds: durationMs / 1000,
    update(progress) {
      mesh.scale.setScalar(0.2 + (1 - progress) * 0.9)
      material.opacity = 0.85 * (1 - progress)
    },
    dispose() {
      disposeMesh(mesh)
    },
  }
}

const CONFETTI_COLORS: readonly number[] = [0xfacc15, 0xf472b6, 0x60a5fa, 0x34d399, 0xf97316, 0xffffff]

export function createConfettiEffect(pos: Position): Effect {
  const center = tileCenter(pos)
  const group = new THREE.Group()
  group.position.set(center.x, center.y, Z_EFFECT)
  const count = 18
  const durationSeconds = CONFETTI_EFFECT_MS / 1000
  const particles: { mesh: THREE.Mesh; vx: number; vy: number; spin: number }[] = []

  for (let i = 0; i < count; i += 1) {
    const geometry = new THREE.PlaneGeometry(0.09, 0.05)
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? 0xffffff
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geometry, material)
    const angle = (i / count) * Math.PI * 2
    const speed = 0.9 + (i % 5) * 0.15
    group.add(mesh)
    particles.push({ mesh, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed + 0.6, spin: (i % 2 === 0 ? 1 : -1) * 4 })
  }

  return {
    object: group,
    durationSeconds,
    update(progress) {
      const t = progress * durationSeconds
      const gravity = 1.6
      for (const particle of particles) {
        particle.mesh.position.x = particle.vx * t
        particle.mesh.position.y = particle.vy * t - 0.5 * gravity * t * t
        particle.mesh.rotation.z = particle.spin * t
        ;(particle.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - progress
      }
    },
    dispose() {
      for (const particle of particles) {
        disposeMesh(particle.mesh)
      }
    },
  }
}

interface ActiveEffect {
  readonly effect: Effect
  readonly createdAt: number
}

export interface EffectsManager {
  readonly group: THREE.Group
  add(effect: Effect, nowSeconds: number): void
  update(nowSeconds: number): void
  disposeAll(): void
}

export function createEffectsManager(): EffectsManager {
  const group = new THREE.Group()
  const active: ActiveEffect[] = []

  function add(effect: Effect, nowSeconds: number): void {
    group.add(effect.object)
    active.push({ effect, createdAt: nowSeconds })
  }

  function update(nowSeconds: number): void {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const entry = active[i]
      if (!entry) {
        continue
      }

      const progress =
        entry.effect.durationSeconds <= 0 ? 1 : Math.min(1, Math.max(0, (nowSeconds - entry.createdAt) / entry.effect.durationSeconds))
      entry.effect.update(progress)
      if (progress >= 1) {
        group.remove(entry.effect.object)
        entry.effect.dispose()
        active.splice(i, 1)
      }
    }
  }

  function disposeAll(): void {
    for (const entry of active) {
      group.remove(entry.effect.object)
      entry.effect.dispose()
    }
    active.length = 0
  }

  return { group, add, update, disposeAll }
}
