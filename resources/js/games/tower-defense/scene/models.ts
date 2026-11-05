import type * as THREE from 'three'

import type { EnemyKind, TowerId } from '../gameTypes'
import { bakeFacets, ball, box, cone, crystal, cylinder, mergeParts, part } from './parts'

const STONE = 0xb9b1a7
const STONE_LIGHT = 0xdcd5ca
const STONE_DARK = 0x8f867c
const WOOD = 0xa9622c
const WOOD_LIGHT = 0xcd8a45
const WOOD_DARK = 0x704018
const IRON = 0x565c66
const GOLD = 0xfacc15
const SLIT = 0x2a2520
/** Models keep their working parts on this side, which is the way they turn to aim. */
const BASE_TOP = 0.2

/** A stepped base every tower stands on, so each reads as one footprint however tall it is. */
function plinth(color: number, tier: number, step = color): THREE.BufferGeometry[] {
  const parts = [
    part(cylinder(0.44, 0.49, 0.11, 8), color, [0, 0.055, 0]),
    part(cylinder(0.36, 0.42, 0.09, 8), step, [0, 0.155, 0]),
  ]
  // Gold studs mark the tier from any angle, with no colour-only signal.
  for (let index = 0; index < tier - 1; index += 1) {
    const angle = (index * Math.PI) + (Math.PI / 4)
    parts.push(part(box(0.14, 0.14, 0.14), GOLD, [Math.cos(angle) * 0.41, 0.2, Math.sin(angle) * 0.41]))
  }

  return parts
}

/** Evenly spaced pieces around a ring, for battlements, spikes and flames. */
function around(count: number, radius: number, make: (x: number, z: number, angle: number) => THREE.BufferGeometry): THREE.BufferGeometry[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index * Math.PI * 2) / count

    return make(Math.cos(angle) * radius, Math.sin(angle) * radius, angle)
  })
}

function wallParts(tier: number): THREE.BufferGeometry[] {
  if (tier === 1) {
    // A palisade of sharpened stakes, with gaps that keep each one readable from above.
    return [
      part(box(0.96, 0.08, 0.96), 0x5e3f1f, [0, 0.04, 0]),
      ...[-0.3, 0, 0.3].flatMap((x, column) => [-0.22, 0.22].flatMap((z, row) => {
        const height = 0.44 + (((column + row) % 2) * 0.14)

        return [
          part(box(0.23, height, 0.3), (column + row) % 2 === 0 ? WOOD : WOOD_DARK, [x, 0.08 + (height / 2), z]),
          part(cone(0.19, 0.22, 4), 0xe0a660, [x, 0.19 + height, z], [0, Math.PI / 4, 0], [0.8, 1, 1.05]),
        ]
      })),
      part(box(0.96, 0.07, 0.04), IRON, [0, 0.34, 0.39]),
      part(box(0.96, 0.07, 0.04), IRON, [0, 0.34, -0.39]),
    ]
  }
  // Chunky stacked stones, each block catching the light on its own.
  const parts = [
    part(box(0.96, 0.34, 0.96), STONE_DARK, [0, 0.17, 0]),
    part(box(0.52, 0.26, 0.46), STONE, [-0.22, 0.46, -0.24]),
    part(box(0.4, 0.3, 0.46), STONE_LIGHT, [0.27, 0.48, -0.24]),
    part(box(0.38, 0.3, 0.46), STONE_LIGHT, [-0.28, 0.48, 0.24]),
    part(box(0.54, 0.25, 0.46), STONE, [0.21, 0.455, 0.24]),
  ]
  if (tier === 3) {
    parts.push(part(box(0.98, 0.09, 0.98), IRON, [0, 0.68, 0]))
    for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]] as const) {
      parts.push(part(box(0.2, 0.2, 0.2), GOLD, [x, 0.78, z]))
    }
  }

  return parts
}

function towerParts(tower: TowerId, tier: number): THREE.BufferGeometry[] {
  const grow = 1 + ((tier - 1) * 0.16)
  const top = BASE_TOP + (0.6 * grow)
  switch (tower) {
    case 'wall':
      return wallParts(tier)
    case 'arrow':
      return [
        ...plinth(STONE_DARK, tier, STONE),
        part(cylinder(0.33, 0.37, top - BASE_TOP, 8), STONE, [0, (top + BASE_TOP) / 2, 0]),
        part(cylinder(0.36, 0.37, 0.07, 8), STONE_DARK, [0, BASE_TOP + (0.2 * grow), 0]),
        part(box(0.09, 0.2, 0.05), SLIT, [0, BASE_TOP + (0.38 * grow), 0.34]),
        part(cylinder(0.43, 0.35, 0.1, 8), STONE_LIGHT, [0, top + 0.05, 0]),
        ...around(8, 0.39, (x, z, angle) => part(box(0.14, 0.14, 0.12), STONE_LIGHT, [x, top + 0.16, z], [0, -angle, 0])),
        part(cylinder(0.05, 0.05, 0.2, 5), WOOD_DARK, [0, top + 0.2, 0]),
        part(cone(0.47, 0.4, 4), 0xe5392f, [0, top + 0.5, 0], [0, Math.PI / 4, 0]),
        part(box(0.07, 0.07, 0.66), WOOD_DARK, [0, top + 0.17, 0.3]),
        part(cone(0.07, 0.17, 4), STONE_LIGHT, [0, top + 0.17, 0.69], [Math.PI / 2, 0, 0]),
        part(box(0.5, 0.05, 0.06), WOOD_LIGHT, [0, top + 0.17, 0.46]),
      ]
    case 'ember':
      return [
        ...plinth(STONE_DARK, tier, STONE),
        // An iron cauldron on three legs.
        ...around(3, 0.27, (x, z, angle) => part(box(0.12, 0.5 * grow, 0.12), 0x3f3b39, [x, BASE_TOP + (0.2 * grow), z], [Math.sin(angle) * 0.22, 0, -Math.cos(angle) * 0.22])),
        part(cylinder(0.4, 0.2, 0.34, 8), 0x45403d, [0, top + 0.02, 0]),
        part(cylinder(0.43, 0.41, 0.07, 8), 0x5c5552, [0, top + 0.2, 0]),
        part(cylinder(0.36, 0.36, 0.02, 8), 0xdc2626, [0, top + 0.235, 0]),
        ...around(4, 0.42, (x, z) => part(crystal(0.05), GOLD, [x, top + 0.02, z])),
      ]
    case 'frost':
      return [
        ...plinth(STONE, tier, STONE_LIGHT),
      ]
    case 'thorn': {
      const crown = BASE_TOP + (0.7 * grow)

      return [
        ...plinth(0x7a4f2a, tier, 0x8f6236),
        part(cylinder(0.13, 0.21, 0.56 * grow, 6), 0x7a4a20, [0, BASE_TOP + (0.28 * grow), 0]),
        ...around(3, 0.2, (x, z, angle) => part(box(0.1, 0.12, 0.26), 0x7a4a20, [x, BASE_TOP + 0.04, z], [0, -angle + (Math.PI / 2), 0])),
        part(ball(0.42, 1), 0x4c9a2a, [0, crown, 0], [0.3, 0.2, 0]),
        part(ball(0.2, 0), 0x6cbc3a, [-0.14, crown + 0.26, 0.12]),
        ...around(7, 0.4, (x, z, angle) => part(cone(0.075, 0.28, 5), 0xf3e6b3, [x, crown + 0.03, z], [Math.sin(angle) * 1.45, 0, -Math.cos(angle) * 1.45])),
        ...around(4, 0.24, (x, z, angle) => part(cone(0.075, 0.26, 5), 0xf3e6b3, [x, crown + 0.36, z], [Math.sin(angle) * 0.7, 0, -Math.cos(angle) * 0.7])),
        part(cone(0.08, 0.28, 5), 0xf3e6b3, [0, crown + 0.5, 0]),
      ]
    }
    case 'boulder': {
      const deck = BASE_TOP + 0.13

      return [
        ...plinth(STONE_DARK, tier, STONE),
        part(box(0.56, 0.12, 0.84), WOOD, [0, deck, 0]),
        // Wheels on both sides, the catapult's giveaway from above.
        ...[-0.34, 0.34].flatMap((x) => [-0.26, 0.26].map((z) => part(cylinder(0.14, 0.14, 0.09, 8), WOOD_DARK, [x, deck - 0.02, z], [0, 0, Math.PI / 2]))),
        part(box(0.09, 0.5 * grow, 0.09), WOOD_LIGHT, [-0.21, deck + (0.25 * grow), 0.06], [-0.25, 0, 0]),
        part(box(0.09, 0.5 * grow, 0.09), WOOD_LIGHT, [0.21, deck + (0.25 * grow), 0.06], [-0.25, 0, 0]),
        part(box(0.54, 0.09, 0.09), WOOD_DARK, [0, deck + (0.47 * grow), 0]),
        // The throwing arm, cocked back, with its stone in the cup.
        part(box(0.11, 0.09, 0.96), WOOD_LIGHT, [0, deck + (0.38 * grow), -0.05], [-0.5, 0, 0]),
        part(cylinder(0.2, 0.13, 0.1, 6), WOOD_DARK, [0, deck + (0.6 * grow), 0.38]),
        part(ball(0.23, 0), 0xc4bdb2, [0, deck + (0.8 * grow), 0.38], [0.5, 0.4, 0]),
      ]
    }
    case 'sun':
      return [
        ...plinth(STONE_LIGHT, tier, 0xf1ece4),
        part(cylinder(0.17, 0.32, 0.72 * grow, 8), 0xf7f3ec, [0, BASE_TOP + (0.36 * grow), 0]),
        part(crystal(0.08), GOLD, [0, BASE_TOP + (0.26 * grow), 0.27], [0, 0, 0], [0.8, 1.3, 0.6]),
        part(cylinder(0.31, 0.2, 0.1, 8), 0xf1ece4, [0, BASE_TOP + (0.74 * grow), 0]),
        part(cylinder(0.25, 0.28, 0.05, 8), GOLD, [0, BASE_TOP + (0.8 * grow), 0]),
      ]
    case 'hex':
      return [
        ...plinth(0x5b3ab0, tier, 0x7450cf),
        part(cylinder(0.35, 0.4, 0.14, 8), 0x5b3ab0, [0, BASE_TOP + 0.07, 0]),
        part(cylinder(0.12, 0.31, 0.95 * grow, 6), 0x5a37a8, [0, BASE_TOP + 0.14 + (0.475 * grow), 0]),
      ]
    default:
      return [part(box(0.8, 0.8, 0.8), STONE, [0, 0.4, 0])]
  }
}

/** The bright, unlit parts of a tower: they stand out in any theme, and they move. */
function towerGlowParts(tower: TowerId, tier: number): THREE.BufferGeometry[] {
  const grow = 1 + ((tier - 1) * 0.16)
  const top = BASE_TOP + (0.6 * grow)
  switch (tower) {
    case 'ember':
      return [
        part(cone(0.37, 0.72, 7), 0xf9591a, [0, top + 0.56, 0]),
        ...around(3, 0.17, (x, z) => part(cone(0.16, 0.5, 6), 0xf97316, [x, top + 0.46, z])),
        part(cone(0.24, 0.56, 6), 0xfbab24, [0, top + 0.5, 0.05]),
        part(cone(0.12, 0.34, 6), 0xfff1a8, [0, top + 0.42, 0.1]),
      ]
    case 'frost':
      // A cluster of big crystals, bright in any theme, with its faces baked in.
      return [
        part(crystal(0.33), 0x7fdcff, [0, BASE_TOP + (0.44 * grow), 0], [0, 0.4, 0], [0.82, 1.65 * grow, 0.82]),
        part(crystal(0.2), 0xb4efff, [0.27, BASE_TOP + (0.21 * grow), 0.1], [0, 0.2, -0.32], [0.85, 1.6 * grow, 0.85]),
        part(crystal(0.19), 0xa2e8ff, [-0.26, BASE_TOP + (0.2 * grow), -0.1], [0, 0.7, 0.32], [0.85, 1.55 * grow, 0.85]),
        part(crystal(0.15), 0xd6f6ff, [0.03, BASE_TOP + 0.13, 0.28], [0.3, 0, 0], [0.85, 1.5, 0.85]),
        part(crystal(0.14), 0x74d6fb, [0.03, BASE_TOP + 0.13, -0.28], [-0.3, 0.5, 0], [0.85, 1.5, 0.85]),
      ]
    case 'sun':
      return [
        part(ball(0.3, 1), 0xfcc419, [0, BASE_TOP + (1.12 * grow), 0]),
        part(ball(0.1, 0), 0xfff7cf, [-0.12, BASE_TOP + (1.27 * grow), 0.14]),
      ]
    case 'hex':
      return [
        part(crystal(0.22), 0xb45bf5, [0, BASE_TOP + (1.42 * grow), 0], [0, 0, 0], [0.85, 1.35, 0.85]),
        part(crystal(0.1), 0xc77dff, [0, BASE_TOP + (0.56 * grow), 0.24], [0, 0, 0], [0.7, 1.3, 0.5]),
      ]
    default:
      return []
  }
}

const towerCache = new Map<string, THREE.BufferGeometry>()
const glowCache = new Map<string, THREE.BufferGeometry | null>()

export function towerGeometry(tower: TowerId, tier: number): THREE.BufferGeometry {
  const key = `${tower}-${tier}`
  let geometry = towerCache.get(key)
  if (!geometry) {
    geometry = mergeParts(towerParts(tower, tier))
    geometry.userData.cached = true
    towerCache.set(key, geometry)
  }

  return geometry
}

/** Null for a building with nothing glowing on it. */
export function towerGlowGeometry(tower: TowerId, tier: number): THREE.BufferGeometry | null {
  const key = `${tower}-${tier}`
  let geometry = glowCache.get(key)
  if (geometry === undefined) {
    const parts = towerGlowParts(tower, tier)
    geometry = parts.length > 0 ? bakeFacets(mergeParts(parts, false)) : null
    if (geometry) {
      geometry.userData.cached = true
    }
    glowCache.set(key, geometry)
  }

  return geometry
}

/** Enemies are white where the element tint should show and coloured where it should not. */
export function enemyGeometry(kind: EnemyKind): THREE.BufferGeometry {
  const WHITE = 0xffffff
  const PALE = 0xd8d8d8
  const DARK = 0x1f2937
  const EYE = 0xfff7ed
  const HORN = 0xfef3c7
  const eyes = (y: number, z: number, spread: number): THREE.BufferGeometry[] => [
    part(ball(0.065, 0), EYE, [spread, y, z]),
    part(ball(0.065, 0), EYE, [-spread, y, z]),
    part(ball(0.036, 0), DARK, [spread, y, z + 0.05]),
    part(ball(0.036, 0), DARK, [-spread, y, z + 0.05]),
  ]
  switch (kind) {
    case 'swift':
      return mergeParts([
        part(ball(0.2, 1), WHITE, [0, 0.25, 0], [0, 0, 0], [0.82, 0.88, 1.3]),
        part(cone(0.09, 0.28, 4), PALE, [0.09, 0.47, -0.04], [-0.5, 0, -0.25]),
        part(cone(0.09, 0.28, 4), PALE, [-0.09, 0.47, -0.04], [-0.5, 0, 0.25]),
        part(cone(0.06, 0.32, 4), PALE, [0, 0.32, -0.32], [-1.9, 0, 0]),
        part(box(0.08, 0.15, 0.2), DARK, [0.11, 0.07, 0.08]),
        part(box(0.08, 0.15, 0.2), DARK, [-0.11, 0.07, 0.08]),
        ...eyes(0.31, 0.2, 0.08),
      ])
    case 'brute':
      return mergeParts([
        part(box(0.66, 0.58, 0.54), WHITE, [0, 0.42, 0]),
        part(box(0.42, 0.28, 0.36), PALE, [0, 0.82, 0.05]),
        part(box(0.22, 0.48, 0.22), WHITE, [0.43, 0.42, 0.04]),
        part(box(0.22, 0.48, 0.22), WHITE, [-0.43, 0.42, 0.04]),
        part(box(0.24, 0.14, 0.28), DARK, [0.16, 0.07, 0]),
        part(box(0.24, 0.14, 0.28), DARK, [-0.16, 0.07, 0]),
        part(box(0.68, 0.1, 0.56), IRON, [0, 0.6, 0]),
        part(box(0.3, 0.14, 0.3), IRON, [0.43, 0.7, 0.04]),
        part(box(0.3, 0.14, 0.3), IRON, [-0.43, 0.7, 0.04]),
        part(cone(0.07, 0.2, 4), HORN, [0.43, 0.86, 0.04]),
        part(cone(0.07, 0.2, 4), HORN, [-0.43, 0.86, 0.04]),
        ...eyes(0.86, 0.21, 0.1),
      ])
    case 'swarm':
      return mergeParts([
        part(ball(0.16, 0), WHITE, [0, 0.17, 0], [0, 0, 0], [1, 0.85, 1.1]),
        ...around(6, 0.17, (x, z) => part(box(0.05, 0.05, 0.05), DARK, [x, 0.05, z])),
        part(cone(0.04, 0.15, 4), DARK, [0.08, 0.32, 0.03], [0, 0, -0.5]),
        part(cone(0.04, 0.15, 4), DARK, [-0.08, 0.32, 0.03], [0, 0, 0.5]),
        ...eyes(0.2, 0.13, 0.055),
      ])
    case 'flyer':
      return mergeParts([
        part(ball(0.2, 1), WHITE, [0, 0, 0], [0, 0, 0], [0.88, 0.8, 1.2]),
        part(cone(0.24, 0.62, 3), PALE, [0.36, 0.05, -0.04], [0, 0, -1.45], [1, 1, 0.3]),
        part(cone(0.24, 0.62, 3), PALE, [-0.36, 0.05, -0.04], [0, 0, 1.45], [1, 1, 0.3]),
        part(cone(0.1, 0.24, 3), PALE, [0.58, 0.1, 0.02], [0, 0, -1.3], [1, 1, 0.3]),
        part(cone(0.1, 0.24, 3), PALE, [-0.58, 0.1, 0.02], [0, 0, 1.3], [1, 1, 0.3]),
        part(cone(0.06, 0.22, 4), HORN, [0, -0.02, 0.29], [Math.PI / 2, 0, 0]),
        part(cone(0.07, 0.28, 4), PALE, [0, 0.03, -0.3], [-Math.PI / 2, 0, 0]),
        ...eyes(0.07, 0.2, 0.085),
      ])
    case 'sapper':
      return mergeParts([
        part(cylinder(0.2, 0.27, 0.48, 6), WHITE, [0, 0.3, 0]),
        part(ball(0.18, 1), WHITE, [0, 0.62, 0]),
        part(box(0.36, 0.3, 0.14), WOOD_DARK, [0, 0.36, -0.24]),
        part(cylinder(0.05, 0.05, 0.66, 5), WOOD, [0.28, 0.5, 0.12], [0.7, 0, 0.2]),
        part(box(0.38, 0.11, 0.11), STONE_LIGHT, [0.28, 0.75, 0.35], [0.7, 0, 0.2]),
        part(cylinder(0.21, 0.24, 0.09, 8), 0xf59e0b, [0, 0.76, 0]),
        part(ball(0.05, 0), 0xfef3c7, [0, 0.8, 0.2]),
        ...eyes(0.63, 0.16, 0.08),
      ])
    case 'boss':
      return mergeParts([
        part(box(0.86, 0.82, 0.66), WHITE, [0, 0.62, 0]),
        part(box(0.54, 0.44, 0.48), PALE, [0, 1.22, 0.06]),
        part(box(0.32, 0.74, 0.32), WHITE, [0.63, 0.62, 0.06]),
        part(box(0.32, 0.74, 0.32), WHITE, [-0.63, 0.62, 0.06]),
        part(box(0.34, 0.22, 0.38), DARK, [0.22, 0.11, 0]),
        part(box(0.34, 0.22, 0.38), DARK, [-0.22, 0.11, 0]),
        part(box(0.92, 0.14, 0.72), IRON, [0, 0.82, 0]),
        part(box(0.42, 0.2, 0.42), IRON, [0.63, 1.03, 0.06]),
        part(box(0.42, 0.2, 0.42), IRON, [-0.63, 1.03, 0.06]),
        part(cone(0.09, 0.3, 4), HORN, [0.63, 1.27, 0.06]),
        part(cone(0.09, 0.3, 4), HORN, [-0.63, 1.27, 0.06]),
        part(box(0.74, 0.74, 0.07), 0x7f1d1d, [0, 0.72, -0.37], [-0.08, 0, 0]),
        part(cone(0.1, 0.32, 5), GOLD, [0.22, 1.56, 0.06]),
        part(cone(0.1, 0.4, 5), GOLD, [0, 1.6, 0.06]),
        part(cone(0.1, 0.32, 5), GOLD, [-0.22, 1.56, 0.06]),
        part(box(0.1, 0.92, 0.1), WOOD_DARK, [0.84, 0.72, 0.28], [0.3, 0, 0]),
        part(box(0.34, 0.34, 0.14), STONE_LIGHT, [0.84, 1.14, 0.42], [0.3, 0, 0]),
        ...eyes(1.28, 0.31, 0.14),
      ])
    default:
      return mergeParts([
        part(cylinder(0.17, 0.23, 0.34, 7), WHITE, [0, 0.24, 0]),
        part(ball(0.25, 1), WHITE, [0, 0.54, 0.02]),
        // Big ears make it a goblin from any distance.
        part(cone(0.1, 0.34, 4), PALE, [0.3, 0.58, 0], [0, 0, -1.25], [1, 1, 0.5]),
        part(cone(0.1, 0.34, 4), PALE, [-0.3, 0.58, 0], [0, 0, 1.25], [1, 1, 0.5]),
        part(cylinder(0.19, 0.2, 0.05, 7), IRON, [0, 0.3, 0]),
        part(box(0.12, 0.13, 0.17), DARK, [0.11, 0.06, 0.02]),
        part(box(0.12, 0.13, 0.17), DARK, [-0.11, 0.06, 0.02]),
        part(box(0.06, 0.42, 0.06), WOOD, [0.27, 0.42, 0.13], [0.5, 0, 0]),
        part(ball(0.09, 0), WOOD_DARK, [0.27, 0.62, 0.25]),
        ...eyes(0.58, 0.22, 0.1),
      ])
  }
}
