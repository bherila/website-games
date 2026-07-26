import { type EngineState, headingForward } from '../gameTypes'
import { cellCenter, cellKindAt, compassVector } from '../maps/mapTypes'

export const MINIMAP_COLORS = {
  background: 'rgba(10, 15, 25, 0.78)',
  flagBlue: '#3b82f6',
  flagRed: '#ef4444',
  podSpeedUp: '#22c55e',
  podSlowDown: '#f87171',
  podJump: '#facc15',
  drone: '#f97316',
  droneStroke: '#ffffff',
  player: '#ffffff',
  trap: '#e11d2e',
  arrowPad: '#ffe12e',
} as const

const WALL_ALPHA = 0.85
const PLATFORM_TINT_AMOUNT = 0.35
const RAMP_TINT_AMOUNT = 0.6
const FLAG_RADIUS_PX = 3
const POD_SIZE_PX = 5
const DRONE_RADIUS_PX = 3.5
const PLAYER_TIP_LEN_PX = 6
const PLAYER_BACK_LEN_PX = 4
const PLAYER_BACK_ANGLE_RAD = (120 * Math.PI) / 180
const TRAP_SIZE_FRACTION = 0.6
const ARROW_TIP_LEN_FRACTION = 0.55
const ARROW_BACK_LEN_FRACTION = 0.4
const ARROW_BACK_ANGLE_RAD = (130 * Math.PI) / 180

/** Converts a numeric three.js-style color (e.g. 0x1a2b3c) to a css hex string. */
function hexColor(n: number): string {
  return `#${Math.max(0, Math.min(0xffffff, Math.floor(n))).toString(16).padStart(6, '0')}`
}

/** Lightens a numeric three.js-style color toward white by `amount` (0..1). */
function lightenColor(n: number, amount: number): string {
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  const mix = (channel: number): number => Math.round(channel + (255 - channel) * amount)
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, '0')}`
}

/**
 * Draws a north-up top-down minimap of the current engine state onto ctx.
 * Pure canvas drawing — no three.js, no React. Caller owns DPR scaling and
 * canvas sizing; widthPx/heightPx are device pixels.
 */
export function drawMinimap(ctx: CanvasRenderingContext2D, state: EngineState, widthPx: number, heightPx: number): void {
  if (widthPx <= 0 || heightPx <= 0) {
    return
  }

  ctx.clearRect(0, 0, widthPx, heightPx)
  ctx.fillStyle = MINIMAP_COLORS.background
  ctx.fillRect(0, 0, widthPx, heightPx)

  const { map } = state
  const mazeWidth = map.cols * map.cellSize
  const mazeHeight = map.rows.length * map.cellSize
  const scale = Math.min(widthPx / mazeWidth, heightPx / mazeHeight)
  const offsetX = (widthPx - mazeWidth * scale) / 2
  const offsetY = (heightPx - mazeHeight * scale) / 2

  const toCanvas = (worldX: number, worldZ: number): { x: number; y: number } => ({
    x: offsetX + worldX * scale,
    y: offsetY + worldZ * scale,
  })

  const cellPx = map.cellSize * scale

  drawWalls(ctx, state, scale, offsetX, offsetY, widthPx, heightPx)
  drawTraps(ctx, state, cellPx, toCanvas)
  drawArrowPads(ctx, state, cellPx, toCanvas)
  drawFlags(ctx, state, toCanvas)
  drawPods(ctx, state, toCanvas)
  drawDrone(ctx, state, toCanvas)
  drawPlayer(ctx, state, toCanvas)
}

interface WallLayer {
  canvas: HTMLCanvasElement
  width: number
  height: number
  pixelScale: number
}

/** Walls never change within a round, so the grid is rasterized once per map+size. */
const wallLayerCache = new WeakMap<EngineState['map'], WallLayer>()

function drawWalls(
  ctx: CanvasRenderingContext2D,
  state: EngineState,
  scale: number,
  offsetX: number,
  offsetY: number,
  widthPx: number,
  heightPx: number,
): void {
  const { map } = state
  const pixelScale = typeof ctx.getTransform === 'function' ? ctx.getTransform().a || 1 : 1

  const cached = wallLayerCache.get(map)
  if (cached && cached.width === widthPx && cached.height === heightPx && cached.pixelScale === pixelScale) {
    ctx.drawImage(cached.canvas, 0, 0, widthPx, heightPx)
    return
  }

  if (typeof document !== 'undefined') {
    const offscreen = document.createElement('canvas')
    offscreen.width = Math.max(1, Math.round(widthPx * pixelScale))
    offscreen.height = Math.max(1, Math.round(heightPx * pixelScale))
    const offCtx = offscreen.getContext('2d')
    if (offCtx) {
      offCtx.scale(pixelScale, pixelScale)
      paintWallCells(offCtx, state, scale, offsetX, offsetY)
      wallLayerCache.set(map, { canvas: offscreen, width: widthPx, height: heightPx, pixelScale })
      ctx.drawImage(offscreen, 0, 0, widthPx, heightPx)
      return
    }
  }

  paintWallCells(ctx, state, scale, offsetX, offsetY)
}

function paintWallCells(
  ctx: CanvasRenderingContext2D,
  state: EngineState,
  scale: number,
  offsetX: number,
  offsetY: number,
): void {
  const { map } = state
  const highColor = hexColor(map.theme.wallColorA)
  const lowColor = hexColor(map.theme.lowWallColor)
  const platformColor = lightenColor(map.theme.wallColorA, PLATFORM_TINT_AMOUNT)
  const rampColor = lightenColor(map.theme.wallColorA, RAMP_TINT_AMOUNT)
  const cellPx = map.cellSize * scale

  const priorAlpha = ctx.globalAlpha
  ctx.globalAlpha = WALL_ALPHA
  for (let row = 0; row < map.rows.length; row++) {
    for (let col = 0; col < map.cols; col++) {
      const kind = cellKindAt(map, col, row)
      if (kind === 'floor') {
        continue
      }

      ctx.fillStyle = kind === 'wallHigh' ? highColor : kind === 'wallLow' ? lowColor : kind === 'platform' ? platformColor : rampColor
      ctx.fillRect(offsetX + col * cellPx, offsetY + row * cellPx, cellPx, cellPx)
    }
  }
  ctx.globalAlpha = priorAlpha
}

function drawTraps(
  ctx: CanvasRenderingContext2D,
  state: EngineState,
  cellPx: number,
  toCanvas: (worldX: number, worldZ: number) => { x: number; y: number },
): void {
  const size = cellPx * TRAP_SIZE_FRACTION
  ctx.fillStyle = MINIMAP_COLORS.trap
  for (const trap of state.traps) {
    const { x, y } = toCanvas(trap.pos.x, trap.pos.z)
    ctx.fillRect(x - size / 2, y - size / 2, size, size)
  }
}

function drawArrowPads(
  ctx: CanvasRenderingContext2D,
  state: EngineState,
  cellPx: number,
  toCanvas: (worldX: number, worldZ: number) => { x: number; y: number },
): void {
  ctx.fillStyle = MINIMAP_COLORS.arrowPad
  for (const pad of state.map.arrowPads) {
    const center = cellCenter(state.map, pad.cell)
    const { x, y } = toCanvas(center.x, center.z)
    const forward = compassVector(pad.dir)

    const tip = { x: x + forward.x * cellPx * ARROW_TIP_LEN_FRACTION, y: y + forward.z * cellPx * ARROW_TIP_LEN_FRACTION }
    const backLeft = rotatedCorner(forward, x, y, ARROW_BACK_ANGLE_RAD, cellPx * ARROW_BACK_LEN_FRACTION)
    const backRight = rotatedCorner(forward, x, y, -ARROW_BACK_ANGLE_RAD, cellPx * ARROW_BACK_LEN_FRACTION)

    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(backLeft.x, backLeft.y)
    ctx.lineTo(backRight.x, backRight.y)
    ctx.closePath()
    ctx.fill()
  }
}

function drawFlags(
  ctx: CanvasRenderingContext2D,
  state: EngineState,
  toCanvas: (worldX: number, worldZ: number) => { x: number; y: number },
): void {
  for (const flag of state.flags) {
    if (flag.collected) {
      continue
    }

    const { x, y } = toCanvas(flag.pos.x, flag.pos.z)
    ctx.fillStyle = flag.team === 'blue' ? MINIMAP_COLORS.flagBlue : MINIMAP_COLORS.flagRed
    ctx.beginPath()
    ctx.arc(x, y, FLAG_RADIUS_PX, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawPods(
  ctx: CanvasRenderingContext2D,
  state: EngineState,
  toCanvas: (worldX: number, worldZ: number) => { x: number; y: number },
): void {
  for (const pod of state.pods) {
    if (!pod.active) {
      continue
    }

    const { x, y } = toCanvas(pod.pos.x, pod.pos.z)
    ctx.fillStyle =
      pod.kind === 'speedUp' ? MINIMAP_COLORS.podSpeedUp : pod.kind === 'slowDown' ? MINIMAP_COLORS.podSlowDown : MINIMAP_COLORS.podJump
    ctx.fillRect(x - POD_SIZE_PX / 2, y - POD_SIZE_PX / 2, POD_SIZE_PX, POD_SIZE_PX)
  }
}

function drawDrone(
  ctx: CanvasRenderingContext2D,
  state: EngineState,
  toCanvas: (worldX: number, worldZ: number) => { x: number; y: number },
): void {
  const { x, y } = toCanvas(state.drone.pos.x, state.drone.pos.z)
  ctx.fillStyle = MINIMAP_COLORS.drone
  ctx.strokeStyle = MINIMAP_COLORS.droneStroke
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(x, y, DRONE_RADIUS_PX, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  state: EngineState,
  toCanvas: (worldX: number, worldZ: number) => { x: number; y: number },
): void {
  const { x, y } = toCanvas(state.player.pos.x, state.player.pos.z)
  const forward = headingForward(state.player.heading)

  const tip = { x: x + forward.x * PLAYER_TIP_LEN_PX, y: y + forward.z * PLAYER_TIP_LEN_PX }
  const backLeft = rotatedCorner(forward, x, y, PLAYER_BACK_ANGLE_RAD, PLAYER_BACK_LEN_PX)
  const backRight = rotatedCorner(forward, x, y, -PLAYER_BACK_ANGLE_RAD, PLAYER_BACK_LEN_PX)

  ctx.fillStyle = MINIMAP_COLORS.player
  ctx.beginPath()
  ctx.moveTo(tip.x, tip.y)
  ctx.lineTo(backLeft.x, backLeft.y)
  ctx.lineTo(backRight.x, backRight.y)
  ctx.closePath()
  ctx.fill()
}

function rotatedCorner(
  forward: { x: number; z: number },
  x: number,
  y: number,
  angleRad: number,
  lengthPx: number,
): { x: number; y: number } {
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  const dx = forward.x * cos - forward.z * sin
  const dz = forward.x * sin + forward.z * cos

  return { x: x + dx * lengthPx, y: y + dz * lengthPx }
}
