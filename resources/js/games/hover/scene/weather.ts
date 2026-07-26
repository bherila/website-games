import * as THREE from 'three'

import type { WeatherKind } from '../maps/mapTypes'

/**
 * Ambient weather particles as one THREE.Points cloud that follows the
 * player: update() re-wraps every particle into a box centered on the craft,
 * so a few hundred points read as map-wide weather. Particles depth-test
 * against walls (no depthWrite, so they never punch holes in each other) and
 * the cloud is never frustum-culled — it always surrounds the camera.
 *
 * Added to the per-round static group, so clearGroup() disposes the
 * geometry/material/sprite along with the rest of the round's scenery.
 */
export interface WeatherEffect {
  kind: WeatherKind
  points: THREE.Points
  update(dt: number, centerX: number, centerZ: number): void
}

interface WeatherConfig {
  count: number
  /** XZ extent of the particle box centered on the player. */
  boxWidth: number
  boxHeight: number
  /** World-space point size (sizeAttenuation on). */
  size: number
  color: number
  opacity: number
  /** Per-particle downward speed range; negative lifts (dust updraft). */
  fallSpeedMin: number
  fallSpeedMax: number
  /** Constant horizontal drift. */
  windX: number
  windZ: number
  /** Amplitude of per-particle lateral sine sway (units/sec). */
  sway: number
  sprite: 'flake' | 'streak' | 'puff'
}

const CONFIGS: Record<WeatherKind, WeatherConfig> = {
  snow: {
    count: 700,
    boxWidth: 70,
    boxHeight: 26,
    size: 0.42,
    color: 0xffffff,
    opacity: 0.9,
    fallSpeedMin: 2.2,
    fallSpeedMax: 4.4,
    windX: 0.7,
    windZ: 0.3,
    sway: 1.7,
    sprite: 'flake',
  },
  rain: {
    count: 900,
    boxWidth: 60,
    boxHeight: 28,
    size: 1.0,
    color: 0xc4d8ec,
    opacity: 0.5,
    fallSpeedMin: 26,
    fallSpeedMax: 34,
    windX: 3,
    windZ: 1.2,
    sway: 0,
    sprite: 'streak',
  },
  sandstorm: {
    count: 550,
    boxWidth: 90,
    boxHeight: 14,
    size: 3.2,
    color: 0xd9b678,
    opacity: 0.36,
    fallSpeedMin: -0.6,
    fallSpeedMax: 0.9,
    windX: 15,
    windZ: 5,
    sway: 3,
    sprite: 'puff',
  },
}

/**
 * `random` defaults to Math.random; visual-test mode passes a seeded RNG so
 * weather screenshots are deterministic like the rest of the round.
 */
export function createWeather(kind: WeatherKind, random: () => number = Math.random): WeatherEffect {
  const config = CONFIGS[kind]
  const positions = new Float32Array(config.count * 3)
  const fallSpeeds = new Float32Array(config.count)
  const phases = new Float32Array(config.count)

  for (let i = 0; i < config.count; i++) {
    positions[i * 3] = (random() - 0.5) * config.boxWidth
    positions[i * 3 + 1] = random() * config.boxHeight
    positions[i * 3 + 2] = (random() - 0.5) * config.boxWidth
    fallSpeeds[i] = config.fallSpeedMin + random() * (config.fallSpeedMax - config.fallSpeedMin)
    phases[i] = random() * Math.PI * 2
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    size: config.size,
    color: config.color,
    map: createSpriteTexture(config.sprite),
    transparent: true,
    opacity: config.opacity,
    depthWrite: false,
    sizeAttenuation: true,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false

  let elapsed = 0
  const halfWidth = config.boxWidth / 2

  const update = (dt: number, centerX: number, centerZ: number): void => {
    elapsed += dt
    for (let i = 0; i < config.count; i++) {
      const swayVel = config.sway * Math.sin(elapsed * 1.3 + (phases[i] ?? 0))
      let x = (positions[i * 3] ?? 0) + (config.windX + swayVel) * dt
      let y = (positions[i * 3 + 1] ?? 0) - (fallSpeeds[i] ?? 0) * dt
      let z = (positions[i * 3 + 2] ?? 0) + config.windZ * dt

      x = wrap(x - (centerX - halfWidth), config.boxWidth) + centerX - halfWidth
      z = wrap(z - (centerZ - halfWidth), config.boxWidth) + centerZ - halfWidth
      y = wrap(y, config.boxHeight)

      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
    }
    geometry.getAttribute('position').needsUpdate = true
  }

  return { kind, points, update }
}

function wrap(value: number, span: number): number {
  const mod = value % span
  return mod < 0 ? mod + span : mod
}

const SPRITE_SIZE = 64

function createSpriteTexture(sprite: 'flake' | 'streak' | 'puff'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_SIZE
  canvas.height = SPRITE_SIZE
  const ctx = canvas.getContext('2d')
  if (ctx) {
    if (sprite === 'streak') {
      const gradient = ctx.createLinearGradient(0, 0, 0, SPRITE_SIZE)
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
      gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.95)')
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(SPRITE_SIZE / 2 - 3, 0, 6, SPRITE_SIZE)
    } else {
      const core = sprite === 'flake' ? 0.55 : 0.15
      const gradient = ctx.createRadialGradient(
        SPRITE_SIZE / 2,
        SPRITE_SIZE / 2,
        1,
        SPRITE_SIZE / 2,
        SPRITE_SIZE / 2,
        SPRITE_SIZE / 2,
      )
      gradient.addColorStop(0, `rgba(255, 255, 255, ${sprite === 'flake' ? 1 : 0.8})`)
      gradient.addColorStop(core, `rgba(255, 255, 255, ${sprite === 'flake' ? 0.85 : 0.35})`)
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(SPRITE_SIZE / 2, SPRITE_SIZE / 2, SPRITE_SIZE / 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
