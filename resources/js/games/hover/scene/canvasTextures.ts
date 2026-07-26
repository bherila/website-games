import * as THREE from 'three'

import type { PodKind } from '../gameTypes'
import type { FloorPattern, WallTextureKind } from '../maps/mapTypes'
import { hexColor } from './threeUtils'

const WALL_TEXTURE_SIZE = 256

/**
 * Procedural repeating wall texture — one tile per grid cell face. Smooth,
 * saturated fills (no pixel-art noise) so the look stays vibrant up close.
 */
export function createWallTexture(kind: WallTextureKind, colorA: number, colorB: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = WALL_TEXTURE_SIZE
  canvas.height = WALL_TEXTURE_SIZE
  const ctx = canvas.getContext('2d')
  if (ctx) {
    if (kind === 'stone') {
      drawStone(ctx, colorA, colorB)
    } else if (kind === 'brick') {
      drawBrick(ctx, colorA, colorB)
    } else if (kind === 'neon') {
      drawNeon(ctx, colorA, colorB)
    } else if (kind === 'ice') {
      drawIce(ctx, colorA, colorB)
    } else if (kind === 'hedge') {
      drawHedge(ctx, colorA, colorB)
    } else if (kind === 'sandstone') {
      drawSandstone(ctx, colorA, colorB)
    } else {
      drawPanel(ctx, colorA, colorB)
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 4
  return texture
}

interface CourseOptions {
  rows: number
  gap: number
  cornerRadius: number
  blocksForRow: (row: number) => number
  /** block index runs -1..blocks (staggered rows bleed past the tile edge). */
  fillStyleAt: (row: number, block: number) => string
}

/**
 * Staggered-masonry course loop shared by every block-wall texture. Shade
 * multipliers passed to fillStyleAt must be coprime with their modulus or
 * the block-to-block variation silently cancels.
 */
function drawCourses(ctx: CanvasRenderingContext2D, options: CourseOptions): void {
  const size = WALL_TEXTURE_SIZE
  const rowHeight = size / options.rows
  for (let row = 0; row < options.rows; row++) {
    const blocks = options.blocksForRow(row)
    const blockWidth = size / blocks
    const offset = row % 2 === 0 ? 0 : -blockWidth / 2
    for (let i = -1; i <= blocks; i++) {
      ctx.fillStyle = options.fillStyleAt(row, i)
      roundRectFill(
        ctx,
        offset + i * blockWidth + options.gap / 2,
        row * rowHeight + options.gap / 2,
        blockWidth - options.gap,
        rowHeight - options.gap,
        options.cornerRadius,
      )
    }
  }
}

function drawStone(ctx: CanvasRenderingContext2D, colorA: number, colorB: number): void {
  ctx.fillStyle = darken(colorB, 0.35)
  ctx.fillRect(0, 0, WALL_TEXTURE_SIZE, WALL_TEXTURE_SIZE)

  drawCourses(ctx, {
    rows: 4,
    gap: 6,
    cornerRadius: 10,
    blocksForRow: (row) => (row % 2 === 0 ? 3 : 4),
    fillStyleAt: (row, i) => {
      const shade = (row * 7 + i * 13) % 3
      return shade === 0 ? hexColor(colorA) : shade === 1 ? lighten(colorA, 0.12) : hexColor(colorB)
    },
  })
}

function drawBrick(ctx: CanvasRenderingContext2D, colorA: number, colorB: number): void {
  ctx.fillStyle = darken(colorB, 0.45)
  ctx.fillRect(0, 0, WALL_TEXTURE_SIZE, WALL_TEXTURE_SIZE)

  drawCourses(ctx, {
    rows: 6,
    gap: 5,
    cornerRadius: 4,
    blocksForRow: () => 3,
    fillStyleAt: (row, i) => {
      const shade = (row * 5 + i * 11) % 4
      return shade <= 1 ? hexColor(colorA) : shade === 2 ? hexColor(colorB) : lighten(colorB, 0.1)
    },
  })
}

function drawPanel(ctx: CanvasRenderingContext2D, colorA: number, colorB: number): void {
  const size = WALL_TEXTURE_SIZE
  const gradient = ctx.createLinearGradient(0, 0, 0, size)
  gradient.addColorStop(0, lighten(colorA, 0.15))
  gradient.addColorStop(1, hexColor(colorB))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  ctx.strokeStyle = darken(colorB, 0.4)
  ctx.lineWidth = 4
  for (const y of [size * 0.33, size * 0.66]) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(size, y)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(size * 0.5, size * 0.33)
  ctx.lineTo(size * 0.5, size)
  ctx.stroke()

  ctx.fillStyle = lighten(colorA, 0.5)
  for (const [x, y] of [
    [size * 0.2, size * 0.16],
    [size * 0.8, size * 0.16],
    [size * 0.32, size * 0.5],
    [size * 0.68, size * 0.82],
  ]) {
    ctx.beginPath()
    ctx.arc(x ?? 0, y ?? 0, 7, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Neon: near-black panels separated by glowing seams in colorA, with a few
 * bright circuit nodes in colorB. Pairs with theme.wallEmissiveIntensity so
 * the seams read as light sources.
 */
function drawNeon(ctx: CanvasRenderingContext2D, colorA: number, colorB: number): void {
  const size = WALL_TEXTURE_SIZE
  ctx.fillStyle = darken(colorB, 0.85)
  ctx.fillRect(0, 0, size, size)

  ctx.fillStyle = darken(colorB, 0.7)
  const gap = 8
  for (const [x, y, w, h] of [
    [0, 0, size * 0.6, size * 0.45],
    [size * 0.6, 0, size * 0.4, size * 0.45],
    [0, size * 0.45, size * 0.35, size * 0.55],
    [size * 0.35, size * 0.45, size * 0.65, size * 0.55],
  ] as const) {
    roundRectFill(ctx, x + gap / 2, y + gap / 2, w - gap, h - gap, 6)
  }

  ctx.strokeStyle = hexColor(colorA)
  ctx.lineWidth = 4
  ctx.shadowColor = hexColor(colorA)
  ctx.shadowBlur = 12
  for (const [x1, y1, x2, y2] of [
    [0, size * 0.45, size, size * 0.45],
    [size * 0.6, 0, size * 0.6, size * 0.45],
    [size * 0.35, size * 0.45, size * 0.35, size],
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  ctx.fillStyle = hexColor(colorB)
  ctx.shadowColor = hexColor(colorB)
  ctx.shadowBlur = 14
  for (const [x, y] of [
    [size * 0.6, size * 0.45],
    [size * 0.35, size * 0.45],
    [size * 0.82, size * 0.75],
    [size * 0.15, size * 0.2],
  ] as const) {
    ctx.beginPath()
    ctx.arc(x, y, 6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.shadowBlur = 0
}

/** Ice: big pale slabs with translucent white crack streaks. */
function drawIce(ctx: CanvasRenderingContext2D, colorA: number, colorB: number): void {
  const size = WALL_TEXTURE_SIZE
  ctx.fillStyle = darken(colorB, 0.2)
  ctx.fillRect(0, 0, size, size)

  const gap = 5
  for (const [index, [x, y, w, h]] of (
    [
      [0, 0, size * 0.55, size * 0.5],
      [size * 0.55, 0, size * 0.45, size * 0.5],
      [0, size * 0.5, size * 0.4, size * 0.5],
      [size * 0.4, size * 0.5, size * 0.6, size * 0.5],
    ] as const
  ).entries()) {
    ctx.fillStyle = index % 2 === 0 ? lighten(colorA, 0.2) : hexColor(colorA)
    roundRectFill(ctx, x + gap / 2, y + gap / 2, w - gap, h - gap, 14)
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  for (const [x1, y1, x2, y2] of [
    [size * 0.15, size * 0.1, size * 0.4, size * 0.38],
    [size * 0.7, size * 0.12, size * 0.62, size * 0.4],
    [size * 0.25, size * 0.6, size * 0.5, size * 0.9],
    [size * 0.75, size * 0.58, size * 0.88, size * 0.85],
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo((x1 + x2) / 2 + 8, (y1 + y2) / 2)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
}

/**
 * Hedge: dense deterministic leaf blobs in two greens over a dark base. Each
 * blob near a border is redrawn at the wrapped offsets so the texture tiles
 * without seams at cell boundaries.
 */
function drawHedge(ctx: CanvasRenderingContext2D, colorA: number, colorB: number): void {
  const size = WALL_TEXTURE_SIZE
  ctx.fillStyle = darken(colorB, 0.55)
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 180; i++) {
    const x = (((i * 97 + 31) % 64) * (size / 64) + ((i * 13) % 7)) % size
    const y = (((i * 57 + 11) % 64) * (size / 64) + ((i * 17) % 7)) % size
    const radius = 6 + ((i * 29) % 8)
    const shade = (i * 7) % 4
    ctx.fillStyle =
      shade === 0 ? hexColor(colorA) : shade === 1 ? lighten(colorA, 0.18) : shade === 2 ? hexColor(colorB) : darken(colorA, 0.2)
    for (const dx of [0, -size, size]) {
      for (const dy of [0, -size, size]) {
        ctx.beginPath()
        ctx.arc(x + dx, y + dy, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}

/** Sandstone: wide weathered courses with a carved glyph band. */
function drawSandstone(ctx: CanvasRenderingContext2D, colorA: number, colorB: number): void {
  const size = WALL_TEXTURE_SIZE
  ctx.fillStyle = darken(colorB, 0.3)
  ctx.fillRect(0, 0, size, size)

  const rowHeight = size / 3
  drawCourses(ctx, {
    rows: 3,
    gap: 5,
    cornerRadius: 8,
    blocksForRow: (row) => (row % 2 === 0 ? 2 : 3),
    fillStyleAt: (row, i) => {
      const shade = (row * 5 + i * 7) % 3
      return shade === 0 ? hexColor(colorA) : shade === 1 ? lighten(colorA, 0.1) : hexColor(colorB)
    },
  })

  ctx.strokeStyle = darken(colorB, 0.5)
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  const bandY = rowHeight * 1.5
  for (let i = 0; i < 6; i++) {
    const x = size * (0.1 + i * 0.15)
    ctx.beginPath()
    if (i % 3 === 0) {
      ctx.arc(x, bandY, 9, 0, Math.PI * 2)
    } else if (i % 3 === 1) {
      ctx.moveTo(x - 8, bandY + 10)
      ctx.lineTo(x, bandY - 10)
      ctx.lineTo(x + 8, bandY + 10)
    } else {
      ctx.moveTo(x, bandY - 10)
      ctx.lineTo(x, bandY + 10)
      ctx.moveTo(x - 7, bandY)
      ctx.lineTo(x + 7, bandY)
    }
    ctx.stroke()
  }
}

export function createFloorTexture(colorA: number, colorB: number, pattern: FloorPattern = 'checker'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = hexColor(colorA)
    ctx.fillRect(0, 0, 128, 128)
    if (pattern === 'grid') {
      ctx.strokeStyle = hexColor(colorB)
      ctx.lineWidth = 5
      ctx.shadowColor = hexColor(colorB)
      ctx.shadowBlur = 10
      ctx.strokeRect(2.5, 2.5, 123, 123)
      ctx.shadowBlur = 0
    } else {
      ctx.fillStyle = hexColor(colorB)
      ctx.fillRect(0, 0, 64, 64)
      ctx.fillRect(64, 64, 64, 64)
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 4
  return texture
}

/**
 * Pod icons, per the original's visual language: green traffic light for
 * speed up, red traffic light for slow down, a spring for jump charges.
 */
export function createPodIconTexture(kind: PodKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    if (kind === 'jump') {
      drawSpringIcon(ctx)
    } else {
      drawTrafficLightIcon(ctx, kind === 'speedUp')
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function drawTrafficLightIcon(ctx: CanvasRenderingContext2D, greenLit: boolean): void {
  ctx.clearRect(0, 0, 128, 128)
  ctx.fillStyle = '#1e293b'
  roundRectFill(ctx, 40, 8, 48, 112, 14)

  const lampY = [32, 64, 96]
  const lampColors = greenLit ? ['#3f1d1d', '#3a2f16', '#22c55e'] : ['#ef4444', '#3a2f16', '#14351f']
  lampY.forEach((y, index) => {
    ctx.fillStyle = lampColors[index] ?? '#000000'
    ctx.beginPath()
    ctx.arc(64, y, 13, 0, Math.PI * 2)
    ctx.fill()
  })

  const litY = greenLit ? 96 : 32
  const glow = ctx.createRadialGradient(64, litY, 4, 64, litY, 26)
  glow.addColorStop(0, greenLit ? 'rgba(74, 222, 128, 0.8)' : 'rgba(248, 113, 113, 0.8)')
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(64, litY, 26, 0, Math.PI * 2)
  ctx.fill()
}

function drawSpringIcon(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, 128, 128)
  ctx.strokeStyle = '#facc15'
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(34, 112)
  for (let i = 0; i < 5; i++) {
    const y = 100 - i * 18
    ctx.lineTo(i % 2 === 0 ? 94 : 34, y)
  }
  ctx.lineTo(64, 14)
  ctx.stroke()

  ctx.strokeStyle = '#fde68a'
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.moveTo(44, 20)
  ctx.lineTo(64, 6)
  ctx.lineTo(84, 20)
  ctx.stroke()
}

function roundRectFill(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
  ctx.fill()
}

function lighten(color: number, amount: number): string {
  const c = new THREE.Color(color)
  c.lerp(new THREE.Color('#ffffff'), amount)
  return `#${c.getHexString()}`
}

function darken(color: number, amount: number): string {
  const c = new THREE.Color(color)
  c.lerp(new THREE.Color('#0b1120'), amount)
  return `#${c.getHexString()}`
}

export function createSkyGradientTexture(topColor: number, bottomColor: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, hexColor(topColor))
    gradient.addColorStop(1, hexColor(bottomColor))
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 16, 256)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
