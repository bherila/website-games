import type { Point3 } from './level'

/**
 * The permanent base each level stands on. Its surfaces are what a released
 * part lands on; water is not ground, so a part that reaches it sinks.
 */
export type StageId = 'garden' | 'jetty' | 'pier' | 'workbench' | 'quay' | 'sea' | 'toy-track' | 'parlour' | 'platform' | 'lineside' | 'railway'
  | 'dresser' | 'lobby' | 'moat' | 'music-room' | 'toyshop'
  | 'fairground' | 'balloon-field' | 'showground' | 'parade' | 'midway'

interface Surface {
  kind: 'ground' | 'water'
  top: number
  /** Centre x, centre z, half-width and half-depth. */
  rect?: readonly [number, number, number, number]
  /** Centre x, centre z and radius. */
  circle?: readonly [number, number, number]
}

export interface Stage {
  surfaces: readonly Surface[]
  /** Where the camera looks, so a low object still fills the view. */
  target: Point3
  /** Camera distance relative to the houses', so a small object is not lost in the frame. */
  distance?: number
}

export const STAGES: Record<StageId, Stage> = {
  // createGarden: the foundation deck under the house, inside a round lawn.
  garden: {
    target: [0, 0.1, 0],
    surfaces: [
      { kind: 'ground', top: -1.55, rect: [0, 0, 1.97, 1.44] },
      { kind: 'ground', top: -1.76, circle: [0, 0, 2.8] },
    ],
  },
  // A boat afloat beside a plank jetty: its bottom boards are the base, the harbor is all round.
  jetty: {
    target: [0, -0.5, 0],
    distance: 0.82,
    surfaces: [
      { kind: 'ground', top: -1.45, rect: [0, 0, 1.75, 1.05] },
      { kind: 'ground', top: -1.62, rect: [0, -2.15, 3.2, 0.55] },
      { kind: 'water', top: -1.86, circle: [0, 0, 4.2] },
    ],
  },
  // A boathouse workbench; anything that slides off lands on the plank floor.
  workbench: {
    target: [0, -0.5, 0],
    distance: 0.85,
    surfaces: [
      { kind: 'ground', top: -1.55, rect: [0, 0, 2.3, 1.45] },
      { kind: 'ground', top: -2.7, circle: [0, 0, 4.2] },
    ],
  },
  // A stone quay with the harbor water beyond its edge, under the crane's jib.
  quay: {
    target: [0, 0.05, 0],
    surfaces: [
      { kind: 'ground', top: -1.55, rect: [-0.6, 0, 2.6, 1.7] },
      { kind: 'water', top: -2.2, circle: [0, 0, 4.4] },
    ],
  },
  // A lightship riding at anchor: its lower hull is the base, open water all round.
  sea: {
    target: [0, -0.25, 0],
    distance: 0.9,
    surfaces: [
      { kind: 'ground', top: -1.45, rect: [0, 0, 1.85, 1.05] },
      { kind: 'water', top: -1.86, circle: [0, 0, 4.4] },
    ],
  },
  // A wooden toy track on a playroom rug: the engine's chassis is the base, the floor is far below.
  'toy-track': {
    target: [0, -0.3, 0],
    surfaces: [
      { kind: 'ground', top: -1.55, rect: [0, 0, 1.25, 1.4] },
      { kind: 'ground', top: -2.5, circle: [0, 0, 4.2] },
    ],
  },
  // A parlour table; anything that slides off lands on the floorboards.
  parlour: {
    target: [0, -0.3, 0],
    surfaces: [
      { kind: 'ground', top: -1.55, rect: [0, 0, 2.1, 1.5] },
      { kind: 'ground', top: -2.7, circle: [0, 0, 4.2] },
    ],
  },
  // A station platform with the clock on a stone plinth, and the track bed below the platform's edge.
  platform: {
    target: [0, 0.2, 0],
    surfaces: [
      { kind: 'ground', top: -0.95, rect: [0, 0, 1.25, 1.05] },
      { kind: 'ground', top: -1.55, rect: [0, 0, 1.9, 1.5] },
      { kind: 'ground', top: -2.4, circle: [0, 0, 4.4] },
    ],
  },
  // A grassy bank beside the line, with the track bed below it; a roof slope that tips off the bank
  // slides on over the bed's edge.
  lineside: {
    target: [0, -0.1, 0],
    surfaces: [
      { kind: 'ground', top: -1.55, rect: [0, 0, 1.65, 1.4] },
      { kind: 'ground', top: -2.4, circle: [0, 0, 3.4] },
    ],
  },
  // An engine and tender on the main line: their chassis are the base, the ballast below.
  railway: {
    target: [0, -0.35, 0],
    distance: 1.05,
    surfaces: [
      { kind: 'ground', top: -1.55, rect: [0.1, 0, 2.6, 1.0] },
      { kind: 'ground', top: -2.4, circle: [0, 0, 4.6] },
    ],
  },
  // A clock on a dresser top; a hanging weight swings clear of the dresser's front, above the floor.
  dresser: {
    target: [0, -0.15, 0],
    distance: 0.92,
    surfaces: [
      { kind: 'ground', top: -1.55, rect: [0, -0.25, 1.5, 1.0] },
      { kind: 'ground', top: -3.4, circle: [0, 0, 4.2] },
    ],
  },
  // A lift on a raised marble landing in a lobby.
  lobby: {
    target: [0, 0.0, 0],
    surfaces: [
      { kind: 'ground', top: -1.55, rect: [0, 0, 1.75, 1.55] },
      { kind: 'ground', top: -2.05, circle: [0, 0, 3.9] },
    ],
  },
  // A gatehouse on a grassy island, with the moat all round it.
  moat: {
    target: [0, -0.35, 0.4],
    surfaces: [
      { kind: 'ground', top: -1.55, rect: [0, 0.75, 1.75, 2.25] },
      { kind: 'water', top: -2.0, circle: [0, 0, 4.4] },
    ],
  },
  // A cabinet gramophone on a round, rug-covered dais in a music room.
  'music-room': {
    target: [0, -0.1, 0],
    surfaces: [
      { kind: 'ground', top: -1.55, circle: [0, 0, 2.0] },
      { kind: 'ground', top: -1.95, circle: [0, 0, 3.9] },
    ],
  },
  // A toy shop counter, with the shop floor well below it.
  toyshop: {
    target: [0, -0.05, 0],
    surfaces: [
      { kind: 'ground', top: -1.55, rect: [0, 0, 1.7, 1.3] },
      { kind: 'ground', top: -2.8, circle: [0, 0, 4.2] },
    ],
  },
  // A carousel's eight-sided deck on a fairground lawn.
  fairground: {
    target: [0, 0.25, 0],
    surfaces: [
      { kind: 'ground', top: -1.4, circle: [0, 0, 1.75] },
      { kind: 'ground', top: -1.8, circle: [0, 0, 3.0] },
    ],
  },
  // A balloon basket on its floor in a launch field, the envelope high overhead.
  'balloon-field': {
    target: [0, 0.55, 0],
    distance: 1.15,
    surfaces: [
      { kind: 'ground', top: -1.5, rect: [0, 0, 1.3, 0.9] },
      { kind: 'ground', top: -1.6, circle: [0, 0, 3.2] },
    ],
  },
  // A puppet theater on its apron in a showground.
  showground: {
    target: [0, 0.3, 0],
    distance: 1.1,
    surfaces: [
      { kind: 'ground', top: -1.5, rect: [0, 0.35, 2.35, 0.95] },
      { kind: 'ground', top: -1.7, circle: [0, 0, 3.0] },
    ],
  },
  // A Ferris wheel at night on a lawn, its frames on a stone plinth.
  midway: {
    target: [0, 0.6, 0],
    distance: 1.1,
    surfaces: [
      { kind: 'ground', top: -1.48, rect: [0, 0, 1.9, 0.6] },
      { kind: 'ground', top: -1.6, circle: [0, 0, 3.0] },
    ],
  },
  // A float on a parade street: its deck under the arches, the road all round.
  parade: {
    target: [0, 0.3, 0],
    surfaces: [
      { kind: 'ground', top: -0.9, rect: [0, 0, 1.28, 1.2] },
      { kind: 'ground', top: -1.6, circle: [0, 0, 3.0] },
    ],
  },
  // A stone pier head with the sea below it on every side.
  pier: {
    target: [0, 0.1, 0],
    surfaces: [
      { kind: 'ground', top: -1.55, circle: [0, 0, 1.75] },
      { kind: 'ground', top: -1.85, circle: [0, 0, 2.5] },
      { kind: 'water', top: -2.3, circle: [0, 0, 4.2] },
    ],
  },
}

const contains = (surface: Surface, x: number, z: number): boolean => surface.rect
  ? Math.abs(x - surface.rect[0]) <= surface.rect[2] && Math.abs(z - surface.rect[1]) <= surface.rect[3]
  : Math.hypot(x - surface.circle![0], z - surface.circle![1]) <= surface.circle![2]

/** The highest surface under a point, if any. */
function surfaceAt(stage: StageId, x: number, z: number): Surface | undefined {
  return STAGES[stage].surfaces.filter((surface) => contains(surface, x, z)).sort((a, b) => b.top - a.top)[0]
}

/** The top of the ground under a point; -Infinity over water or beyond the base. */
export function groundAt(x: number, z: number, stage: StageId = 'garden'): number {
  const surface = surfaceAt(stage, x, z)
  return surface?.kind === 'ground' ? surface.top : -Infinity
}

/** The water level under a point, when the highest surface there is water. */
export function waterAt(x: number, z: number, stage: StageId = 'garden'): number | undefined {
  const surface = surfaceAt(stage, x, z)
  return surface?.kind === 'water' ? surface.top : undefined
}
