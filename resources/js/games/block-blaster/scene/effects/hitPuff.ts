import * as THREE from 'three'

const PARTICLE_COUNT = 8

export interface HitPuff {
  group: THREE.Group
  particles: PuffParticle[]
  startedAt: number
  duration: number
}

interface PuffParticle {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  baseScale: number
}

/** A quick expanding/fading particle puff, reused for both the cannon muzzle-flash and ball/block impacts. */
export function createHitPuff(position: THREE.Vector3, color: number, duration: number, now: number): HitPuff {
  const group = new THREE.Group()
  group.position.copy(position)

  const particles: PuffParticle[] = []
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const geometry = new THREE.SphereGeometry(0.06, 6, 6)
    const material = new THREE.MeshBasicMaterial({ color, transparent: true })
    const mesh = new THREE.Mesh(geometry, material)
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2
    const speed = 1.4 + (Math.random() * 0.8)
    const velocity = new THREE.Vector3(
      Math.cos(angle) * speed,
      0.6 + (Math.random() * 0.6),
      Math.sin(angle) * speed,
    )
    group.add(mesh)
    particles.push({ mesh, velocity, baseScale: 0.6 + (Math.random() * 0.5) })
  }

  return { group, particles, startedAt: now, duration }
}

export function updateHitPuff(puff: HitPuff, now: number, dt: number): boolean {
  const progress = (now - puff.startedAt) / puff.duration
  if (progress >= 1) {
    return true
  }

  for (const particle of puff.particles) {
    particle.mesh.position.addScaledVector(particle.velocity, dt)
    const fade = Math.max(0, 1 - progress)
    const material = particle.mesh.material as THREE.MeshBasicMaterial
    material.opacity = fade
    particle.mesh.scale.setScalar(particle.baseScale * (1 + (progress * 1.6)))
  }

  return false
}

export function disposeHitPuff(puff: HitPuff): void {
  for (const particle of puff.particles) {
    particle.mesh.geometry.dispose()
    const material = particle.mesh.material
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose())
    } else {
      material.dispose()
    }
  }
}
