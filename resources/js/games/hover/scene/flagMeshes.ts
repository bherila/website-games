import * as THREE from 'three'

import type { Flag, Pod, Trap } from '../gameTypes'
import type { ArrowPad, CompassDir } from '../maps/mapTypes'
import { createPodIconTexture } from './canvasTextures'

const FLAG_POLE_HEIGHT = 3.2
const CLOTH_WIDTH = 1.7
const CLOTH_HEIGHT = 1.05
const CLOTH_SEGMENTS_X = 10

const TEAM_COLORS = { blue: 0x2f6bff, red: 0xff3b30 } as const

/** Pole + waving cloth + glowing base ring; group.userData.flagId set for lookups. */
export function createFlagMesh(flag: Flag): THREE.Group {
  const group = new THREE.Group()
  group.userData.flagId = flag.id
  const color = TEAM_COLORS[flag.team]

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, FLAG_POLE_HEIGHT, 10),
    new THREE.MeshStandardMaterial({ color: 0xd9dee7, roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide }),
  )
  pole.position.y = FLAG_POLE_HEIGHT / 2
  group.add(pole)

  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(CLOTH_WIDTH, CLOTH_HEIGHT, CLOTH_SEGMENTS_X, 4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, side: THREE.DoubleSide }),
  )
  cloth.name = 'cloth'
  cloth.position.set(CLOTH_WIDTH / 2 + 0.09, FLAG_POLE_HEIGHT - CLOTH_HEIGHT / 2 - 0.15, 0)
  group.add(cloth)

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.07, 10, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.06
  group.add(ring)

  group.position.set(flag.pos.x, 0, flag.pos.z)
  return group
}

/** Sine-wave the cloth along its width so flags ripple; call each frame. */
export function animateFlagCloth(flagGroup: THREE.Object3D, timeSec: number): void {
  const cloth = flagGroup.getObjectByName('cloth') as THREE.Mesh | undefined
  if (!cloth) {
    return
  }

  const geometry = cloth.geometry as THREE.PlaneGeometry
  const position = geometry.attributes.position
  if (!position) {
    return
  }

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const along = (x + CLOTH_WIDTH / 2) / CLOTH_WIDTH
    position.setZ(i, Math.sin(along * 4 + timeSec * 5) * 0.14 * along)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
}

const POD_COLOR = 0x34d399
const JUMP_BUBBLE_COLOR = 0x9fdcff

/** Translucent shell (iridescent bubble for jump pods) with the pod's icon billboarded inside. */
export function createPodMesh(pod: Pod): THREE.Group {
  const group = new THREE.Group()
  group.userData.podId = pod.id

  if (pod.kind === 'jump') {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 24, 16),
      new THREE.MeshStandardMaterial({
        color: JUMP_BUBBLE_COLOR,
        transparent: true,
        opacity: 0.22,
        roughness: 0.05,
        metalness: 0.15,
        side: THREE.DoubleSide,
      }),
    )
    shell.name = 'shell'
    group.add(shell)

    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 24, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.08,
        roughness: 0.05,
        metalness: 0.15,
        side: THREE.DoubleSide,
      }),
    )
    group.add(rim)

    const icon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: createPodIconTexture(pod.kind), transparent: true, depthWrite: false }),
    )
    icon.scale.set(1.2, 1.2, 1)
    group.add(icon)
  } else {
    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.85, 1),
      new THREE.MeshStandardMaterial({
        color: POD_COLOR,
        transparent: true,
        opacity: 0.32,
        roughness: 0.15,
        metalness: 0.2,
        side: THREE.DoubleSide,
      }),
    )
    shell.name = 'shell'
    group.add(shell)

    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.87, 1),
      new THREE.MeshBasicMaterial({ color: POD_COLOR, wireframe: true, transparent: true, opacity: 0.5 }),
    )
    group.add(wire)

    const icon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: createPodIconTexture(pod.kind), transparent: true, depthWrite: false }),
    )
    icon.scale.set(1.05, 1.05, 1)
    group.add(icon)
  }

  group.position.set(pod.pos.x, podFloatHeight(0, pod.id), pod.pos.z)
  return group
}

const TRAP_DECAL_SIZE = 3.0
const TRAP_TEXTURE_SIZE = 128
const TRAP_FILL_COLOR = '#d21f2f'
const TRAP_BORDER_COLOR = '#7f1018'

let cachedTrapTexture: THREE.CanvasTexture | null = null

/** Traps share one texture per session; userData.cached exempts it from per-round disposal. */
function getTrapTexture(): THREE.CanvasTexture {
  if (!cachedTrapTexture) {
    cachedTrapTexture = createTrapTexture()
    cachedTrapTexture.userData.cached = true
  }
  return cachedTrapTexture
}

function createTrapTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = TRAP_TEXTURE_SIZE
  canvas.height = TRAP_TEXTURE_SIZE
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = TRAP_FILL_COLOR
    ctx.fillRect(0, 0, TRAP_TEXTURE_SIZE, TRAP_TEXTURE_SIZE)

    const border = TRAP_TEXTURE_SIZE * 0.08
    ctx.strokeStyle = TRAP_BORDER_COLOR
    ctx.lineWidth = border
    ctx.strokeRect(border / 2, border / 2, TRAP_TEXTURE_SIZE - border, TRAP_TEXTURE_SIZE - border)

    ctx.fillStyle = TRAP_BORDER_COLOR
    for (const [x, y, radius] of [
      [40, 34, 14],
      [90, 50, 17],
      [54, 90, 16],
      [96, 100, 11],
    ] as const) {
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Flat red goo decal marking a sticky trap on the floor; group.userData.trapId set for lookups. */
export function createTrapMesh(trap: Trap): THREE.Group {
  const group = new THREE.Group()
  group.userData.trapId = trap.id

  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(TRAP_DECAL_SIZE, TRAP_DECAL_SIZE),
    new THREE.MeshStandardMaterial({ map: getTrapTexture(), transparent: true, side: THREE.DoubleSide }),
  )
  decal.rotation.x = -Math.PI / 2
  decal.position.y = 0.03
  group.add(decal)

  group.position.set(trap.pos.x, 0, trap.pos.z)
  return group
}

const ARROW_PAD_DECAL_SIZE = 4.4
const ARROW_PAD_TEXTURE_SIZE = 128
const ARROW_PAD_COLOR = '#ffe12e'

const ARROW_PAD_ROTATION_BY_DIR: Record<CompassDir, number> = {
  north: 0,
  east: -Math.PI / 2,
  south: Math.PI,
  west: Math.PI / 2,
}

function drawChevron(ctx: CanvasRenderingContext2D, apexY: number): void {
  ctx.beginPath()
  ctx.moveTo(22, apexY + 32)
  ctx.lineTo(64, apexY)
  ctx.lineTo(106, apexY + 32)
  ctx.stroke()
}

let cachedArrowPadTexture: THREE.CanvasTexture | null = null

/** Arrow pads share one texture per session; userData.cached exempts it from disposal. */
function getArrowPadTexture(): THREE.CanvasTexture {
  if (!cachedArrowPadTexture) {
    cachedArrowPadTexture = createArrowPadTexture()
    cachedArrowPadTexture.userData.cached = true
  }
  return cachedArrowPadTexture
}

function createArrowPadTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = ARROW_PAD_TEXTURE_SIZE
  canvas.height = ARROW_PAD_TEXTURE_SIZE
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.strokeStyle = ARROW_PAD_COLOR
    ctx.lineWidth = 14
    ctx.shadowColor = ARROW_PAD_COLOR
    ctx.shadowBlur = 18
    drawChevron(ctx, 44)
    drawChevron(ctx, 76)

    ctx.shadowBlur = 0
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 6
    drawChevron(ctx, 44)
    drawChevron(ctx, 76)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Flat glowing chevron decal pointing along the pad's push direction. */
export function createArrowPadMesh(pad: ArrowPad, pos: { x: number; z: number }): THREE.Group {
  const group = new THREE.Group()

  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(ARROW_PAD_DECAL_SIZE, ARROW_PAD_DECAL_SIZE),
    new THREE.MeshBasicMaterial({ map: getArrowPadTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  )
  decal.rotation.x = -Math.PI / 2
  decal.position.y = 0.04
  group.add(decal)

  group.position.set(pos.x, 0, pos.z)
  group.rotation.y = ARROW_PAD_ROTATION_BY_DIR[pad.dir]
  return group
}

export function podFloatHeight(timeSec: number, podId: number): number {
  return 1.5 + Math.sin(timeSec * 1.8 + podId * 1.3) * 0.25
}
