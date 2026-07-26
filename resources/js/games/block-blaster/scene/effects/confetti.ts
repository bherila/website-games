import * as THREE from 'three'

import { CONFETTI_DURATION_S } from '../sceneConstants'

const CONFETTI_PALETTE = ['#ffe14a', '#ff7be0', '#71f0d3', '#ff9b3f', '#9b7bff', '#ffffff']
const PARTICLE_COUNT = 24

export interface ConfettiBurst {
  group: THREE.Group
  particles: ConfettiParticle[]
  startedAt: number
  duration: number
}

interface ConfettiParticle {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  angularVelocity: number
  baseScale: number
}

/** Adapted from marble-sort/scene/animation/confetti.ts for the win-overlay burst. */
export function createConfettiBurst(position: THREE.Vector3, now: number): ConfettiBurst {
  const group = new THREE.Group()
  group.position.copy(position)

  const particles: ConfettiParticle[] = []
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const hex = CONFETTI_PALETTE[i % CONFETTI_PALETTE.length] ?? '#ffffff'
    const geometry = i % 2 === 0
      ? new THREE.PlaneGeometry(0.14, 0.07)
      : new THREE.PlaneGeometry(0.1, 0.1)
    const material = new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide, transparent: true })
    const mesh = new THREE.Mesh(geometry, material)
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2
    const speed = 2.4 + (Math.random() * 1.8)
    const velocity = new THREE.Vector3(
      Math.cos(angle) * speed * 0.7,
      3.2 + (Math.random() * 1.4),
      Math.sin(angle) * speed * 0.7,
    )
    mesh.rotation.z = Math.random() * Math.PI
    group.add(mesh)
    particles.push({
      mesh,
      velocity,
      angularVelocity: (Math.random() - 0.5) * 8,
      baseScale: 0.9 + (Math.random() * 0.4),
    })
  }

  return { group, particles, startedAt: now, duration: CONFETTI_DURATION_S }
}

export function updateConfettiBurst(burst: ConfettiBurst, now: number, gravityY: number, dt: number): boolean {
  const progress = (now - burst.startedAt) / burst.duration
  if (progress >= 1) {
    return true
  }

  for (const particle of burst.particles) {
    particle.velocity.y += gravityY * 0.35 * dt
    particle.mesh.position.addScaledVector(particle.velocity, dt)
    particle.mesh.rotation.z += particle.angularVelocity * dt
    particle.mesh.rotation.x += particle.angularVelocity * dt * 0.6
    const fade = Math.max(0, 1 - progress)
    const material = particle.mesh.material as THREE.MeshBasicMaterial
    material.opacity = fade
    particle.mesh.scale.setScalar(particle.baseScale * (1 + (progress * 0.3)))
  }

  return false
}

export function disposeConfettiBurst(burst: ConfettiBurst): void {
  for (const particle of burst.particles) {
    particle.mesh.geometry.dispose()
    const material = particle.mesh.material
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose())
    } else {
      material.dispose()
    }
  }
}
