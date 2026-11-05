import * as THREE from 'three'

import { COLS, ROWS, type ThemeId } from '../gameTypes'
import { ball, box, cone, crystal, cylinder, mergeParts, part } from './parts'
import type { Theme } from './themes'

const INSTANCES_PER_KIND = 70
const SPREAD = 19
const BOARD_CLEARANCE = 1.1
/** Just below the water, which fills the board and would otherwise be buried. */
export const SURROUNDINGS_LEVEL = -0.22

function jitter(a: number, b: number): number {
  const value = Math.sin((a * 127.1) + (b * 311.7)) * 43758.5453

  return value - Math.floor(value)
}

const TRUNK = 0x6b4522

function pine(lower: number, upper: number, tip: number): THREE.BufferGeometry[] {
  return [
    part(cylinder(0.08, 0.12, 0.4, 5), TRUNK, [0, 0.2, 0]),
    part(cone(0.5, 0.66, 7), lower, [0, 0.62, 0]),
    part(cone(0.39, 0.56, 7), upper, [0, 1.0, 0]),
    part(cone(0.27, 0.46, 7), tip, [0, 1.34, 0]),
  ]
}

function roundTree(leaf: number, light: number): THREE.BufferGeometry[] {
  return [
    part(cylinder(0.08, 0.12, 0.56, 5), TRUNK, [0, 0.28, 0]),
    part(ball(0.44, 0), leaf, [0, 0.82, 0], [0.4, 0.2, 0]),
    part(ball(0.3, 0), light, [0.16, 1.1, 0.08], [0, 0.7, 0.2]),
    part(ball(0.26, 0), light, [-0.2, 0.96, -0.08], [0.6, 0, 0]),
  ]
}

function boulders(dark: number, light: number): THREE.BufferGeometry[] {
  return [
    part(ball(0.44, 0), dark, [0, 0.22, 0], [0.4, 0.2, 0], [1.2, 0.8, 1.05]),
    part(ball(0.24, 0), light, [0.22, 0.42, 0.12], [0.8, 0, 0.3]),
    part(ball(0.15, 0), dark, [-0.4, 0.1, 0.2]),
  ]
}

function deadTree(bark: number): THREE.BufferGeometry[] {
  return [
    part(cylinder(0.06, 0.13, 0.9, 5), bark, [0, 0.45, 0]),
    part(cylinder(0.025, 0.06, 0.48, 4), bark, [0.17, 0.92, 0], [0, 0, -0.75]),
    part(cylinder(0.025, 0.055, 0.42, 4), bark, [-0.14, 0.76, 0.04], [0.2, 0, 0.85]),
  ]
}

function kinds(themeId: ThemeId, theme: Theme): THREE.BufferGeometry[][] {
  switch (themeId) {
    case 'meadow':
      return [pine(0x5a9a26, 0x74b02e, 0x8fc63a), boulders(theme.rock, theme.rockTop), [part(ball(0.34, 0), 0x4d9428, [0, 0.22, 0], [0.5, 0.3, 0], [1.2, 0.85, 1.1]), part(ball(0.2, 0), 0x6cb034, [0.12, 0.42, 0.04]), ...[[0.2, 0.3, 0.22], [-0.2, 0.26, 0.2], [0.02, 0.44, -0.18], [0.3, 0.2, -0.1], [-0.1, 0.46, 0.14]].map(([x = 0, y = 0, z = 0]) => part(ball(0.055, 0), 0xdc2626, [x, y, z]))], roundTree(0x5fa52c, 0x82c23a)]
    case 'dunes':
      return [boulders(theme.rock, theme.rockTop), [part(cylinder(0.11, 0.14, 0.9, 7), 0x4d8a4a, [0, 0.45, 0]), part(cylinder(0.05, 0.06, 0.34, 6), 0x4d8a4a, [0.2, 0.56, 0], [0, 0, -1.2]), part(cylinder(0.05, 0.05, 0.3, 6), 0x5d9c58, [0.33, 0.74, 0]), part(cylinder(0.05, 0.05, 0.26, 6), 0x5d9c58, [-0.22, 0.62, 0], [0, 0, 1.1])], [part(cylinder(0.05, 0.1, 1.1, 5), 0x8d6e4b, [0.05, 0.55, 0], [0, 0, -0.1]), ...[0, 1, 2, 3, 4].map((index) => part(cone(0.12, 0.62, 3), 0x5d9c58, [0.1 + (Math.cos(index * 1.26) * 0.28), 1.06, Math.sin(index * 1.26) * 0.28], [Math.sin(index * 1.26) * 1.3, 0, -Math.cos(index * 1.26) * 1.3]))]]
    case 'tundra':
      return [pine(0x4f7f6b, 0xdce9ef, 0xffffff), pine(0x5d8b78, 0x6b9a88, 0xf1f7fa), boulders(theme.rock, theme.rockTop)]
    case 'ember':
      return [boulders(theme.rock, theme.rockTop), deadTree(0x241a18), [part(cone(0.3, 1.1, 5), theme.rock, [0, 0.5, 0], [0.1, 0, 0.08]), part(cone(0.18, 0.7, 5), theme.rockTop, [0.26, 0.32, 0.1], [0, 0, -0.15]), part(cone(0.14, 0.5, 5), 0xc2410c, [-0.2, 0.24, 0.1], [0, 0, 0.15])]]
    default:
      return [boulders(theme.rock, theme.rockTop), deadTree(0x262241), [part(crystal(0.2), 0xa78bfa, [0, 0.36, 0], [0.1, 0, 0.1], [0.8, 1.9, 0.8]), part(crystal(0.13), 0xc4b5fd, [0.22, 0.22, 0.05], [0, 0, -0.3], [0.8, 1.8, 0.8]), part(crystal(0.11), 0x8b5cf6, [-0.18, 0.18, 0.12], [0, 0, 0.35], [0.8, 1.8, 0.8]), part(box(0.5, 0.08, 0.5), theme.rock, [0, 0.04, 0])]]
  }
}

/** Fills the rest of a wide screen with the level's landscape, and frames the board. */
export function addScenery(scene: THREE.Scene, themeId: ThemeId, theme: Theme): void {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })
  const dummy = new THREE.Object3D()
  kinds(themeId, theme).forEach((parts, kind) => {
    const mesh = new THREE.InstancedMesh(mergeParts(parts), material, INSTANCES_PER_KIND)
    mesh.castShadow = true
    mesh.count = 0
    for (let index = 0; index < INSTANCES_PER_KIND; index += 1) {
      const u = jitter(index + (kind * 100), 3)
      const v = jitter(7, index + (kind * 100))
      const x = (u * (COLS + (SPREAD * 2))) - SPREAD
      const z = (v * (ROWS + (SPREAD * 2))) - SPREAD
      if (x > -BOARD_CLEARANCE && x < COLS + BOARD_CLEARANCE && z > -BOARD_CLEARANCE && z < ROWS + BOARD_CLEARANCE) {
        continue
      }
      dummy.position.set(x, SURROUNDINGS_LEVEL, z)
      dummy.rotation.set(0, jitter(index, kind + 5) * Math.PI * 2, 0)
      dummy.scale.setScalar(0.85 + (jitter(index, kind + 11) * 0.8))
      dummy.updateMatrix()
      mesh.setMatrixAt(mesh.count, dummy.matrix)
      mesh.count += 1
    }
    scene.add(mesh)
  })
}
