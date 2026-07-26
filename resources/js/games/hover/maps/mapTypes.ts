/**
 * Map cell legend (one character per cell in MapDefInput.rows):
 *   '.'  floor
 *   '#'  high wall (never passable)
 *   '-'  low wall (passable only while jumping above lowWallHeight; standable)
 *   '='  platform: raised floor at lowWallHeight (climb via ramps or jump)
 *   '<' '>' '^' 'v'  ramp sloping up toward that direction (west/east/north/south)
 *   '8' '6' '2' '4'  directional arrow pad on floor (numpad: north/east/south/west)
 *   'P'  player spawn (floor)
 *   'E'  enemy drone spawn (floor)
 */
export type MapCellChar = '.' | '#' | '-' | '=' | '<' | '>' | '^' | 'v' | '8' | '6' | '2' | '4' | 'P' | 'E'

export type CellKind = 'floor' | 'wallLow' | 'wallHigh' | 'platform' | 'ramp'

/** Compass direction; ramps slope UP toward it, arrow pads push along it. */
export type CompassDir = 'north' | 'east' | 'south' | 'west'

export interface ArrowPad {
  cell: GridPos
  dir: CompassDir
}

export type MapId = 'castle' | 'city' | 'sewer' | 'neon' | 'glacier' | 'garden' | 'temple'

/** Selects the procedural canvas texture generator for wall faces. */
export type WallTextureKind = 'stone' | 'panel' | 'brick' | 'neon' | 'ice' | 'hedge' | 'sandstone'

export type FloorPattern = 'checker' | 'grid'

/** Ambient particle weather rendered by scene/weather.ts (visual only). */
export type WeatherKind = 'snow' | 'rain' | 'sandstorm'

export interface GridPos {
  col: number
  row: number
}

export interface MapTheme {
  name: string
  skyTopColor: number
  skyBottomColor: number
  fogColor: number
  fogDensity: number
  floorColorA: number
  floorColorB: number
  wallColorA: number
  wallColorB: number
  lowWallColor: number
  accentColor: number
  lightColor: number
  ambientIntensity: number
  directionalIntensity: number
  wallTexture: WallTextureKind
  /** Defaults to 'checker'; 'grid' draws glowing cell outlines (neon). */
  floorPattern?: FloorPattern
  /** When set, wall textures also glow with this emissive strength (neon). */
  wallEmissiveIntensity?: number
  /** Ambient particle weather following the player (visual only). */
  weather?: WeatherKind
}

/**
 * Optional per-map feel overrides. Anything unset falls back to the global
 * constants in gameTypes.ts; both crafts (player and drone) are affected
 * equally, so fairness is preserved.
 */
export interface MapPhysicsTweaks {
  /** Replaces LATERAL_GRIP — lower bleeds less sideways velocity (icy drift). */
  lateralGrip?: number
  /** Replaces WALL_RESTITUTION — lower makes walls absorb impacts (soft hedges). */
  wallRestitution?: number
}

export interface MapDefInput {
  id: MapId
  rows: readonly string[]
  theme: MapTheme
  physics?: MapPhysicsTweaks
}

export interface MapDef {
  id: MapId
  /** Rows with 'P'/'E' replaced by '.'; uniform width, sealed '#' border. */
  rows: readonly string[]
  cols: number
  cellSize: number
  lowWallHeight: number
  highWallHeight: number
  playerSpawn: GridPos
  enemySpawn: GridPos
  /** Arrow-pad floor cells ('8642' chars, replaced by '.' in rows). */
  arrowPads: ReadonlyArray<ArrowPad>
  theme: MapTheme
  physics?: MapPhysicsTweaks
}

export const MAP_CELL_SIZE = 6
export const LOW_WALL_HEIGHT = 2.2
export const HIGH_WALL_HEIGHT = 5.5

/**
 * Parses raw ASCII rows into a MapDef, extracting the single 'P'/'E' spawn
 * markers. Throws on malformed maps so bad data fails fast in tests.
 */
export function createMapDef(input: MapDefInput): MapDef {
  const { id, rows, theme, physics } = input
  if (rows.length < 3) {
    throw new Error(`Map ${id}: needs at least 3 rows`)
  }

  const cols = rows[0]?.length ?? 0
  let playerSpawn: GridPos | null = null
  let enemySpawn: GridPos | null = null
  const arrowPads: ArrowPad[] = []
  const cleanRows: string[] = []

  for (const [row, line] of rows.entries()) {
    if (line.length !== cols) {
      throw new Error(`Map ${id}: row ${row} has width ${line.length}, expected ${cols}`)
    }

    let clean = ''
    for (let col = 0; col < cols; col++) {
      const ch = line[col]
      const arrowDir = ARROW_DIR_BY_CHAR[ch ?? '']
      if (ch === 'P') {
        if (playerSpawn) {
          throw new Error(`Map ${id}: multiple player spawns`)
        }
        playerSpawn = { col, row }
        clean += '.'
      } else if (ch === 'E') {
        if (enemySpawn) {
          throw new Error(`Map ${id}: multiple enemy spawns`)
        }
        enemySpawn = { col, row }
        clean += '.'
      } else if (arrowDir) {
        arrowPads.push({ cell: { col, row }, dir: arrowDir })
        clean += '.'
      } else if (ch === '.' || ch === '#' || ch === '-' || ch === '=' || RAMP_DIR_BY_CHAR[ch ?? '']) {
        clean += ch
      } else {
        throw new Error(`Map ${id}: invalid cell '${ch}' at ${col},${row}`)
      }
    }
    cleanRows.push(clean)
  }

  if (!playerSpawn || !enemySpawn) {
    throw new Error(`Map ${id}: missing ${playerSpawn ? 'enemy' : 'player'} spawn`)
  }

  return {
    id,
    rows: cleanRows,
    cols,
    cellSize: MAP_CELL_SIZE,
    lowWallHeight: LOW_WALL_HEIGHT,
    highWallHeight: HIGH_WALL_HEIGHT,
    playerSpawn,
    enemySpawn,
    arrowPads,
    theme,
    ...(physics ? { physics } : {}),
  }
}

const RAMP_DIR_BY_CHAR: Record<string, CompassDir | undefined> = {
  '^': 'north',
  v: 'south',
  '<': 'west',
  '>': 'east',
}

const ARROW_DIR_BY_CHAR: Record<string, CompassDir | undefined> = {
  '8': 'north',
  '6': 'east',
  '2': 'south',
  '4': 'west',
}

/** Unit XZ vector for a compass direction (north = -z, east = +x). */
export function compassVector(dir: CompassDir): { x: number; z: number } {
  switch (dir) {
    case 'north':
      return { x: 0, z: -1 }
    case 'south':
      return { x: 0, z: 1 }
    case 'east':
      return { x: 1, z: 0 }
    case 'west':
      return { x: -1, z: 0 }
  }
}

export function rampDirAt(map: MapDef, col: number, row: number): CompassDir | null {
  return RAMP_DIR_BY_CHAR[map.rows[row]?.[col] ?? ''] ?? null
}

/**
 * Height of the walkable surface at a world position. Floors are 0, platforms
 * and low-wall tops sit at lowWallHeight, ramps interpolate from 0 at their
 * downhill edge to lowWallHeight at the uphill edge. High walls return their
 * full height (they are solid anyway — the value only seals the world).
 */
export function groundHeightAt(map: MapDef, x: number, z: number): number {
  const col = Math.floor(x / map.cellSize)
  const row = Math.floor(z / map.cellSize)
  const kind = cellKindAt(map, col, row)

  if (kind === 'wallHigh') {
    return map.highWallHeight
  }
  if (kind === 'wallLow' || kind === 'platform') {
    return map.lowWallHeight
  }
  if (kind === 'ramp') {
    const dir = rampDirAt(map, col, row)
    const fracX = x / map.cellSize - col
    const fracZ = z / map.cellSize - row
    const uphillFraction =
      dir === 'east' ? fracX : dir === 'west' ? 1 - fracX : dir === 'south' ? fracZ : dir === 'north' ? 1 - fracZ : 0
    return Math.max(0, Math.min(1, uphillFraction)) * map.lowWallHeight
  }
  return 0
}

/** Nominal surface height of a cell for pathfinding (ramps count as mid-slope). */
export function cellSurfaceHeight(map: MapDef, col: number, row: number): number {
  const kind = cellKindAt(map, col, row)
  if (kind === 'wallHigh') {
    return Number.POSITIVE_INFINITY
  }
  if (kind === 'wallLow' || kind === 'platform') {
    return LOW_WALL_HEIGHT
  }
  if (kind === 'ramp') {
    return LOW_WALL_HEIGHT / 2
  }
  return 0
}

/** World-space center of a grid cell: x grows with col, z with row. */
export function cellCenter(map: MapDef, cell: GridPos): { x: number; z: number } {
  return {
    x: (cell.col + 0.5) * map.cellSize,
    z: (cell.row + 0.5) * map.cellSize,
  }
}

export function cellKindAt(map: MapDef, col: number, row: number): CellKind {
  if (row < 0 || row >= map.rows.length || col < 0 || col >= map.cols) {
    return 'wallHigh'
  }

  const ch = map.rows[row]?.[col]
  if (ch === '#') {
    return 'wallHigh'
  }
  if (ch === '-') {
    return 'wallLow'
  }
  if (ch === '=') {
    return 'platform'
  }
  if (ch === '^' || ch === 'v' || ch === '<' || ch === '>') {
    return 'ramp'
  }
  return 'floor'
}
