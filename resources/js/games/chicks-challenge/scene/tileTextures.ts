/**
 * Procedural canvas textures for every board TileKind plus the player,
 * monster, and block entities. Flat/toon, saturated fills — every kind gets
 * a distinct silhouette AND a distinct color (see docs/games/chicks-challenge.md,
 * "Scene & rendering") so the board reads for colorblind players.
 *
 * `TILE_DRAWERS` is typed `Record<TileKind, ...>`, so TypeScript itself
 * enforces exhaustiveness over TileKind at compile time; the accompanying
 * test cross-checks it against `levels/legend.ts` at runtime and smoke-tests
 * every drawer against a stub 2D context (no DOM required).
 *
 * No drawer touches `document` directly — only `createCanvasTexture` (in
 * `threeUtils.ts`) does, and only when actually invoked, so importing this
 * module is safe in the DOM-less node Jest project.
 */
import * as THREE from 'three'

import type { MonsterKind, TileKind } from '../engine/types'
import { ENTITY_TEXTURE_SIZE, PALETTE, TILE_TEXTURE_SIZE } from './sceneConstants'
import { createCanvasTexture, hexColor } from './threeUtils'

type Ctx = CanvasRenderingContext2D

function lighten(color: number, amount: number): string {
  const c = new THREE.Color(color)
  c.lerp(new THREE.Color(0xffffff), amount)
  return `#${c.getHexString()}`
}

function darken(color: number, amount: number): string {
  const c = new THREE.Color(color)
  c.lerp(new THREE.Color(0x000000), amount)
  return `#${c.getHexString()}`
}

function fillSquare(ctx: Ctx, size: number, color: number): void {
  ctx.fillStyle = hexColor(color)
  ctx.fillRect(0, 0, size, size)
}

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function fillRoundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string): void {
  ctx.fillStyle = color
  roundRectPath(ctx, x, y, w, h, r)
  ctx.fill()
}

const FLOOR_FLECKS: ReadonlyArray<readonly [number, number, number]> = [
  [0.18, 0.22, 4],
  [0.72, 0.16, 3],
  [0.5, 0.5, 5],
  [0.28, 0.78, 3],
  [0.82, 0.7, 4],
]

function drawFloorBase(ctx: Ctx, size: number): void {
  fillSquare(ctx, size, PALETTE.floorBase)
  ctx.fillStyle = hexColor(PALETTE.floorFleck)
  for (const [fx, fy, fr] of FLOOR_FLECKS) {
    ctx.beginPath()
    ctx.arc(fx * size, fy * size, fr, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawFloor(ctx: Ctx, size: number): void {
  drawFloorBase(ctx, size)
}

function drawWall(ctx: Ctx, size: number): void {
  fillSquare(ctx, size, PALETTE.wallBase)
  const bevel = size * 0.08
  ctx.fillStyle = lighten(PALETTE.wallBase, 0.28)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(size, 0)
  ctx.lineTo(size - bevel, bevel)
  ctx.lineTo(bevel, bevel)
  ctx.lineTo(bevel, size - bevel)
  ctx.lineTo(0, size)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = darken(PALETTE.wallBase, 0.35)
  ctx.beginPath()
  ctx.moveTo(size, 0)
  ctx.lineTo(size, size)
  ctx.lineTo(0, size)
  ctx.lineTo(bevel, size - bevel)
  ctx.lineTo(size - bevel, size - bevel)
  ctx.lineTo(size - bevel, bevel)
  ctx.closePath()
  ctx.fill()

  fillRoundRect(ctx, bevel * 1.4, bevel * 1.4, size - bevel * 2.8, size - bevel * 2.8, size * 0.05, hexColor(PALETTE.wallBase))
}

function drawExit(ctx: Ctx, size: number): void {
  drawFloorBase(ctx, size)
  const cx = size * 0.5
  const cy = size * 0.5
  const glow = ctx.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 0.42)
  glow.addColorStop(0, hexColor(PALETTE.exitCore))
  glow.addColorStop(1, 'rgba(139, 92, 246, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = hexColor(PALETTE.exitRing)
  ctx.lineWidth = size * 0.045
  for (const r of [0.16, 0.28, 0.4]) {
    ctx.beginPath()
    ctx.arc(cx, cy, size * r, 0.3, Math.PI * 1.4)
    ctx.stroke()
  }
}

function drawSocket(ctx: Ctx, size: number): void {
  drawFloorBase(ctx, size)
  const inset = size * 0.16
  fillRoundRect(ctx, inset, inset, size - inset * 2, size - inset * 2, size * 0.08, hexColor(PALETTE.socketRecess))
  fillRoundRect(
    ctx,
    inset + size * 0.03,
    inset + size * 0.03,
    size - inset * 2 - size * 0.06,
    size - inset * 2 - size * 0.06,
    size * 0.06,
    darken(PALETTE.socketRecess, 0.3),
  )
  ctx.fillStyle = hexColor(PALETTE.socketPin)
  for (const [px, py] of [
    [0.26, 0.26],
    [0.74, 0.26],
    [0.26, 0.74],
    [0.74, 0.74],
  ] as const) {
    ctx.beginPath()
    ctx.arc(px * size, py * size, size * 0.035, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawChip(ctx: Ctx, size: number): void {
  drawFloorBase(ctx, size)
  const inset = size * 0.28
  fillRoundRect(ctx, inset, inset, size - inset * 2, size - inset * 2, size * 0.05, hexColor(PALETTE.chipBody))
  ctx.strokeStyle = hexColor(PALETTE.chipPin)
  ctx.lineWidth = size * 0.025
  const pins = 3
  for (let i = 0; i < pins; i += 1) {
    const t = (i + 0.5) / pins
    const y = inset + t * (size - inset * 2)
    ctx.beginPath()
    ctx.moveTo(inset - size * 0.06, y)
    ctx.lineTo(inset, y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(size - inset, y)
    ctx.lineTo(size - inset + size * 0.06, y)
    ctx.stroke()
  }
}

function drawKeyGlyph(ctx: Ctx, size: number, color: number): void {
  drawFloorBase(ctx, size)
  ctx.fillStyle = hexColor(color)
  ctx.strokeStyle = hexColor(color)
  ctx.lineWidth = size * 0.07
  ctx.lineCap = 'round'
  const headX = size * 0.36
  const headY = size * 0.36
  ctx.beginPath()
  ctx.arc(headX, headY, size * 0.14, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(headX + size * 0.1, headY + size * 0.1)
  ctx.lineTo(size * 0.72, size * 0.72)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(size * 0.6, size * 0.6)
  ctx.lineTo(size * 0.68, size * 0.52)
  ctx.moveTo(size * 0.68, size * 0.68)
  ctx.lineTo(size * 0.78, size * 0.6)
  ctx.stroke()
}

function drawDoor(ctx: Ctx, size: number, color: number): void {
  ctx.fillStyle = darken(color, 0.25)
  ctx.fillRect(0, 0, size, size)
  const inset = size * 0.08
  fillRoundRect(ctx, inset, inset, size - inset * 2, size - inset * 2, size * 0.06, hexColor(color))
  ctx.strokeStyle = darken(color, 0.5)
  ctx.lineWidth = size * 0.02
  roundRectPath(ctx, inset, inset, size - inset * 2, size - inset * 2, size * 0.06)
  ctx.stroke()

  ctx.fillStyle = hexColor(PALETTE.doorKeyhole)
  ctx.beginPath()
  ctx.arc(size * 0.5, size * 0.42, size * 0.09, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(size * 0.44, size * 0.48)
  ctx.lineTo(size * 0.56, size * 0.48)
  ctx.lineTo(size * 0.52, size * 0.68)
  ctx.lineTo(size * 0.48, size * 0.68)
  ctx.closePath()
  ctx.fill()
}

function drawWater(ctx: Ctx, size: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, size)
  gradient.addColorStop(0, lighten(PALETTE.waterBase, 0.12))
  gradient.addColorStop(1, darken(PALETTE.waterBase, 0.15))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  ctx.strokeStyle = hexColor(PALETTE.waterRipple)
  ctx.lineWidth = size * 0.025
  ctx.globalAlpha = 0.7
  for (const [cx, cy, r] of [
    [0.3, 0.35, 0.14],
    [0.7, 0.6, 0.16],
    [0.45, 0.78, 0.1],
  ] as const) {
    ctx.beginPath()
    ctx.arc(cx * size, cy * size, r * size, 0, Math.PI * 1.4)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawFire(ctx: Ctx, size: number): void {
  const gradient = ctx.createLinearGradient(0, size, 0, 0)
  gradient.addColorStop(0, hexColor(PALETTE.fireBase))
  gradient.addColorStop(1, darken(PALETTE.fireBase, 0.3))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  ctx.fillStyle = hexColor(PALETTE.fireCore)
  for (const [cx, scale] of [
    [0.32, 1],
    [0.55, 1.3],
    [0.75, 0.8],
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(cx * size, size * 0.9)
    ctx.quadraticCurveTo(cx * size - size * 0.12 * scale, size * 0.5, cx * size, size * 0.15 * scale)
    ctx.quadraticCurveTo(cx * size + size * 0.12 * scale, size * 0.5, cx * size, size * 0.9)
    ctx.fill()
  }
}

function drawDirt(ctx: Ctx, size: number): void {
  fillSquare(ctx, size, PALETTE.dirtBase)
  ctx.fillStyle = hexColor(PALETTE.dirtFleck)
  for (let i = 0; i < 18; i += 1) {
    const x = (((i * 53) % 97) / 97) * size
    const y = (((i * 71 + 13) % 89) / 89) * size
    ctx.beginPath()
    ctx.arc(x, y, size * 0.02 + (i % 3) * size * 0.01, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawFlippers(ctx: Ctx, size: number): void {
  drawFloorBase(ctx, size)
  ctx.fillStyle = hexColor(PALETTE.flippers)
  ctx.beginPath()
  ctx.moveTo(size * 0.5, size * 0.85)
  ctx.quadraticCurveTo(size * 0.2, size * 0.6, size * 0.32, size * 0.2)
  ctx.quadraticCurveTo(size * 0.5, size * 0.35, size * 0.68, size * 0.2)
  ctx.quadraticCurveTo(size * 0.8, size * 0.6, size * 0.5, size * 0.85)
  ctx.fill()
}

function drawFireBoots(ctx: Ctx, size: number): void {
  drawFloorBase(ctx, size)
  fillRoundRect(ctx, size * 0.3, size * 0.2, size * 0.22, size * 0.5, size * 0.06, hexColor(PALETTE.fireBoots))
  fillRoundRect(ctx, size * 0.3, size * 0.62, size * 0.42, size * 0.2, size * 0.06, hexColor(PALETTE.fireBoots))
  ctx.fillStyle = hexColor(PALETTE.fireCore)
  ctx.beginPath()
  ctx.moveTo(size * 0.41, size * 0.18)
  ctx.quadraticCurveTo(size * 0.34, size * 0.05, size * 0.44, size * 0.02)
  ctx.quadraticCurveTo(size * 0.5, size * 0.1, size * 0.44, size * 0.18)
  ctx.fill()
}

function drawSkates(ctx: Ctx, size: number): void {
  drawFloorBase(ctx, size)
  fillRoundRect(ctx, size * 0.3, size * 0.22, size * 0.4, size * 0.36, size * 0.06, hexColor(PALETTE.skates))
  fillRoundRect(ctx, size * 0.24, size * 0.62, size * 0.56, size * 0.08, size * 0.04, hexColor(PALETTE.iceHighlight))
}

function drawSuctionBoots(ctx: Ctx, size: number): void {
  drawFloorBase(ctx, size)
  fillRoundRect(ctx, size * 0.28, size * 0.2, size * 0.24, size * 0.48, size * 0.06, hexColor(PALETTE.suctionBoots))
  fillRoundRect(ctx, size * 0.28, size * 0.62, size * 0.44, size * 0.2, size * 0.05, hexColor(PALETTE.suctionBoots))
  ctx.strokeStyle = darken(PALETTE.suctionBoots, 0.3)
  ctx.lineWidth = size * 0.02
  for (const y of [0.68, 0.75]) {
    ctx.beginPath()
    ctx.moveTo(size * 0.3, size * y)
    ctx.lineTo(size * 0.68, size * y)
    ctx.stroke()
  }
}

function drawIce(ctx: Ctx, size: number): void {
  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, lighten(PALETTE.iceBase, 0.1))
  gradient.addColorStop(1, hexColor(PALETTE.iceBase))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'
  ctx.lineWidth = size * 0.03
  ctx.beginPath()
  ctx.moveTo(size * 0.1, size * 0.75)
  ctx.lineTo(size * 0.6, size * 0.15)
  ctx.stroke()
}

type IceEdge = 'up' | 'down' | 'left' | 'right'

function drawIceWallEdges(ctx: Ctx, size: number, edges: readonly IceEdge[]): void {
  ctx.fillStyle = hexColor(PALETTE.iceWallEdge)
  const t = size * 0.14
  for (const edge of edges) {
    if (edge === 'up') {
      ctx.fillRect(0, 0, size, t)
    } else if (edge === 'down') {
      ctx.fillRect(0, size - t, size, t)
    } else if (edge === 'left') {
      ctx.fillRect(0, 0, t, size)
    } else {
      ctx.fillRect(size - t, 0, t, size)
    }
  }
}

function drawIceCorner(ctx: Ctx, size: number, edges: readonly IceEdge[], curve: readonly [number, number, number, number]): void {
  drawIce(ctx, size)
  drawIceWallEdges(ctx, size, edges)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.lineWidth = size * 0.035
  ctx.beginPath()
  ctx.moveTo(curve[0] * size, curve[1] * size)
  ctx.quadraticCurveTo(size * 0.5, size * 0.5, curve[2] * size, curve[3] * size)
  ctx.stroke()
}

function drawIceNW(ctx: Ctx, size: number): void {
  drawIceCorner(ctx, size, ['up', 'left'], [0.5, 0.16, 0.16, 0.5])
}

function drawIceNE(ctx: Ctx, size: number): void {
  drawIceCorner(ctx, size, ['up', 'right'], [0.5, 0.16, 0.84, 0.5])
}

function drawIceSW(ctx: Ctx, size: number): void {
  drawIceCorner(ctx, size, ['down', 'left'], [0.16, 0.5, 0.5, 0.84])
}

function drawIceSE(ctx: Ctx, size: number): void {
  drawIceCorner(ctx, size, ['down', 'right'], [0.84, 0.5, 0.5, 0.84])
}

function drawForceBase(ctx: Ctx, size: number): void {
  fillSquare(ctx, size, PALETTE.forceBase)
}

function drawChevronsVertical(ctx: Ctx, size: number, pointingDown: boolean): void {
  ctx.strokeStyle = hexColor(PALETTE.forceChevron)
  ctx.lineWidth = size * 0.06
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const cy of [0.28, 0.52, 0.76]) {
    ctx.beginPath()
    const bow = pointingDown ? size * 0.08 : -size * 0.08
    ctx.moveTo(size * 0.28, cy * size - bow)
    ctx.lineTo(size * 0.5, cy * size + bow)
    ctx.lineTo(size * 0.72, cy * size - bow)
    ctx.stroke()
  }
}

function drawChevronsHorizontal(ctx: Ctx, size: number, pointingRight: boolean): void {
  ctx.strokeStyle = hexColor(PALETTE.forceChevron)
  ctx.lineWidth = size * 0.06
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const cx of [0.28, 0.52, 0.76]) {
    ctx.beginPath()
    const bow = pointingRight ? size * 0.08 : -size * 0.08
    ctx.moveTo(cx * size - bow, size * 0.28)
    ctx.lineTo(cx * size + bow, size * 0.5)
    ctx.lineTo(cx * size - bow, size * 0.72)
    ctx.stroke()
  }
}

function drawForceUp(ctx: Ctx, size: number): void {
  drawForceBase(ctx, size)
  drawChevronsVertical(ctx, size, false)
}

function drawForceDown(ctx: Ctx, size: number): void {
  drawForceBase(ctx, size)
  drawChevronsVertical(ctx, size, true)
}

function drawForceLeft(ctx: Ctx, size: number): void {
  drawForceBase(ctx, size)
  drawChevronsHorizontal(ctx, size, false)
}

function drawForceRight(ctx: Ctx, size: number): void {
  drawForceBase(ctx, size)
  drawChevronsHorizontal(ctx, size, true)
}

function drawHint(ctx: Ctx, size: number): void {
  drawFloorBase(ctx, size)
  ctx.fillStyle = hexColor(PALETTE.hintGlyph)
  ctx.font = `bold ${size * 0.6}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('?', size * 0.5, size * 0.55)
}

function drawPopup(ctx: Ctx, size: number): void {
  drawFloorBase(ctx, size)
  ctx.strokeStyle = hexColor(PALETTE.popupDash)
  ctx.lineWidth = size * 0.035
  ctx.setLineDash([size * 0.08, size * 0.06])
  const inset = size * 0.12
  roundRectPath(ctx, inset, inset, size - inset * 2, size - inset * 2, size * 0.06)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawToggleClosed(ctx: Ctx, size: number): void {
  fillSquare(ctx, size, PALETTE.toggleClosed)
  ctx.strokeStyle = darken(PALETTE.toggleClosed, 0.3)
  ctx.lineWidth = size * 0.03
  for (const y of [0.33, 0.66]) {
    ctx.beginPath()
    ctx.moveTo(0, y * size)
    ctx.lineTo(size, y * size)
    ctx.stroke()
  }
}

function drawToggleOpen(ctx: Ctx, size: number): void {
  drawFloorBase(ctx, size)
  ctx.strokeStyle = hexColor(PALETTE.toggleOpen)
  ctx.lineWidth = size * 0.06
  const inset = size * 0.14
  roundRectPath(ctx, inset, inset, size - inset * 2, size - inset * 2, size * 0.08)
  ctx.stroke()
}

function drawButton(ctx: Ctx, size: number, color: number): void {
  drawFloorBase(ctx, size)
  ctx.fillStyle = darken(color, 0.2)
  ctx.beginPath()
  ctx.arc(size * 0.5, size * 0.5, size * 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = hexColor(color)
  ctx.beginPath()
  ctx.arc(size * 0.5, size * 0.5, size * 0.22, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = lighten(color, 0.3)
  ctx.lineWidth = size * 0.02
  ctx.beginPath()
  ctx.arc(size * 0.5, size * 0.5, size * 0.14, 0, Math.PI * 2)
  ctx.stroke()
}

function drawCloneMachine(ctx: Ctx, size: number): void {
  fillSquare(ctx, size, PALETTE.cloneStripeB)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, size, size)
  ctx.clip()
  ctx.strokeStyle = hexColor(PALETTE.cloneStripeA)
  ctx.lineWidth = size * 0.16
  for (let x = -size; x < size * 2; x += size * 0.32) {
    ctx.beginPath()
    ctx.moveTo(x, size * 1.2)
    ctx.lineTo(x + size * 1.2, -size * 0.2)
    ctx.stroke()
  }
  ctx.restore()

  const inset = size * 0.22
  fillRoundRect(ctx, inset, inset, size - inset * 2, size - inset * 2, size * 0.06, hexColor(PALETTE.cloneStripeB))
  ctx.strokeStyle = hexColor(PALETTE.cloneStripeA)
  ctx.lineWidth = size * 0.02
  roundRectPath(ctx, inset, inset, size - inset * 2, size - inset * 2, size * 0.06)
  ctx.stroke()
}

function drawTeleport(ctx: Ctx, size: number): void {
  fillSquare(ctx, size, PALETTE.teleportCore)
  ctx.strokeStyle = hexColor(PALETTE.teleportSwirl)
  ctx.lineWidth = size * 0.035
  ctx.beginPath()
  const turns = 2.4
  const cx = size * 0.5
  const cy = size * 0.5
  for (let t = 0; t <= 1; t += 0.02) {
    const angle = t * Math.PI * 2 * turns
    const radius = t * size * 0.42
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    if (t === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.stroke()
}

function drawThief(ctx: Ctx, size: number): void {
  drawFloorBase(ctx, size)
  fillRoundRect(ctx, size * 0.24, size * 0.18, size * 0.52, size * 0.62, size * 0.22, hexColor(PALETTE.thiefBody))
  ctx.fillStyle = hexColor(PALETTE.thiefEyes)
  ctx.beginPath()
  ctx.arc(size * 0.4, size * 0.44, size * 0.045, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(size * 0.6, size * 0.44, size * 0.045, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Every TileKind maps to a drawer here — the `Record<TileKind, ...>`
 * annotation makes a missing entry a compile error, and
 * `__tests__/tileTextures.test.ts` cross-checks it at runtime against
 * `levels/legend.ts`.
 */
export const TILE_DRAWERS: Record<TileKind, (ctx: Ctx, size: number) => void> = {
  floor: drawFloor,
  wall: drawWall,
  exit: drawExit,
  socket: drawSocket,
  chip: drawChip,
  keyRed: (ctx, size) => drawKeyGlyph(ctx, size, PALETTE.keyRed),
  keyGreen: (ctx, size) => drawKeyGlyph(ctx, size, PALETTE.keyGreen),
  keyBlue: (ctx, size) => drawKeyGlyph(ctx, size, PALETTE.keyBlue),
  keyYellow: (ctx, size) => drawKeyGlyph(ctx, size, PALETTE.keyYellow),
  doorRed: (ctx, size) => drawDoor(ctx, size, PALETTE.doorRed),
  doorGreen: (ctx, size) => drawDoor(ctx, size, PALETTE.doorGreen),
  doorBlue: (ctx, size) => drawDoor(ctx, size, PALETTE.doorBlue),
  doorYellow: (ctx, size) => drawDoor(ctx, size, PALETTE.doorYellow),
  water: drawWater,
  fire: drawFire,
  dirt: drawDirt,
  flippers: drawFlippers,
  fireBoots: drawFireBoots,
  skates: drawSkates,
  suctionBoots: drawSuctionBoots,
  ice: drawIce,
  iceNW: drawIceNW,
  iceNE: drawIceNE,
  iceSW: drawIceSW,
  iceSE: drawIceSE,
  forceUp: drawForceUp,
  forceDown: drawForceDown,
  forceLeft: drawForceLeft,
  forceRight: drawForceRight,
  hint: drawHint,
  popup: drawPopup,
  toggleClosed: drawToggleClosed,
  toggleOpen: drawToggleOpen,
  buttonGreen: (ctx, size) => drawButton(ctx, size, PALETTE.buttonGreen),
  buttonBlue: (ctx, size) => drawButton(ctx, size, PALETTE.buttonBlue),
  buttonRed: (ctx, size) => drawButton(ctx, size, PALETTE.buttonRed),
  cloneMachine: drawCloneMachine,
  teleport: drawTeleport,
  thief: drawThief,
}

export function createTileTexture(kind: TileKind): THREE.CanvasTexture {
  const texture = createCanvasTexture((ctx, size) => TILE_DRAWERS[kind](ctx, size), TILE_TEXTURE_SIZE)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

type TileAnimationKind = 'ripple' | 'flicker' | 'scrollUp' | 'scrollDown' | 'scrollLeft' | 'scrollRight' | 'swirl'

/** Tiles whose material gets a per-frame update in TileMaterialCache.update(). */
const TILE_ANIMATIONS: Partial<Record<TileKind, TileAnimationKind>> = {
  water: 'ripple',
  fire: 'flicker',
  forceUp: 'scrollUp',
  forceDown: 'scrollDown',
  forceLeft: 'scrollLeft',
  forceRight: 'scrollRight',
  teleport: 'swirl',
  cloneMachine: 'scrollLeft',
}

const SCROLL_SPEED = 0.6

function applyTileAnimation(kind: TileKind, material: THREE.MeshBasicMaterial, elapsedSeconds: number): void {
  const animation = TILE_ANIMATIONS[kind]
  const texture = material.map
  if (!animation || !texture) {
    return
  }

  switch (animation) {
    case 'ripple':
      texture.offset.set(Math.sin(elapsedSeconds * 1.3) * 0.035, Math.cos(elapsedSeconds * 1.1) * 0.035)
      break
    case 'flicker': {
      const t = (Math.sin(elapsedSeconds * 9) + 1) / 2
      material.color.setRGB(1, 0.82 + t * 0.18, 0.55 + t * 0.35)
      break
    }
    case 'scrollUp':
      texture.offset.set(0, -((elapsedSeconds * SCROLL_SPEED) % 1))
      break
    case 'scrollDown':
      texture.offset.set(0, (elapsedSeconds * SCROLL_SPEED) % 1)
      break
    case 'scrollLeft':
      texture.offset.set((elapsedSeconds * SCROLL_SPEED) % 1, 0)
      break
    case 'scrollRight':
      texture.offset.set(-((elapsedSeconds * SCROLL_SPEED) % 1), 0)
      break
    case 'swirl':
      texture.center.set(0.5, 0.5)
      texture.rotation = elapsedSeconds * 1.4
      break
  }
}

export interface TileMaterialCache {
  get(kind: TileKind): THREE.MeshBasicMaterial
  /** Advances the handful of animated tile materials — O(animated kinds), not O(board tiles). */
  update(elapsedSeconds: number): void
  dispose(): void
}

export function createTileMaterialCache(): TileMaterialCache {
  const materials = new Map<TileKind, THREE.MeshBasicMaterial>()
  const animated: { kind: TileKind; material: THREE.MeshBasicMaterial }[] = []

  function get(kind: TileKind): THREE.MeshBasicMaterial {
    const existing = materials.get(kind)
    if (existing) {
      return existing
    }

    const material = new THREE.MeshBasicMaterial({ map: createTileTexture(kind) })
    materials.set(kind, material)
    if (TILE_ANIMATIONS[kind]) {
      animated.push({ kind, material })
    }

    return material
  }

  function update(elapsedSeconds: number): void {
    for (const entry of animated) {
      applyTileAnimation(entry.kind, entry.material, elapsedSeconds)
    }
  }

  function dispose(): void {
    for (const material of materials.values()) {
      material.map?.dispose()
      material.dispose()
    }
    materials.clear()
    animated.length = 0
  }

  return { get, update, dispose }
}

// --- Entities: player / monsters / block -----------------------------------

function drawPlayer(ctx: Ctx, size: number): void {
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = hexColor(PALETTE.playerBody)
  ctx.beginPath()
  ctx.arc(size * 0.5, size * 0.52, size * 0.4, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = hexColor(PALETTE.playerCheek)
  ctx.beginPath()
  ctx.arc(size * 0.28, size * 0.6, size * 0.06, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(size * 0.72, size * 0.6, size * 0.06, 0, Math.PI * 2)
  ctx.fill()

  // Facing wedge points toward local "forward" (texture-space up); entitySprites
  // rotates the sprite mesh per the entity's current facing.
  ctx.fillStyle = hexColor(PALETTE.playerVisor)
  ctx.beginPath()
  ctx.moveTo(size * 0.5, size * 0.14)
  ctx.lineTo(size * 0.66, size * 0.42)
  ctx.lineTo(size * 0.34, size * 0.42)
  ctx.closePath()
  ctx.fill()

  ctx.beginPath()
  ctx.arc(size * 0.4, size * 0.5, size * 0.045, 0, Math.PI * 2)
  ctx.arc(size * 0.6, size * 0.5, size * 0.045, 0, Math.PI * 2)
  ctx.fill()
}

function drawBug(ctx: Ctx, size: number): void {
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = hexColor(PALETTE.monsterBug)
  ctx.beginPath()
  ctx.ellipse(size * 0.5, size * 0.55, size * 0.28, size * 0.34, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = darken(PALETTE.monsterBug, 0.3)
  ctx.lineWidth = size * 0.035
  for (const side of [-1, 1]) {
    for (const t of [0.35, 0.55, 0.75]) {
      ctx.beginPath()
      ctx.moveTo(size * 0.5 + side * size * 0.24, size * t)
      ctx.lineTo(size * 0.5 + side * size * 0.42, size * (t - 0.05))
      ctx.stroke()
    }
  }

  ctx.beginPath()
  ctx.moveTo(size * 0.5, size * 0.22)
  ctx.lineTo(size * 0.5, size * 0.06)
  ctx.stroke()
  ctx.fillStyle = darken(PALETTE.monsterBug, 0.3)
  ctx.beginPath()
  ctx.arc(size * 0.5, size * 0.06, size * 0.03, 0, Math.PI * 2)
  ctx.fill()
}

function drawBall(ctx: Ctx, size: number): void {
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = hexColor(PALETTE.monsterBall)
  ctx.beginPath()
  ctx.arc(size * 0.5, size * 0.5, size * 0.38, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = darken(PALETTE.monsterBall, 0.35)
  ctx.lineWidth = size * 0.05
  ctx.beginPath()
  ctx.arc(size * 0.5, size * 0.5, size * 0.38, -0.4, 0.9)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(size * 0.5, size * 0.5, size * 0.38, Math.PI - 0.4, Math.PI + 0.9)
  ctx.stroke()
}

function drawFireballMonster(ctx: Ctx, size: number): void {
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = hexColor(PALETTE.monsterFireball)
  ctx.beginPath()
  ctx.moveTo(size * 0.5, size * 0.08)
  ctx.quadraticCurveTo(size * 0.85, size * 0.5, size * 0.5, size * 0.92)
  ctx.quadraticCurveTo(size * 0.15, size * 0.5, size * 0.5, size * 0.08)
  ctx.fill()

  ctx.fillStyle = hexColor(PALETTE.fireCore)
  ctx.beginPath()
  ctx.arc(size * 0.5, size * 0.55, size * 0.14, 0, Math.PI * 2)
  ctx.fill()
}

function drawTank(ctx: Ctx, size: number): void {
  ctx.clearRect(0, 0, size, size)
  fillRoundRect(ctx, size * 0.18, size * 0.22, size * 0.64, size * 0.56, size * 0.08, hexColor(PALETTE.monsterTank))
  ctx.fillStyle = darken(PALETTE.monsterTank, 0.3)
  ctx.fillRect(size * 0.44, size * 0.06, size * 0.12, size * 0.3)
}

const MONSTER_DRAWERS: Record<MonsterKind, (ctx: Ctx, size: number) => void> = {
  bug: drawBug,
  ball: drawBall,
  fireball: drawFireballMonster,
  tank: drawTank,
}

function drawBlock(ctx: Ctx, size: number): void {
  ctx.clearRect(0, 0, size, size)
  fillRoundRect(ctx, size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.08, hexColor(PALETTE.block))
  ctx.strokeStyle = darken(PALETTE.block, 0.35)
  ctx.lineWidth = size * 0.03
  ctx.beginPath()
  ctx.moveTo(size * 0.04, size * 0.5)
  ctx.lineTo(size * 0.96, size * 0.5)
  ctx.moveTo(size * 0.5, size * 0.04)
  ctx.lineTo(size * 0.5, size * 0.96)
  ctx.stroke()
}

export function createPlayerTexture(): THREE.CanvasTexture {
  return createCanvasTexture(drawPlayer, ENTITY_TEXTURE_SIZE)
}

export function createMonsterTexture(kind: MonsterKind): THREE.CanvasTexture {
  return createCanvasTexture((ctx, size) => MONSTER_DRAWERS[kind](ctx, size), ENTITY_TEXTURE_SIZE)
}

export function createBlockTexture(): THREE.CanvasTexture {
  return createCanvasTexture(drawBlock, ENTITY_TEXTURE_SIZE)
}

export type EntityVisualKind = 'player' | 'block' | MonsterKind

export interface EntityMaterialCache {
  get(kind: EntityVisualKind): THREE.MeshBasicMaterial
  dispose(): void
}

export function createEntityMaterialCache(): EntityMaterialCache {
  const materials = new Map<EntityVisualKind, THREE.MeshBasicMaterial>()

  function get(kind: EntityVisualKind): THREE.MeshBasicMaterial {
    const existing = materials.get(kind)
    if (existing) {
      return existing
    }

    const texture = kind === 'player' ? createPlayerTexture() : kind === 'block' ? createBlockTexture() : createMonsterTexture(kind)
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true })
    materials.set(kind, material)

    return material
  }

  function dispose(): void {
    for (const material of materials.values()) {
      material.map?.dispose()
      material.dispose()
    }
    materials.clear()
  }

  return { get, dispose }
}
