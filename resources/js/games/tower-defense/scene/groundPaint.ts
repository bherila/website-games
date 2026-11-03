import * as THREE from 'three'

import { COLS, type GameState, ROWS, type Terrain, type ThemeId } from '../gameTypes'
import { cellIndex, inBounds } from '../pathfinding'
import type { Theme } from './themes'

const CELL_PIXELS = 56

function seeded(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

const css = (color: number, alpha = 1): string => `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`

type Painter = (context: CanvasRenderingContext2D, x: number, y: number, random: () => number, theme: Theme) => void

function stroke(context: CanvasRenderingContext2D, color: string, width: number, x: number, y: number, dx: number, dy: number): void {
  context.strokeStyle = color
  context.lineWidth = width
  context.beginPath()
  context.moveTo(x, y)
  context.lineTo(x + dx, y + dy)
  context.stroke()
}

function dot(context: CanvasRenderingContext2D, color: string, x: number, y: number, radius: number): void {
  context.fillStyle = color
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fill()
}

/** A burst of blades seen from above; it has no "up", so it never reads as a pointer on a turned board. */
function tuft(context: CanvasRenderingContext2D, x: number, y: number, random: () => number, color: string, size: number): void {
  context.lineCap = 'round'
  const blades = 6 + Math.floor(random() * 3)
  const start = random() * Math.PI * 2
  for (let blade = 0; blade < blades; blade += 1) {
    const angle = start + ((blade * Math.PI * 2) / blades) + ((random() - 0.5) * 0.5)
    const length = size * (0.6 + (random() * 0.6))
    stroke(context, color, 2, x, y, Math.cos(angle) * length, Math.sin(angle) * length)
  }
}

function flower(context: CanvasRenderingContext2D, x: number, y: number, petals: string): void {
  for (let petal = 0; petal < 5; petal += 1) {
    const angle = (petal * Math.PI * 2) / 5
    dot(context, petals, x + (Math.cos(angle) * 2.6), y + (Math.sin(angle) * 2.6), 2)
  }
  dot(context, '#facc15', x, y, 1.5)
}

/** One bold piece of ground detail for each theme; few and chunky, to match the models. */
const GROUND_DETAIL: Record<ThemeId, Painter> = {
  meadow(context, x, y, random, theme) {
    const roll = random()
    if (roll < 0.72) {
      tuft(context, x, y, random, css(random() < 0.6 ? theme.groundLight : theme.groundDark, 0.8), 5.5)
    } else if (roll < 0.88) {
      flower(context, x, y, random() < 0.8 ? '#ffffff' : '#fbcfe8')
    } else {
      dot(context, css(theme.padDark, 0.8), x, y, 1.6 + (random() * 1.6))
    }
  },
  dunes(context, x, y, random, theme) {
    if (random() < 0.7) {
      context.strokeStyle = css(random() < 0.6 ? theme.groundDark : theme.groundLight, 0.6)
      context.lineWidth = 2
      context.lineCap = 'round'
      context.beginPath()
      context.arc(x, y + 10, 12 + (random() * 9), Math.PI * 1.2, Math.PI * 1.8)
      context.stroke()
    } else {
      dot(context, css(theme.padDark, 0.85), x, y, 1.6 + (random() * 2))
    }
  },
  tundra(context, x, y, random, theme) {
    if (random() < 0.72) {
      context.strokeStyle = css(theme.groundDark, 0.65)
      context.lineWidth = 2
      context.lineCap = 'round'
      context.beginPath()
      context.arc(x, y + 8, 9 + (random() * 8), Math.PI * 1.25, Math.PI * 1.75)
      context.stroke()
    } else {
      tuft(context, x, y, random, css(0x8fa89a, 0.8), 4.5)
    }
  },
  ember(context, x, y, random, theme) {
    if (random() < 0.7) {
      // A branching crack, sometimes with fire showing through.
      const hot = random() < 0.4
      let fromX = x
      let fromY = y
      for (let leg = 0; leg < 3; leg += 1) {
        const dx = (random() - 0.5) * 16
        const dy = (random() - 0.5) * 16
        stroke(context, css(0x1c0f0d, 0.85), 2.6, fromX, fromY, dx, dy)
        if (hot) {
          stroke(context, css(0xff7a1f, 0.95), 1.1, fromX, fromY, dx, dy)
        }
        fromX += dx
        fromY += dy
      }
    } else {
      dot(context, css(theme.groundDark, 0.8), x, y, 1.6 + (random() * 2.4))
    }
  },
  dusk(context, x, y, random, theme) {
    const roll = random()
    if (roll < 0.6) {
      tuft(context, x, y, random, css(theme.groundDark, 0.8), 5)
    } else if (roll < 0.8) {
      dot(context, 'rgba(196,181,253,0.28)', x, y, 5)
      dot(context, '#ddd6fe', x, y, 1.7)
    } else {
      dot(context, css(theme.groundLight, 0.7), x, y, 1.5 + (random() * 2))
    }
  },
}

const SHADED_NEIGHBOURS: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]]

function terrainAt(state: GameState, col: number, row: number): Terrain | null {
  return inBounds(col, row) ? state.terrain[cellIndex(col, row)] ?? null : null
}

function isPaved(terrain: Terrain | null): boolean {
  return terrain === 'pad' || terrain === 'spawn' || terrain === 'exit'
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.arcTo(x + width, y, x + width, y + height, radius)
  context.arcTo(x + width, y + height, x, y + height, radius)
  context.arcTo(x, y + height, x, y, radius)
  context.arcTo(x, y, x + width, y, radius)
  context.closePath()
}

/** Staggered flagstones, so a no-build cell looks built on rather than just a different colour. */
function paintPaving(context: CanvasRenderingContext2D, col: number, row: number, random: () => number, theme: Theme): void {
  const x = col * CELL_PIXELS
  const y = row * CELL_PIXELS
  context.fillStyle = css(theme.padDark)
  context.fillRect(x, y, CELL_PIXELS, CELL_PIXELS)
  const half = CELL_PIXELS / 2
  const third = CELL_PIXELS / 3
  const layouts: readonly (readonly (readonly [number, number, number, number])[])[] = [
    [[0, 0, half, half], [half, 0, half, half], [0, half, CELL_PIXELS, half]],
    [[0, 0, CELL_PIXELS, half], [0, half, half, half], [half, half, half, half]],
    [[0, 0, third * 2, half], [third * 2, 0, third, half], [0, half, third, half], [third, half, third * 2, half]],
  ]
  for (const [stoneX, stoneY, width, height] of layouts[(col + (row * 2)) % layouts.length] ?? []) {
    const left = x + stoneX + 2
    const top = y + stoneY + 2
    context.fillStyle = css(theme.pad)
    roundedRect(context, left, top, width - 4, height - 4, 4)
    context.fill()
    context.fillStyle = `rgba(${random() < 0.5 ? '0,0,0' : '255,255,255'},${random() * 0.08})`
    context.fill()
    context.fillStyle = 'rgba(255,255,255,0.2)'
    roundedRect(context, left + 1, top + 1, width - 6, 3, 1.5)
    context.fill()
  }
}

/** A soft band along one edge of a cell: a shadow beside rock, wet sand beside water. */
function paintEdge(context: CanvasRenderingContext2D, col: number, row: number, dx: number, dy: number, color: number, alpha: number, depth: number): void {
  const x = col * CELL_PIXELS
  const y = row * CELL_PIXELS
  const fromX = dx === 1 ? x + CELL_PIXELS : x
  const fromY = dy === 1 ? y + CELL_PIXELS : y
  const gradient = context.createLinearGradient(fromX, fromY, fromX - (dx * depth), fromY - (dy * depth))
  gradient.addColorStop(0, css(color, alpha))
  gradient.addColorStop(1, css(color, 0))
  context.fillStyle = gradient
  context.fillRect(x, y, CELL_PIXELS, CELL_PIXELS)
}

/** How much of a cell's neighbourhood is water at a pixel, blended the same way the water shader blends it. */
function waterMask(state: GameState, x: number, y: number): number {
  const u = (x / CELL_PIXELS) - 0.5
  const v = (y / CELL_PIXELS) - 0.5
  const col = Math.floor(u)
  const row = Math.floor(v)
  const across = u - col
  const down = v - row
  const at = (c: number, r: number): number => {
    const clampedCol = Math.max(0, Math.min(COLS - 1, c))
    const clampedRow = Math.max(0, Math.min(ROWS - 1, r))

    return state.terrain[cellIndex(clampedCol, clampedRow)] === 'water' ? 1 : 0
  }
  const top = at(col, row) + ((at(col + 1, row) - at(col, row)) * across)
  const bottom = at(col, row + 1) + ((at(col + 1, row + 1) - at(col, row + 1)) * across)

  return top + ((bottom - top) * down)
}

/** Cuts rounded holes for the water and lays a sandy bank around each. */
function carveShores(context: CanvasRenderingContext2D, width: number, height: number, state: GameState, theme: Theme): void {
  if (!state.terrain.includes('water')) {
    return
  }
  const image = context.getImageData(0, 0, width, height)
  const pixels = image.data
  const bankR = (theme.shore >> 16) & 255
  const bankG = (theme.shore >> 8) & 255
  const bankB = theme.shore & 255
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const mask = waterMask(state, x + 0.5, y + 0.5)
      if (mask <= 0.2) {
        continue
      }
      const offset = ((y * width) + x) * 4
      if (mask >= 0.5) {
        pixels[offset + 3] = 0
        continue
      }
      // Sand fades into the grass, and darkens where the water wets it.
      const blend = Math.min(1, (mask - 0.2) / 0.1)
      const wet = mask > 0.44 ? 0.8 : 1
      pixels[offset] = ((pixels[offset] ?? 0) * (1 - blend)) + (bankR * blend * wet)
      pixels[offset + 1] = ((pixels[offset + 1] ?? 0) * (1 - blend)) + (bankG * blend * wet)
      pixels[offset + 2] = ((pixels[offset + 2] ?? 0) * (1 - blend)) + (bankB * blend * wet)
    }
  }
  context.putImageData(image, 0, 0)
}

/**
 * Paints the whole board once into a single texture, so all this detail costs one draw call.
 * Water cells are left transparent: the animated water below shows through the holes.
 */
export function paintBoard(state: GameState, theme: Theme): THREE.Texture | null {
  const canvas = document.createElement('canvas')
  canvas.width = COLS * CELL_PIXELS
  canvas.height = ROWS * CELL_PIXELS
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  const random = seeded(state.level.id * 7919)
  const detail = GROUND_DETAIL[state.level.theme]

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      // Clear tiles with a bevel of light, each a touch different from its neighbours.
      const x = col * CELL_PIXELS
      const y = row * CELL_PIXELS
      context.fillStyle = css((col + row) % 2 === 0 ? theme.groundA : theme.groundB)
      context.fillRect(x, y, CELL_PIXELS, CELL_PIXELS)
      context.fillStyle = `rgba(${random() < 0.5 ? '0,0,0' : '255,255,255'},${random() * 0.045})`
      context.fillRect(x, y, CELL_PIXELS, CELL_PIXELS)
      context.fillStyle = 'rgba(255,255,255,0.09)'
      context.fillRect(x, y, CELL_PIXELS, 2)
      context.fillRect(x, y, 2, CELL_PIXELS)
      context.fillStyle = 'rgba(0,0,0,0.07)'
      context.fillRect(x, y + CELL_PIXELS - 2, CELL_PIXELS, 2)
      context.fillRect(x + CELL_PIXELS - 2, y, 2, CELL_PIXELS)
    }
  }
  // Big soft patches break up the checkerboard, so the land reads as land and not as a table.
  for (let patch = 0; patch < 34; patch += 1) {
    const x = random() * canvas.width
    const y = random() * canvas.height
    const radius = CELL_PIXELS * (0.7 + (random() * 2.2))
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    const color = random() < 0.55 ? theme.groundDark : theme.groundLight
    gradient.addColorStop(0, css(color, 0.14))
    gradient.addColorStop(1, css(color, 0))
    context.fillStyle = gradient
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }
  for (let scrap = 0; scrap < COLS * ROWS * 0.5; scrap += 1) {
    detail(context, random() * canvas.width, random() * canvas.height, random, theme)
  }

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const terrain = terrainAt(state, col, row)
      if (isPaved(terrain)) {
        paintPaving(context, col, row, random, theme)
      }
    }
  }
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const terrain = terrainAt(state, col, row)
      if (terrain === 'water') {
        continue
      }
      for (const [dx, dy] of SHADED_NEIGHBOURS) {
        const neighbour = terrainAt(state, col + dx, row + dy)
        if (neighbour === 'rock') {
          paintEdge(context, col, row, dx, dy, 0x000000, 0.2, CELL_PIXELS * 0.3)
        }
      }
      if (terrain === 'rock') {
        const centerX = (col + 0.5) * CELL_PIXELS
        const centerY = (row + 0.5) * CELL_PIXELS
        const gradient = context.createRadialGradient(centerX, centerY, CELL_PIXELS * 0.1, centerX, centerY, CELL_PIXELS * 0.75)
        gradient.addColorStop(0, 'rgba(0,0,0,0.42)')
        gradient.addColorStop(1, 'rgba(0,0,0,0)')
        context.fillStyle = gradient
        context.fillRect(col * CELL_PIXELS, row * CELL_PIXELS, CELL_PIXELS, CELL_PIXELS)
      }
    }
  }
  // Scorched earth around each gateway.
  for (const { col, row } of state.spawns) {
    const centerX = (col + 0.5) * CELL_PIXELS
    const centerY = (row + 0.5) * CELL_PIXELS
    const gradient = context.createRadialGradient(centerX, centerY, CELL_PIXELS * 0.3, centerX, centerY, CELL_PIXELS * 1.5)
    gradient.addColorStop(0, 'rgba(30,16,51,0.6)')
    gradient.addColorStop(1, 'rgba(30,16,51,0)')
    context.fillStyle = gradient
    context.fillRect(centerX - (CELL_PIXELS * 1.5), centerY - (CELL_PIXELS * 1.5), CELL_PIXELS * 3, CELL_PIXELS * 3)
  }

  // Late-afternoon light falls across the whole board from one corner.
  const light = context.createLinearGradient(0, 0, canvas.width, canvas.height)
  light.addColorStop(0, 'rgba(255,240,170,0.14)')
  light.addColorStop(0.55, 'rgba(255,240,170,0)')
  light.addColorStop(1, 'rgba(20,20,60,0.1)')
  context.fillStyle = light
  context.fillRect(0, 0, canvas.width, canvas.height)

  carveShores(context, canvas.width, canvas.height, state, theme)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4

  return texture
}

/** The land beyond the board, tiled from a small patchy swatch. */
export function paintSurroundings(theme: Theme): THREE.Texture | null {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  const random = seeded(4242)
  context.fillStyle = css(theme.rim)
  context.fillRect(0, 0, size, size)
  for (let patch = 0; patch < 60; patch += 1) {
    const x = random() * size
    const y = random() * size
    const radius = 12 + (random() * 40)
    const color = random() < 0.5 ? 0x000000 : 0xffffff
    // Each patch is drawn at the wrapped positions too, so the swatch tiles without a seam.
    for (const offsetX of [-size, 0, size]) {
      for (const offsetY of [-size, 0, size]) {
        const gradient = context.createRadialGradient(x + offsetX, y + offsetY, 0, x + offsetX, y + offsetY, radius)
        gradient.addColorStop(0, css(color, 0.08))
        gradient.addColorStop(1, css(color, 0))
        context.fillStyle = gradient
        context.fillRect(x + offsetX - radius, y + offsetY - radius, radius * 2, radius * 2)
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping

  return texture
}
