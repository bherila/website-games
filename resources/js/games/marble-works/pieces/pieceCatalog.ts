/**
 * Marble Works piece catalog — pure data shared by the physics builder, the mesh
 * builder and the tray icons, so what the player sees is exactly what the marble hits.
 *
 * Local piece coordinates: origin at the footprint's bottom-left corner, +x right,
 * +y up, one unit per grid cell. A wall is a polyline describing a *surface*; the
 * solid material sits on the right-hand side of the direction of travel (a floor is
 * written left → right, a ceiling right → left).
 */

export type Vec2 = readonly [number, number]

/** Height of a rolling surface above the bottom of its cell. Rows connect at this height. */
export const SURFACE = 0.12
/** Default wall thickness (world units). Kept ≥ half the marble radius to resist tunneling. */
export const WALL_THICKNESS = 0.1
/** Inner gap of a tube channel. */
export const TUBE_GAP = 0.56
/** Tube side walls for a vertical drop tube (centred channel). */
export const TUBE_LEFT_X = 0.5 - TUBE_GAP / 2
export const TUBE_RIGHT_X = 0.5 + TUBE_GAP / 2

export type PieceFamily = 'track' | 'ramp' | 'turn' | 'tube' | 'jump' | 'bouncer'
export type SurfaceMaterial = 'track' | 'tube' | 'rubber' | 'spring' | 'obstacle' | 'basket'

export type PieceBehavior =
  | { kind: 'launcher'; angleDeg: number; speed: number }
  | { kind: 'trampoline'; keep: number; boost: number }

export interface WallDef {
  points: readonly Vec2[]
  thickness?: number
  material?: SurfaceMaterial
}

export interface PieceVariant {
  /** Footprint width in cells. */
  w: number
  /** Footprint height in cells. */
  h: number
  walls: readonly WallDef[]
}

export type PieceId =
  | 'track-short'
  | 'track-long'
  | 'ramp-steep'
  | 'ramp-gentle'
  | 'curve'
  | 'uturn'
  | 'tube'
  | 'tube-elbow'
  | 'funnel'
  | 'kicker'
  | 'launcher'
  | 'bumper'
  | 'trampoline'

export interface PieceDef {
  id: PieceId
  family: PieceFamily
  name: string
  material: SurfaceMaterial
  /** Rotate cycles through these in order. */
  variants: readonly PieceVariant[]
  /** Whether Flip (horizontal mirror) changes the piece. */
  flippable: boolean
  behavior?: PieceBehavior
}

/** Points along an elliptical arc from angle `fromDeg` to `toDeg` (inclusive). */
export function arcPoints(cx: number, cy: number, rx: number, ry: number, fromDeg: number, toDeg: number, segments = 8): Vec2[] {
  const points: Vec2[] = []
  for (let i = 0; i <= segments; i += 1) {
    const angle = ((fromDeg + ((toDeg - fromDeg) * i) / segments) * Math.PI) / 180
    points.push([round(cx + (rx * Math.cos(angle))), round(cy + (ry * Math.sin(angle)))])
  }

  return points
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

const CURVE_RADIUS = 1 - SURFACE
const UTURN_RADIUS = 1 - SURFACE
const KICKER_LIP_DEG = 38
const KICKER_RADIUS = 1 / Math.sin((KICKER_LIP_DEG * Math.PI) / 180)
const TUBE_CEILING = SURFACE + TUBE_GAP

export const LAUNCHER_ANGLE_DEG = 62
export const LAUNCHER_SPEED = 7

export const PIECES: Readonly<Record<PieceId, PieceDef>> = {
  'track-short': {
    id: 'track-short',
    family: 'track',
    name: 'Track',
    material: 'track',
    flippable: false,
    variants: [{ w: 1, h: 1, walls: [{ points: [[0, SURFACE], [1, SURFACE]] }] }],
  },
  'track-long': {
    id: 'track-long',
    family: 'track',
    name: 'Long Track',
    material: 'track',
    flippable: false,
    variants: [{ w: 2, h: 1, walls: [{ points: [[0, SURFACE], [2, SURFACE]] }] }],
  },
  'ramp-steep': {
    id: 'ramp-steep',
    family: 'ramp',
    name: 'Steep Ramp',
    material: 'track',
    flippable: true,
    // Enters at the surface height of the row above, leaves at this row's surface.
    variants: [{ w: 1, h: 1, walls: [{ points: [[0, 1 + SURFACE], [1, SURFACE]] }] }],
  },
  'ramp-gentle': {
    id: 'ramp-gentle',
    family: 'ramp',
    name: 'Gentle Ramp',
    material: 'track',
    flippable: true,
    variants: [{ w: 2, h: 1, walls: [{ points: [[0, 1 + SURFACE], [2, SURFACE]] }] }],
  },
  curve: {
    id: 'curve',
    family: 'turn',
    name: 'Curve',
    material: 'track',
    flippable: true,
    variants: [
      // Catches a drop near the left of the cell and rolls it out to the right.
      { w: 1, h: 1, walls: [{ points: arcPoints(1, 1, CURVE_RADIUS, CURVE_RADIUS, 180, 270) }] },
      // Quarter-pipe: a marble rolling in from the left climbs, stalls and rolls back.
      { w: 1, h: 1, walls: [{ points: arcPoints(0, 1, CURVE_RADIUS, CURVE_RADIUS, 270, 360) }] },
    ],
  },
  uturn: {
    id: 'uturn',
    family: 'turn',
    name: 'U-Turn',
    material: 'tube',
    flippable: true,
    // Rolling right into the top half, the marble swings round and leaves left one row lower.
    variants: [{ w: 1, h: 2, walls: [{ points: arcPoints(0, 1, UTURN_RADIUS, UTURN_RADIUS, -90, 90, 12) }] }],
  },
  tube: {
    id: 'tube',
    family: 'tube',
    name: 'Tube',
    material: 'tube',
    flippable: false,
    variants: [
      {
        w: 1,
        h: 1,
        walls: [
          { points: [[TUBE_LEFT_X, 1], [TUBE_LEFT_X, 0]] },
          { points: [[TUBE_RIGHT_X, 0], [TUBE_RIGHT_X, 1]] },
        ],
      },
      {
        w: 1,
        h: 1,
        walls: [
          { points: [[0, SURFACE], [1, SURFACE]] },
          { points: [[1, TUBE_CEILING], [0, TUBE_CEILING]] },
        ],
      },
    ],
  },
  'tube-elbow': {
    id: 'tube-elbow',
    family: 'tube',
    name: 'Elbow Tube',
    material: 'tube',
    flippable: true,
    variants: [
      // Drop in from the top, leave rolling right along the row's surface.
      {
        w: 1,
        h: 1,
        walls: [
          { points: arcPoints(1, 1, 1 - TUBE_LEFT_X, 1 - SURFACE, 180, 270) },
          { points: arcPoints(1, 1, 1 - TUBE_RIGHT_X, 1 - TUBE_CEILING, 270, 180, 4) },
        ],
      },
      // Roll in from the left, leave dropping out of the bottom.
      {
        w: 1,
        h: 1,
        walls: [
          { points: arcPoints(0, 0, TUBE_RIGHT_X, TUBE_CEILING, 0, 90) },
          { points: arcPoints(0, 0, TUBE_LEFT_X, SURFACE, 90, 0, 4) },
        ],
      },
    ],
  },
  funnel: {
    id: 'funnel',
    family: 'tube',
    name: 'Funnel',
    material: 'tube',
    flippable: false,
    variants: [
      {
        w: 3,
        h: 1,
        walls: [
          { points: [[0, 1], [1 + TUBE_LEFT_X, SURFACE + 0.1], [1 + TUBE_LEFT_X, 0]] },
          { points: [[1 + TUBE_RIGHT_X, 0], [1 + TUBE_RIGHT_X, SURFACE + 0.1], [3, 1]] },
        ],
      },
    ],
  },
  kicker: {
    id: 'kicker',
    family: 'jump',
    name: 'Jump',
    material: 'track',
    flippable: true,
    variants: [
      {
        w: 1,
        h: 1,
        walls: [{ points: arcPoints(0, SURFACE + KICKER_RADIUS, KICKER_RADIUS, KICKER_RADIUS, -90, -90 + KICKER_LIP_DEG, 6) }],
      },
    ],
  },
  launcher: {
    id: 'launcher',
    family: 'jump',
    name: 'Launcher',
    material: 'spring',
    flippable: true,
    behavior: { kind: 'launcher', angleDeg: LAUNCHER_ANGLE_DEG, speed: LAUNCHER_SPEED },
    variants: [{ w: 1, h: 1, walls: [{ points: [[0, SURFACE], [1, SURFACE]], thickness: 0.12 }] }],
  },
  bumper: {
    id: 'bumper',
    family: 'bouncer',
    name: 'Bumper',
    material: 'rubber',
    flippable: true,
    variants: [
      { w: 1, h: 1, walls: [{ points: [[0.08, 0.92], [0.92, 0.08]], thickness: 0.16 }] },
      { w: 1, h: 1, walls: [{ points: [[0.5, 0.06], [0.5, 0.94]], thickness: 0.16 }] },
    ],
  },
  trampoline: {
    id: 'trampoline',
    family: 'bouncer',
    name: 'Trampoline',
    material: 'spring',
    flippable: false,
    behavior: { kind: 'trampoline', keep: 0.9, boost: 1.2 },
    variants: [{ w: 1, h: 1, walls: [{ points: [[0.04, SURFACE + 0.1], [0.96, SURFACE + 0.1]], thickness: 0.12 }] }],
  },
}

export const PIECE_IDS = Object.keys(PIECES) as PieceId[]

/** Tray / docs ordering by family. */
export const FAMILY_ORDER: readonly PieceFamily[] = ['track', 'ramp', 'turn', 'tube', 'jump', 'bouncer']

export const FAMILY_LABELS: Readonly<Record<PieceFamily, string>> = {
  track: 'Track',
  ramp: 'Ramps',
  turn: 'Turns',
  tube: 'Tubes',
  jump: 'Jumps',
  bouncer: 'Bouncers',
}

export function pieceVariant(pieceId: PieceId, variant: number): PieceVariant {
  const variants = PIECES[pieceId].variants
  const resolved = variants[((variant % variants.length) + variants.length) % variants.length]
  if (!resolved) {
    throw new Error(`Piece ${pieceId} has no variants.`)
  }

  return resolved
}
