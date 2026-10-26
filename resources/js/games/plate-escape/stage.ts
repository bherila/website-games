import type { Point3 } from './level'

/**
 * The permanent base each level stands on. Its surfaces are what a released
 * part lands on; water is not ground, so a part that reaches it sinks.
 */
export type StageId = 'garden' | 'jetty' | 'pier' | 'workbench' | 'quay' | 'sea'

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
