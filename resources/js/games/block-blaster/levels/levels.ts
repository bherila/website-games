import type { LevelDef } from './levelTypes'

/**
 * The 25 Block Blaster levels, authored per docs/games/block-blaster.md ("The 25 levels").
 * Coordinates are the level author's own; budgets/thresholds/platform shapes/rotation/teaching
 * intent follow the spec table. Every level is checked by `__tests__/levels.test.ts` (placement
 * rules + difficulty curve) and `__tests__/levelStability.test.ts` (8s of real cannon-es
 * simulation with no ball fired).
 */
export const LEVELS: readonly LevelDef[] = [
  // ---- Phase 1 — wordless tutorial (1-6) ----
  {
    id: 1,
    balls: 5,
    starThresholds: { twoStar: 2, threeStar: 4 },
    platforms: [
      {
        shape: 'round',
        radius: 2.2,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'crate', position: [0, 0, 0] },
        ],
      },
    ],
    hint: { platform: 0, block: 0 },
  },
  {
    id: 2,
    balls: 5,
    starThresholds: { twoStar: 1, threeStar: 3 },
    platforms: [
      {
        shape: 'round',
        radius: 2.4,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'crate', position: [-0.8, 0, 0] },
          { type: 'crate', position: [0.8, 0, 0] },
        ],
      },
    ],
    hint: { platform: 0, block: 0 },
  },
  {
    id: 3,
    balls: 3,
    starThresholds: { twoStar: 1, threeStar: 2 },
    platforms: [
      {
        shape: 'round',
        radius: 2.2,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'crate', position: [0, 0, 0] },
          { type: 'crate', position: [0, 1.0, 0] },
          { type: 'crate', position: [0, 2.0, 0] },
        ],
      },
    ],
    hint: { platform: 0, block: 0 },
  },
  {
    id: 4,
    balls: 4,
    starThresholds: { twoStar: 1, threeStar: 2 },
    platforms: [
      {
        shape: 'round',
        radius: 2.2,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'crate', position: [0, 0, 0] },
          { type: 'crate', position: [0, 1.0, 0] },
          { type: 'crate', position: [0, 2.0, 0] },
          { type: 'crate', position: [0, 3.0, 0] },
          { type: 'crate', position: [0, 4.0, 0] },
        ],
      },
    ],
    hint: { platform: 0, block: 0 },
  },
  {
    id: 5,
    balls: 4,
    starThresholds: { twoStar: 1, threeStar: 2 },
    platforms: [
      {
        shape: 'square',
        radius: 2.4,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'crate', position: [-0.75, 0, 0] },
          { type: 'crate', position: [-0.75, 1.0, 0] },
          { type: 'crate', position: [0.75, 0, 0] },
          { type: 'crate', position: [0.75, 1.0, 0] },
          { type: 'plank', position: [0, 2.0, 0] },
        ],
      },
    ],
  },
  {
    id: 6,
    balls: 5,
    starThresholds: { twoStar: 1, threeStar: 3 },
    platforms: [
      {
        shape: 'round',
        radius: 2.4,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'stone', position: [0, 0, 0] },
          { type: 'crate', position: [-1.3, 0, 0] },
          { type: 'crate', position: [1.3, 0, 0] },
        ],
      },
    ],
  },

  // ---- Phase 2 — mechanics (7-12) ----
  {
    id: 7,
    balls: 5,
    starThresholds: { twoStar: 1, threeStar: 3 },
    platforms: [
      {
        shape: 'round',
        radius: 2.4,
        topY: 2,
        center: [0, 0],
        rotation: { mode: 'continuous', speedDegPerSec: 15 },
        blocks: [
          { type: 'crate', position: [-0.5, 0, -0.5] },
          { type: 'crate', position: [-0.5, 0, 0.5] },
          { type: 'crate', position: [0.5, 0, -0.5] },
          { type: 'crate', position: [0.5, 0, 0.5] },
        ],
      },
    ],
  },
  {
    id: 8,
    balls: 4,
    starThresholds: { twoStar: 1, threeStar: 2 },
    platforms: [
      {
        shape: 'square',
        radius: 2.4,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'barrel', position: [-1.0, 0, 1.0], layOnSide: true, rotationYDeg: 90 },
          { type: 'barrel', position: [0, 0, 1.0], layOnSide: true, rotationYDeg: 90 },
          { type: 'barrel', position: [1.0, 0, 1.0], layOnSide: true, rotationYDeg: 90 },
          { type: 'barrel', position: [-0.5, 0, 0], layOnSide: true, rotationYDeg: 90 },
          { type: 'barrel', position: [0.5, 0, 0], layOnSide: true, rotationYDeg: 90 },
          { type: 'barrel', position: [0, 0, -1.0], layOnSide: true, rotationYDeg: 90 },
        ],
      },
    ],
  },
  {
    id: 9,
    balls: 5,
    starThresholds: { twoStar: 1, threeStar: 2 },
    platforms: [
      {
        shape: 'square',
        radius: 2.6,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'crate', position: [-1, 0, 1.2] },
          { type: 'crate', position: [0, 0, 1.2] },
          { type: 'crate', position: [1, 0, 1.2] },
          { type: 'crate', position: [-1, 1.0, 1.2] },
          { type: 'crate', position: [0, 1.0, 1.2] },
          { type: 'crate', position: [1, 1.0, 1.2] },
          { type: 'crate', position: [-1, 2.0, 1.2] },
          { type: 'crate', position: [0, 2.0, 1.2] },
          { type: 'crate', position: [1, 2.0, 1.2] },
        ],
      },
    ],
  },
  {
    id: 10,
    balls: 5,
    starThresholds: { twoStar: 1, threeStar: 2 },
    platforms: [
      {
        shape: 'round',
        radius: 2.4,
        topY: 2,
        center: [0, 0],
        rotation: { mode: 'continuous', speedDegPerSec: 20 },
        blocks: [
          { type: 'stone', position: [-0.7, 0, 0.6] },
          { type: 'stone', position: [0.7, 0, 0.6] },
          { type: 'smallCube', position: [-0.6, 0, -0.7] },
          { type: 'smallCube', position: [0, 0, -0.7] },
          { type: 'smallCube', position: [0.6, 0, -0.7] },
        ],
      },
    ],
  },
  {
    id: 11,
    balls: 6,
    starThresholds: { twoStar: 2, threeStar: 4 },
    platforms: [
      {
        shape: 'round',
        radius: 1.8,
        topY: 2,
        center: [-2.4, 0],
        blocks: [
          { type: 'crate', position: [0, 0, 0] },
          { type: 'crate', position: [0, 1.0, 0] },
          { type: 'crate', position: [0, 2.0, 0] },
        ],
      },
      {
        shape: 'round',
        radius: 1.8,
        topY: 2,
        center: [2.4, 0],
        blocks: [
          { type: 'crate', position: [0, 0, 0] },
          { type: 'crate', position: [0, 1.0, 0] },
          { type: 'crate', position: [0, 2.0, 0] },
        ],
      },
    ],
  },
  {
    id: 12,
    balls: 3,
    starThresholds: { twoStar: 1, threeStar: 2 },
    platforms: [
      {
        shape: 'round',
        radius: 1.6,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'crate', position: [0, 0, 0] },
          { type: 'crate', position: [0, 1.0, 0] },
          { type: 'smallCube', position: [0, 2.0, 0] },
          { type: 'smallCube', position: [0, 2.6, 0] },
        ],
      },
    ],
  },

  // ---- Phase 3 — challenge (13-19) ----
  {
    id: 13,
    balls: 4,
    starThresholds: { twoStar: 1, threeStar: 2 },
    platforms: [
      {
        shape: 'square',
        radius: 2.4,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'plank', position: [1.3, 0, 0] },
          { type: 'stone', position: [0.8, 0.3, 0] },
          { type: 'smallCube', position: [1.7, 0.3, 0] },
          { type: 'smallCube', position: [2.3, 0.3, 0] },
        ],
      },
    ],
  },
  {
    id: 14,
    balls: 3,
    starThresholds: { twoStar: 1, threeStar: 2 },
    platforms: [
      {
        shape: 'square',
        radius: 2.8,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'plank', position: [0, 0, 1.8], layOnSide: true, rotationYDeg: 90 },
          { type: 'plank', position: [0, 0, 0.9], layOnSide: true, rotationYDeg: 90 },
          { type: 'plank', position: [0, 0, 0], layOnSide: true, rotationYDeg: 90 },
          { type: 'plank', position: [0, 0, -0.9], layOnSide: true, rotationYDeg: 90 },
          { type: 'plank', position: [0, 0, -1.8], layOnSide: true, rotationYDeg: 90 },
        ],
      },
    ],
  },
  {
    id: 15,
    balls: 6,
    starThresholds: { twoStar: 1, threeStar: 3 },
    platforms: [
      {
        shape: 'round',
        radius: 2.6,
        topY: 2,
        center: [0, 0],
        rotation: { mode: 'continuous', speedDegPerSec: 18 },
        blocks: [
          { type: 'crate', position: [-1.2, 0, -1.2] },
          { type: 'crate', position: [-1.2, 0, 0] },
          { type: 'crate', position: [-1.2, 0, 1.2] },
          { type: 'crate', position: [0, 0, -1.2] },
          { type: 'crate', position: [0, 0, 1.2] },
          { type: 'crate', position: [1.2, 0, -1.2] },
          { type: 'crate', position: [1.2, 0, 0] },
          { type: 'crate', position: [1.2, 0, 1.2] },
          { type: 'stone', position: [0, 0, 0] },
        ],
      },
    ],
  },
  {
    id: 16,
    balls: 5,
    starThresholds: { twoStar: 1, threeStar: 3 },
    platforms: [
      {
        shape: 'square',
        radius: 2.6,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'barrel', position: [-1.0, 0, 0] },
          { type: 'barrel', position: [1.0, 0, 0] },
          { type: 'beam', position: [0, 1.0, 0] },
          { type: 'smallCube', position: [-0.8, 1.75, 0] },
          { type: 'smallCube', position: [0, 1.75, 0] },
          { type: 'smallCube', position: [0.8, 1.75, 0] },
        ],
      },
    ],
  },
  {
    id: 17,
    balls: 5,
    starThresholds: { twoStar: 1, threeStar: 3 },
    platforms: [
      {
        shape: 'round',
        radius: 2.4,
        topY: 2,
        center: [0, 0],
        rotation: { mode: 'continuous', speedDegPerSec: 40 },
        blocks: [
          { type: 'crate', position: [-0.5, 0, -0.5] },
          { type: 'crate', position: [-0.5, 0, 0.5] },
          { type: 'crate', position: [0.5, 0, -0.5] },
          { type: 'crate', position: [0.5, 0, 0.5] },
          { type: 'beam', position: [0, 1.0, 0] },
        ],
      },
    ],
  },
  {
    id: 18,
    balls: 6,
    starThresholds: { twoStar: 1, threeStar: 2 },
    platforms: [
      {
        shape: 'square',
        radius: 2.8,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'stone', position: [-0.9, 0, -1.6] },
          { type: 'stone', position: [0.9, 0, -1.6] },
          { type: 'beam', position: [0, 1.2, -1.6] },
          { type: 'stone', position: [-0.9, 0, 0] },
          { type: 'stone', position: [0.9, 0, 0] },
          { type: 'beam', position: [0, 1.2, 0] },
          { type: 'stone', position: [-0.9, 0, 1.6] },
          { type: 'stone', position: [0.9, 0, 1.6] },
          { type: 'beam', position: [0, 1.2, 1.6] },
        ],
      },
    ],
  },
  {
    id: 19,
    balls: 5,
    starThresholds: { twoStar: 1, threeStar: 3 },
    platforms: [
      {
        shape: 'round',
        radius: 2.4,
        topY: 2,
        center: [0, 0],
        rotation: { mode: 'oscillate', speedDegPerSec: 35, maxAngleDeg: 90 },
        blocks: [
          { type: 'stone', position: [0, 0, 0.8] },
          { type: 'smallCube', position: [-0.35, 0, -0.4] },
          { type: 'smallCube', position: [0.35, 0, -0.4] },
          { type: 'smallCube', position: [-0.35, 0, -1.0] },
          { type: 'smallCube', position: [0.35, 0, -1.0] },
        ],
      },
    ],
  },

  // ---- Phase 4 — mastery (20-25) ----
  {
    id: 20,
    balls: 5,
    starThresholds: { twoStar: 1, threeStar: 3 },
    platforms: [
      {
        shape: 'square',
        radius: 2.6,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'crate', position: [-0.75, 0, 0] },
          { type: 'crate', position: [-0.75, 1.0, 0] },
          { type: 'crate', position: [0.75, 0, 0] },
          { type: 'crate', position: [0.75, 1.0, 0] },
          { type: 'plank', position: [0, 2.0, 0] },
          { type: 'crate', position: [-1.0, 2.3, 0] },
          { type: 'crate', position: [1.0, 2.3, 0] },
          { type: 'barrel', position: [0, 2.3, 0] },
          { type: 'plank', position: [0, 3.3, 0] },
          { type: 'smallCube', position: [0, 3.6, 0] },
        ],
      },
    ],
  },
  {
    id: 21,
    balls: 7,
    starThresholds: { twoStar: 2, threeStar: 4 },
    platforms: [
      {
        shape: 'round',
        radius: 1.8,
        topY: 2,
        center: [-2.4, 0],
        rotation: { mode: 'continuous', speedDegPerSec: 25 },
        blocks: [
          { type: 'crate', position: [0, 0, 0] },
          { type: 'crate', position: [0, 1.0, 0] },
          { type: 'barrel', position: [1.0, 0, 0] },
        ],
      },
      {
        shape: 'round',
        radius: 1.8,
        topY: 2,
        center: [2.4, 0],
        rotation: { mode: 'continuous', speedDegPerSec: -25 },
        blocks: [
          { type: 'crate', position: [0, 0, 0] },
          { type: 'crate', position: [0, 1.0, 0] },
          { type: 'stone', position: [-1.1, 0, 0] },
        ],
      },
    ],
  },
  {
    id: 22,
    balls: 6,
    starThresholds: { twoStar: 1, threeStar: 3 },
    platforms: [
      {
        shape: 'round',
        radius: 2.8,
        topY: 2,
        center: [0, 0],
        rotation: { mode: 'continuous', speedDegPerSec: 20 },
        blocks: [
          { type: 'crate', position: [-1.2, 0, -1.2] },
          { type: 'crate', position: [-1.2, 0, 0] },
          { type: 'crate', position: [-1.2, 0, 1.2] },
          { type: 'crate', position: [0, 0, -1.2] },
          { type: 'crate', position: [0, 0, 1.2] },
          { type: 'crate', position: [1.2, 0, -1.2] },
          { type: 'crate', position: [1.2, 0, 0] },
          { type: 'crate', position: [1.2, 0, 1.2] },
          { type: 'stone', position: [0, 0, 0] },
          { type: 'crate', position: [0, 1.2, 0] },
          { type: 'smallCube', position: [0, 2.2, 0] },
        ],
      },
    ],
  },
  {
    id: 23,
    balls: 4,
    starThresholds: { twoStar: 1, threeStar: 2 },
    platforms: [
      {
        shape: 'round',
        radius: 1.4,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'smallCube', position: [-0.35, 0, -0.35] },
          { type: 'smallCube', position: [-0.35, 0, 0.35] },
          { type: 'smallCube', position: [0.35, 0, -0.35] },
          { type: 'smallCube', position: [0.35, 0, 0.35] },
        ],
      },
    ],
  },
  {
    id: 24,
    balls: 12,
    starThresholds: { twoStar: 2, threeStar: 4 },
    platforms: [
      {
        shape: 'square',
        radius: 3.0,
        topY: 2,
        center: [0, 0],
        blocks: [
          { type: 'stone', position: [-2.6, 0, 0] },
          { type: 'crate', position: [-1.5, 0, 0] },
          { type: 'crate', position: [-0.5, 0, 0] },
          { type: 'crate', position: [0.5, 0, 0] },
          { type: 'crate', position: [1.5, 0, 0] },
          { type: 'stone', position: [2.6, 0, 0] },
          { type: 'barrel', position: [-1.5, 1.0, 0] },
          { type: 'barrel', position: [-0.5, 1.0, 0] },
          { type: 'barrel', position: [0.5, 1.0, 0] },
          { type: 'barrel', position: [1.5, 1.0, 0] },
          { type: 'crate', position: [-0.5, 2.0, 0] },
          { type: 'crate', position: [0.5, 2.0, 0] },
          { type: 'crate', position: [0, 3.0, 0] },
          { type: 'plank', position: [0, 0, 1.3] },
          { type: 'plank', position: [0, 0, -1.3] },
          { type: 'smallCube', position: [-2.6, 0, 1.0] },
          { type: 'smallCube', position: [2.6, 0, 1.0] },
          { type: 'smallCube', position: [-0.4, 0.3, 1.3] },
          { type: 'smallCube', position: [0.4, 0.3, 1.3] },
          { type: 'crate', position: [-2.0, 0, -1.3] },
          { type: 'crate', position: [2.0, 0, -1.3] },
          { type: 'smallCube', position: [0, 0, -2.3] },
          { type: 'barrel', position: [-1.0, 0, 2.8], layOnSide: true },
          { type: 'barrel', position: [1.0, 0, 2.8], layOnSide: true },
        ],
      },
    ],
  },
  {
    id: 25,
    balls: 12,
    starThresholds: { twoStar: 2, threeStar: 4 },
    platforms: [
      {
        shape: 'round',
        radius: 3.0,
        topY: 2,
        center: [0, 0],
        rotation: { mode: 'oscillate', speedDegPerSec: 30, maxAngleDeg: 120 },
        blocks: [
          { type: 'stone', position: [-1.4, 0, -1.4] },
          { type: 'stone', position: [-1.4, 0, 1.4] },
          { type: 'stone', position: [1.4, 0, -1.4] },
          { type: 'stone', position: [1.4, 0, 1.4] },
          { type: 'crate', position: [0, 0, 1.4] },
          { type: 'crate', position: [0, 0, -1.4] },
          { type: 'crate', position: [-1.4, 0, 0] },
          { type: 'crate', position: [1.4, 0, 0] },
          { type: 'beam', position: [0, 1.2, 1.4] },
          { type: 'beam', position: [0, 1.2, -1.4] },
          { type: 'beam', position: [-1.4, 1.95, 0], rotationYDeg: 90 },
          { type: 'beam', position: [1.4, 1.95, 0], rotationYDeg: 90 },
          { type: 'stone', position: [0, 0, 0] },
          { type: 'crate', position: [0, 1.2, 0] },
          { type: 'smallCube', position: [0, 2.2, 0] },
        ],
      },
    ],
  },
]
