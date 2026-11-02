import * as THREE from 'three'

import { TOWERS } from '../catalog'
import type { GameEvent } from '../gameTypes'
import { TOWER_SHOT_COLOR } from './themes'

const RING_POOL = 40
const SPARK_POOL = 220
const BEAM_POOL = 36

interface Ring { x: number; z: number; age: number; life: number; radius: number; color: number; active: boolean }
interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; color: number; active: boolean }
interface Beam { ax: number; az: number; bx: number; bz: number; age: number; active: boolean }

const BEAM_LIFE = 0.13

export interface Effects {
  handle: (events: readonly GameEvent[]) => void
  update: (frameDelta: number) => void
}

export function createEffects(scene: THREE.Scene, reducedMotion: boolean): Effects {
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()

  const ringMesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.82, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }), RING_POOL)
  ringMesh.frustumCulled = false
  ringMesh.renderOrder = 5
  scene.add(ringMesh)
  const sparkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), SPARK_POOL)
  sparkMesh.frustumCulled = false
  scene.add(sparkMesh)
  const beamMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xfff7a8 }), BEAM_POOL)
  beamMesh.frustumCulled = false
  scene.add(beamMesh)

  const rings: Ring[] = Array.from({ length: RING_POOL }, () => ({ x: 0, z: 0, age: 0, life: 1, radius: 1, color: 0xffffff, active: false }))
  const sparks: Spark[] = Array.from({ length: SPARK_POOL }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, color: 0xffffff, active: false }))
  const beams: Beam[] = Array.from({ length: BEAM_POOL }, () => ({ ax: 0, az: 0, bx: 0, bz: 0, age: 0, active: false }))
  let nextRing = 0
  let nextSpark = 0
  let nextBeam = 0

  function addRing(x: number, z: number, radius: number, ringColor: number, life = 0.35): void {
    const ring = rings[nextRing]
    nextRing = (nextRing + 1) % RING_POOL
    if (ring) {
      Object.assign(ring, { x, z, radius, color: ringColor, life, age: 0, active: true })
    }
  }

  function addSparks(x: number, z: number, count: number, sparkColor: number, speed = 2.2, size = 0.07): void {
    if (reducedMotion) {
      return
    }
    for (let index = 0; index < count; index += 1) {
      const spark = sparks[nextSpark]
      nextSpark = (nextSpark + 1) % SPARK_POOL
      if (!spark) {
        continue
      }
      const angle = Math.random() * Math.PI * 2
      const pace = speed * (0.5 + (Math.random() * 0.6))
      Object.assign(spark, {
        x, y: 0.45, z,
        vx: Math.cos(angle) * pace,
        vy: 2 + (Math.random() * 2),
        vz: Math.sin(angle) * pace,
        age: 0,
        life: 0.35 + (Math.random() * 0.25),
        size,
        color: sparkColor,
        active: true,
      })
    }
  }

  return {
    handle(events) {
      for (const event of events) {
        switch (event.type) {
          case 'hit':
            if (event.splash > 0) {
              addRing(event.x, event.y, event.splash, TOWER_SHOT_COLOR[event.tower] ?? 0xffffff)
            }
            addSparks(event.x, event.y, event.tower === 'boulder' ? 6 : 2, TOWER_SHOT_COLOR[event.tower] ?? 0xffffff)
            break
          case 'beam':
            for (let index = 0; index < event.points.length - 1; index += 1) {
              const from = event.points[index]
              const to = event.points[index + 1]
              const beam = beams[nextBeam]
              nextBeam = (nextBeam + 1) % BEAM_POOL
              if (from && to && beam) {
                Object.assign(beam, { ax: from.x, az: from.y, bx: to.x, bz: to.y, age: 0, active: true })
              }
            }
            break
          case 'death':
            addSparks(event.x, event.y, event.kind === 'boss' ? 26 : 7, 0xfde68a)
            if (event.kind === 'boss') {
              addRing(event.x, event.y, 2, 0xfde68a, 0.6)
            }
            break
          case 'coin':
            addSparks(event.x, event.y, 3, 0xfbbf24, 1.2, 0.05)
            break
          case 'built':
            addRing(event.x, event.y, 0.8, TOWER_SHOT_COLOR[event.tower] ?? 0xffffff)
            addSparks(event.x, event.y, TOWERS[event.tower].damage > 0 ? 8 : 3, 0xe7e5e4)
            break
          case 'upgraded':
            addRing(event.x, event.y, 1, 0xfacc15, 0.5)
            addSparks(event.x, event.y, 12, 0xfacc15)
            break
          case 'sold':
            addSparks(event.x, event.y, 6, 0xfbbf24)
            break
          case 'strike':
            addSparks(event.x, event.y, 2, 0xd6d3d1, 1.5, 0.05)
            break
          case 'destroyed':
            addRing(event.x, event.y, 1, 0xef4444, 0.45)
            addSparks(event.x, event.y, 18, 0x78716c, 3, 0.09)
            break
          default:
            break
        }
      }
    },
    update(frameDelta) {
      let ringCount = 0
      for (const ring of rings) {
        if (!ring.active) {
          continue
        }
        ring.age += frameDelta
        if (ring.age >= ring.life) {
          ring.active = false
          continue
        }
        const grow = 0.35 + (0.65 * (ring.age / ring.life))
        dummy.position.set(ring.x, 0.08, ring.z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(ring.radius * grow, 1, ring.radius * grow)
        dummy.updateMatrix()
        ringMesh.setMatrixAt(ringCount, dummy.matrix)
        ringMesh.setColorAt(ringCount, color.setHex(ring.color))
        ringCount += 1
      }
      ringMesh.count = ringCount
      ringMesh.instanceMatrix.needsUpdate = true
      if (ringMesh.instanceColor) {
        ringMesh.instanceColor.needsUpdate = true
      }

      let sparkCount = 0
      for (const spark of sparks) {
        if (!spark.active) {
          continue
        }
        spark.age += frameDelta
        if (spark.age >= spark.life) {
          spark.active = false
          continue
        }
        spark.vy -= 9 * frameDelta
        spark.x += spark.vx * frameDelta
        spark.y = Math.max(0.03, spark.y + (spark.vy * frameDelta))
        spark.z += spark.vz * frameDelta
        dummy.position.set(spark.x, spark.y, spark.z)
        dummy.rotation.set(spark.age * 6, spark.age * 9, 0)
        dummy.scale.setScalar(spark.size * (1 - (spark.age / spark.life)))
        dummy.updateMatrix()
        sparkMesh.setMatrixAt(sparkCount, dummy.matrix)
        sparkMesh.setColorAt(sparkCount, color.setHex(spark.color))
        sparkCount += 1
      }
      sparkMesh.count = sparkCount
      sparkMesh.instanceMatrix.needsUpdate = true
      if (sparkMesh.instanceColor) {
        sparkMesh.instanceColor.needsUpdate = true
      }

      let beamCount = 0
      for (const beam of beams) {
        if (!beam.active) {
          continue
        }
        beam.age += frameDelta
        if (beam.age >= BEAM_LIFE) {
          beam.active = false
          continue
        }
        const length = Math.hypot(beam.bx - beam.ax, beam.bz - beam.az)
        const thick = 0.07 * (1 - (beam.age / BEAM_LIFE))
        dummy.position.set((beam.ax + beam.bx) / 2, 0.75, (beam.az + beam.bz) / 2)
        dummy.rotation.set(0, Math.atan2(beam.bz - beam.az, beam.bx - beam.ax) * -1, 0)
        dummy.scale.set(length, thick, thick)
        dummy.updateMatrix()
        beamMesh.setMatrixAt(beamCount, dummy.matrix)
        beamCount += 1
      }
      beamMesh.count = beamCount
      beamMesh.instanceMatrix.needsUpdate = true
    },
  }
}
