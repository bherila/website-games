import * as THREE from 'three'

import type { GameEvent, GameState } from '../gameTypes'
import { PLAYER_WORLD_Z, toDisplayZ } from './constants'
import { CanvasLabel } from './labels'

const TRACER_POOL = 80
const TRACER_LIFE = 0.07
const TRACERS_PER_VOLLEY = 8
const POP_POOL = 96
const POPS_PER_KILL_EVENT = 4
const POP_LIFE = 0.35
const FLASH_POOL = 8
const FLASH_LIFE = 0.05
const FLOAT_POOL = 12
const FLOAT_LIFE = 0.9
const SHAKE_DECAY = 6

interface Tracer {
  fromX: number
  fromZ: number
  toX: number
  toWorldZ: number
  age: number
}

interface Pop {
  x: number
  y: number
  worldZ: number
  vx: number
  vy: number
  vz: number
  age: number
}

interface FloatingText {
  label: CanvasLabel
  x: number
  worldZ: number
  age: number
}

export interface EffectsView {
  handleEvents(events: readonly GameEvent[], state: GameState): void
  update(state: GameState, dt: number): void
  readonly shakeOffset: THREE.Vector2
}

export function createEffects(scene: THREE.Scene): EffectsView {
  const tracerGeometry = new THREE.BoxGeometry(0.045, 0.045, 1)
  const tracerMaterial = new THREE.MeshBasicMaterial({ color: '#fff36b' })
  const tracers = new THREE.InstancedMesh(tracerGeometry, tracerMaterial, TRACER_POOL)
  tracers.frustumCulled = false
  scene.add(tracers)

  const popGeometry = new THREE.TetrahedronGeometry(0.16, 0)
  const popMaterial = new THREE.MeshBasicMaterial({ color: '#ff7ba9' })
  const pops = new THREE.InstancedMesh(popGeometry, popMaterial, POP_POOL)
  pops.frustumCulled = false
  scene.add(pops)

  const flashTexture = createFlashTexture()
  const flashes: THREE.Sprite[] = []
  for (let index = 0; index < FLASH_POOL; index += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTexture,
      color: '#ffe58a',
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }))
    sprite.scale.set(0.5, 0.5, 1)
    sprite.visible = false
    scene.add(sprite)
    flashes.push(sprite)
  }
  let flashAge = FLASH_LIFE

  const liveTracers: Tracer[] = []
  const livePops: Pop[] = []
  const floatingTexts: FloatingText[] = []
  let floatCursor = 0

  const shakeOffset = new THREE.Vector2()
  let shakePower = 0
  let shakePhase = 0

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const direction = new THREE.Vector3()
  const zAxis = new THREE.Vector3(0, 0, 1)

  function spawnFloatingText(text: string, positive: boolean, x: number, worldZ: number): void {
    let entry = floatingTexts[floatCursor]
    if (!entry) {
      const label = new CanvasLabel({ color: '#ffffff', glow: positive ? '#22d3ee' : '#fb7185', fontPx: 88 })
      label.sprite.scale.set(1.6, 0.8, 1)
      scene.add(label.sprite)
      entry = { label, x, worldZ, age: 0 }
      floatingTexts[floatCursor] = entry
    }
    entry.label.setStyle({ glow: positive ? '#22d3ee' : '#fb7185' })
    entry.label.redraw(text)
    ;(entry.label.sprite.material as THREE.SpriteMaterial).color.set(positive ? '#a5f3fc' : '#fda4af')
    entry.label.sprite.visible = true
    entry.x = x
    entry.worldZ = worldZ
    entry.age = 0
    floatCursor = (floatCursor + 1) % FLOAT_POOL
  }

  return {
    shakeOffset,

    handleEvents(events: readonly GameEvent[], state: GameState): void {
      for (const event of events) {
        switch (event.type) {
          case 'volley': {
            const count = Math.min(TRACERS_PER_VOLLEY, event.shots)
            for (let index = 0; index < count; index += 1) {
              if (liveTracers.length >= TRACER_POOL) {
                break
              }
              const spread = (index - (count - 1) / 2) * 0.35
              liveTracers.push({
                fromX: state.playerX + spread + (Math.random() - 0.5) * 0.1,
                fromZ: PLAYER_WORLD_Z - 0.4,
                toX: event.targetX + (Math.random() - 0.5) * 0.5,
                toWorldZ: event.targetZ,
                age: 0,
              })
            }
            flashAge = 0
            break
          }
          case 'kills': {
            for (let index = 0; index < POPS_PER_KILL_EVENT; index += 1) {
              if (livePops.length >= POP_POOL) {
                break
              }
              livePops.push({
                x: event.x + (Math.random() - 0.5) * 0.8,
                y: 0.5,
                worldZ: event.z + (Math.random() - 0.5) * 0.6,
                vx: (Math.random() - 0.5) * 2.4,
                vy: 2 + Math.random() * 1.6,
                vz: (Math.random() - 0.5) * 2.4,
                age: 0,
              })
            }
            break
          }
          case 'gateApplied': {
            if (event.delta !== 0) {
              const text = event.delta > 0 ? `+${event.delta}` : `${event.delta}`
              spawnFloatingText(text, event.delta > 0, (event.side === 'left' ? -1.3 : 1.3), state.progress + 0.6)
            }
            break
          }
          case 'clash': {
            spawnFloatingText(`−${event.lostSoldiers}`, false, event.x, state.progress + 0.6)
            shakePower = Math.min(0.4, 0.18 + event.lostSoldiers * 0.01)
            break
          }
          case 'bossPulse': {
            spawnFloatingText(`−${event.lost}`, false, state.playerX, state.progress + 0.6)
            shakePower = Math.max(shakePower, 0.12)
            break
          }
          default:
            break
        }
      }
    },

    update(state: GameState, dt: number): void {
      let tracerCount = 0
      for (let index = liveTracers.length - 1; index >= 0; index -= 1) {
        const tracer = liveTracers[index]!
        tracer.age += dt
        if (tracer.age > TRACER_LIFE) {
          liveTracers.splice(index, 1)
          continue
        }
        const toZ = toDisplayZ(tracer.toWorldZ, state.progress)
        direction.set(tracer.toX - tracer.fromX, 0.15, toZ - tracer.fromZ)
        const length = direction.length()
        position.set(
          (tracer.fromX + tracer.toX) / 2,
          0.55,
          (tracer.fromZ + toZ) / 2,
        )
        quaternion.setFromUnitVectors(zAxis, direction.normalize())
        scale.set(1, 1, Math.max(0.4, length))
        matrix.compose(position, quaternion, scale)
        tracers.setMatrixAt(tracerCount, matrix)
        tracerCount += 1
      }
      tracers.count = tracerCount
      tracers.instanceMatrix.needsUpdate = true

      let popCount = 0
      scale.set(1, 1, 1)
      quaternion.identity()
      for (let index = livePops.length - 1; index >= 0; index -= 1) {
        const pop = livePops[index]!
        pop.age += dt
        if (pop.age > POP_LIFE) {
          livePops.splice(index, 1)
          continue
        }
        pop.x += pop.vx * dt
        pop.y += pop.vy * dt
        pop.vy -= 7 * dt
        pop.worldZ += pop.vz * dt
        const remaining = 1 - pop.age / POP_LIFE
        scale.set(remaining, remaining, remaining)
        position.set(pop.x, pop.y, toDisplayZ(pop.worldZ, state.progress))
        matrix.compose(position, quaternion, scale)
        pops.setMatrixAt(popCount, matrix)
        popCount += 1
      }
      pops.count = popCount
      pops.instanceMatrix.needsUpdate = true

      flashAge += dt
      const flashVisible = flashAge <= FLASH_LIFE
      const flashCount = Math.min(FLASH_POOL, Math.ceil(state.armySize / 2))
      for (let index = 0; index < FLASH_POOL; index += 1) {
        const flash = flashes[index]!
        flash.visible = flashVisible && index < flashCount
        if (flash.visible) {
          flash.position.set(
            state.playerX + (index - (flashCount - 1) / 2) * 0.42,
            0.55,
            PLAYER_WORLD_Z - 0.62,
          )
        }
      }

      for (const entry of floatingTexts) {
        if (!entry.label.sprite.visible) {
          continue
        }
        entry.age += dt
        if (entry.age > FLOAT_LIFE) {
          entry.label.sprite.visible = false
          continue
        }
        const t = entry.age / FLOAT_LIFE
        entry.label.sprite.position.set(entry.x, 1.6 + t * 1.4, toDisplayZ(entry.worldZ, state.progress))
        ;(entry.label.sprite.material as THREE.SpriteMaterial).opacity = 1 - t * t
      }

      shakePower = Math.max(0, shakePower - shakePower * SHAKE_DECAY * dt - 0.002)
      shakePhase += dt * 70
      shakeOffset.set(
        Math.sin(shakePhase) * shakePower,
        Math.sin(shakePhase * 1.3 + 1) * shakePower * 0.6,
      )
    },
  }
}

function createFlashTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30)
    gradient.addColorStop(0, 'rgba(255, 244, 190, 1)')
    gradient.addColorStop(0.4, 'rgba(255, 213, 120, 0.7)')
    gradient.addColorStop(1, 'rgba(255, 180, 60, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  return texture
}
