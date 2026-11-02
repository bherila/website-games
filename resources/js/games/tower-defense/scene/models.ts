import type * as THREE from 'three'

import type { EnemyKind, TowerId } from '../gameTypes'
import { ball, box, cone, crystal, cylinder, mergeParts, part } from './parts'

const STONE = 0x9aa0a8
const STONE_DARK = 0x6d727a
const WOOD = 0x8a5a2b
const WOOD_DARK = 0x5e3c1b
const IRON = 0x4b5563
const GOLD = 0xfacc15

/** A base every tower stands on, so each reads as one footprint however tall it is. */
function plinth(color: number, tier: number): THREE.BufferGeometry[] {
  const parts = [part(cylinder(0.42, 0.46, 0.18, 8), color, [0, 0.09, 0])]
  // Gold studs mark the tier from any angle, with no colour-only signal.
  for (let index = 0; index < tier - 1; index += 1) {
    const angle = (index * Math.PI * 2) / 2 + (Math.PI / 4)
    parts.push(part(box(0.11, 0.11, 0.11), GOLD, [Math.cos(angle) * 0.42, 0.19, Math.sin(angle) * 0.42]))
  }

  return parts
}

function towerParts(tower: TowerId, tier: number): THREE.BufferGeometry[] {
  const grow = 1 + ((tier - 1) * 0.16)
  switch (tower) {
    case 'wall': {
      const color = tier === 1 ? 0xb08968 : tier === 2 ? STONE : 0x64748b
      const trim = tier === 1 ? WOOD_DARK : tier === 2 ? STONE_DARK : GOLD

      return [
        part(box(0.92, 0.5 + (tier * 0.08), 0.92), color, [0, 0.25 + (tier * 0.04), 0]),
        part(box(0.96, 0.08, 0.96), trim, [0, 0.54 + (tier * 0.08), 0]),
      ]
    }
    case 'arrow':
      return [
        ...plinth(STONE_DARK, tier),
        part(cylinder(0.26, 0.34, 0.75 * grow, 8), WOOD, [0, 0.18 + (0.375 * grow), 0]),
        part(cylinder(0.38, 0.3, 0.14, 8), WOOD_DARK, [0, 0.2 + (0.78 * grow), 0]),
        part(cone(0.42, 0.34, 8), 0xb91c1c, [0, 0.42 + (0.82 * grow), 0]),
        part(box(0.56, 0.05, 0.06), WOOD_DARK, [0.18, 0.18 + (0.62 * grow), 0]),
      ]
    case 'ember':
      return [
        ...plinth(0x57534e, tier),
        part(cylinder(0.3, 0.2, 0.55 * grow, 6), 0x44403c, [0, 0.18 + (0.275 * grow), 0]),
        part(cylinder(0.38, 0.26, 0.22, 8), 0x292524, [0, 0.28 + (0.55 * grow), 0]),
        part(cone(0.24, 0.5, 6), 0xf97316, [0, 0.62 + (0.55 * grow), 0]),
        part(cone(0.13, 0.32, 6), 0xfde047, [0, 0.58 + (0.55 * grow), 0]),
      ]
    case 'frost':
      return [
        ...plinth(0x94a3b8, tier),
        part(crystal(0.34), 0x7dd3fc, [0, 0.55 + (0.2 * grow), 0], [0, 0, 0], [0.75, 1.5 * grow, 0.75]),
        part(crystal(0.15), 0xe0f2fe, [0.27, 0.4, 0.1], [0, 0, 0.3], [0.8, 1.5, 0.8]),
        part(crystal(0.15), 0xe0f2fe, [-0.25, 0.42, -0.12], [0, 0, -0.3], [0.8, 1.5, 0.8]),
      ]
    case 'thorn':
      return [
        ...plinth(0x5b4630, tier),
        part(cylinder(0.11, 0.2, 0.7 * grow, 6), 0x3f6212, [0, 0.18 + (0.35 * grow), 0]),
        part(ball(0.32, 0), 0x22c55e, [0, 0.3 + (0.7 * grow), 0], [0, 0, 0], [1, 0.85, 1]),
        part(cone(0.07, 0.32, 4), 0xbef264, [0.26, 0.42 + (0.7 * grow), 0], [0, 0, -1]),
        part(cone(0.07, 0.32, 4), 0xbef264, [-0.26, 0.42 + (0.7 * grow), 0], [0, 0, 1]),
        part(cone(0.07, 0.32, 4), 0xbef264, [0, 0.42 + (0.7 * grow), 0.26], [1, 0, 0]),
        part(cone(0.07, 0.32, 4), 0xbef264, [0, 0.42 + (0.7 * grow), -0.26], [-1, 0, 0]),
        part(cone(0.07, 0.3, 4), 0xecfccb, [0, 0.72 + (0.7 * grow), 0]),
      ]
    case 'boulder':
      return [
        ...plinth(0x57534e, tier),
        part(box(0.72, 0.36 * grow, 0.72), 0x78716c, [0, 0.18 + (0.18 * grow), 0]),
        part(box(0.16, 0.5 * grow, 0.16), WOOD, [-0.2, 0.3 + (0.42 * grow), 0], [0, 0, 0.5]),
        part(box(0.16, 0.5 * grow, 0.16), WOOD, [0.2, 0.3 + (0.42 * grow), 0], [0, 0, -0.5]),
        part(ball(0.24, 0), 0xa8a29e, [0, 0.42 + (0.5 * grow), 0]),
      ]
    case 'sun':
      return [
        ...plinth(0xe7e5e4, tier),
        part(cylinder(0.1, 0.24, 1 * grow, 6), 0xf5f5f4, [0, 0.18 + (0.5 * grow), 0]),
        part(cylinder(0.3, 0.3, 0.05, 8), GOLD, [0, 0.18 + (0.85 * grow), 0]),
        part(ball(0.2, 1), 0xfde047, [0, 0.36 + (1 * grow), 0]),
      ]
    case 'hex':
      return [
        ...plinth(0x312e81, tier),
        part(cylinder(0.08, 0.3, 1.05 * grow, 4), 0x1e1b4b, [0, 0.18 + (0.52 * grow), 0], [0, Math.PI / 4, 0]),
        part(crystal(0.18), 0xc084fc, [0, 0.38 + (1.05 * grow), 0]),
        part(box(0.5, 0.05, 0.05), 0xa855f7, [0, 0.18 + (0.45 * grow), 0], [0, Math.PI / 4, 0]),
        part(box(0.5, 0.05, 0.05), 0xa855f7, [0, 0.18 + (0.45 * grow), 0], [0, -Math.PI / 4, 0]),
      ]
    default:
      return [part(box(0.8, 0.8, 0.8), STONE, [0, 0.4, 0])]
  }
}

const towerCache = new Map<string, THREE.BufferGeometry>()

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

/** Enemies are white where the element tint should show and coloured where it should not. */
export function enemyGeometry(kind: EnemyKind): THREE.BufferGeometry {
  const WHITE = 0xffffff
  const DARK = 0x1f2937
  const EYE = 0xfff7ed
  const eyes = (y: number, z: number, spread: number): THREE.BufferGeometry[] => [
    part(ball(0.055, 0), EYE, [spread, y, z]),
    part(ball(0.055, 0), EYE, [-spread, y, z]),
    part(ball(0.03, 0), DARK, [spread, y, z + 0.045]),
    part(ball(0.03, 0), DARK, [-spread, y, z + 0.045]),
  ]
  switch (kind) {
    case 'swift':
      return mergeParts([
        part(ball(0.2, 1), WHITE, [0, 0.24, 0], [0, 0, 0], [0.85, 0.9, 1.25]),
        part(cone(0.1, 0.26, 4), WHITE, [0, 0.42, -0.08], [-0.7, 0, 0]),
        part(box(0.08, 0.14, 0.14), DARK, [0.11, 0.07, 0]),
        part(box(0.08, 0.14, 0.14), DARK, [-0.11, 0.07, 0]),
        ...eyes(0.3, 0.2, 0.08),
      ])
    case 'brute':
      return mergeParts([
        part(box(0.62, 0.6, 0.5), WHITE, [0, 0.42, 0]),
        part(box(0.38, 0.28, 0.34), WHITE, [0, 0.82, 0.04]),
        part(box(0.2, 0.46, 0.2), WHITE, [0.42, 0.42, 0.04]),
        part(box(0.2, 0.46, 0.2), WHITE, [-0.42, 0.42, 0.04]),
        part(box(0.22, 0.14, 0.26), DARK, [0.16, 0.07, 0]),
        part(box(0.22, 0.14, 0.26), DARK, [-0.16, 0.07, 0]),
        part(box(0.68, 0.1, 0.56), IRON, [0, 0.6, 0]),
        ...eyes(0.86, 0.21, 0.09),
      ])
    case 'swarm':
      return mergeParts([
        part(ball(0.15, 0), WHITE, [0, 0.15, 0]),
        part(cone(0.04, 0.12, 4), DARK, [0.08, 0.3, 0], [0, 0, -0.5]),
        part(cone(0.04, 0.12, 4), DARK, [-0.08, 0.3, 0], [0, 0, 0.5]),
        ...eyes(0.18, 0.12, 0.05),
      ])
    case 'flyer':
      return mergeParts([
        part(ball(0.2, 1), WHITE, [0, 0, 0], [0, 0, 0], [0.9, 0.8, 1.2]),
        part(box(0.5, 0.03, 0.26), WHITE, [0.32, 0.04, -0.03], [0, 0, 0.25]),
        part(box(0.5, 0.03, 0.26), WHITE, [-0.32, 0.04, -0.03], [0, 0, -0.25]),
        part(cone(0.06, 0.2, 4), DARK, [0, -0.02, 0.28], [Math.PI / 2, 0, 0]),
        ...eyes(0.06, 0.2, 0.08),
      ])
    case 'sapper':
      return mergeParts([
        part(cylinder(0.2, 0.26, 0.48, 6), WHITE, [0, 0.3, 0]),
        part(ball(0.18, 1), WHITE, [0, 0.62, 0]),
        part(cylinder(0.05, 0.05, 0.62, 5), WOOD, [0.28, 0.5, 0.12], [0.7, 0, 0.2]),
        part(box(0.34, 0.1, 0.1), IRON, [0.28, 0.73, 0.34], [0.7, 0, 0.2]),
        part(cylinder(0.2, 0.23, 0.08, 8), 0xf59e0b, [0, 0.76, 0]),
        ...eyes(0.64, 0.15, 0.07),
      ])
    case 'boss':
      return mergeParts([
        part(box(0.86, 0.82, 0.66), WHITE, [0, 0.62, 0]),
        part(box(0.54, 0.44, 0.48), WHITE, [0, 1.22, 0.06]),
        part(box(0.3, 0.72, 0.3), WHITE, [0.62, 0.62, 0.06]),
        part(box(0.3, 0.72, 0.3), WHITE, [-0.62, 0.62, 0.06]),
        part(box(0.32, 0.22, 0.36), DARK, [0.22, 0.11, 0]),
        part(box(0.32, 0.22, 0.36), DARK, [-0.22, 0.11, 0]),
        part(box(0.92, 0.14, 0.72), IRON, [0, 0.82, 0]),
        part(cone(0.1, 0.32, 5), GOLD, [0.22, 1.56, 0.06]),
        part(cone(0.1, 0.4, 5), GOLD, [0, 1.6, 0.06]),
        part(cone(0.1, 0.32, 5), GOLD, [-0.22, 1.56, 0.06]),
        ...eyes(1.28, 0.31, 0.13),
      ])
    default:
      return mergeParts([
        part(cylinder(0.2, 0.25, 0.42, 7), WHITE, [0, 0.27, 0]),
        part(ball(0.2, 1), WHITE, [0, 0.56, 0]),
        part(box(0.11, 0.12, 0.14), DARK, [0.11, 0.06, 0]),
        part(box(0.11, 0.12, 0.14), DARK, [-0.11, 0.06, 0]),
        ...eyes(0.6, 0.17, 0.075),
      ])
  }
}
