import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import {
  BOX_MARBLE_COUNT,
  MARBLE_COLOR_ABBREVIATIONS,
  MARBLE_COLORS,
  type MarbleBox,
} from '../../gameEngine'
import { gridCellPosition } from '../sceneGeometry'
import { createTextSprite } from '../threeUtils'
import { createMarbleMesh } from './marbleMesh'

interface BoxMeshOptions {
  displayHidden: boolean
  openable: boolean
}

const HIDDEN_COLOR = '#aab5c6'

/**
 * A marble box is a glossy tub. Openable tubs show their nine marbles under a
 * glass dome ("pop the jar"); blocked tubs are sealed with a solid lid so the
 * open-me affordance is unambiguous; mystery tubs are grey with a question
 * mark.
 */
export function createBoxMesh(box: MarbleBox, colorblindMode: boolean, options: BoxMeshOptions): THREE.Group {
  const group = new THREE.Group()
  if (options.openable) {
    group.userData.boxId = box.id
  }
  group.position.copy(gridCellPosition(box.position))

  const hex = options.displayHidden ? HIDDEN_COLOR : MARBLE_COLORS[box.color].hex
  const tub = new THREE.Mesh(
    new RoundedBoxGeometry(0.92, 0.3, 0.78, 5, 0.12),
    new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: 0.3,
      metalness: 0.0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.3,
    }),
  )
  tub.position.y = -0.07
  tub.castShadow = true
  tub.receiveShadow = true
  group.add(tub)

  if (options.displayHidden || !options.openable) {
    const lid = new THREE.Mesh(
      new RoundedBoxGeometry(0.96, 0.12, 0.82, 4, 0.06),
      new THREE.MeshPhysicalMaterial({
        color: darken(hex, 0.22),
        roughness: 0.35,
        metalness: 0.0,
        clearcoat: 0.6,
        clearcoatRoughness: 0.2,
        envMapIntensity: 0.3,
      }),
    )
    lid.position.y = 0.13
    lid.castShadow = true
    group.add(lid)

    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 12),
      new THREE.MeshPhysicalMaterial({
        color: darken(hex, 0.35),
        roughness: 0.3,
        clearcoat: 0.6,
        clearcoatRoughness: 0.2,
        envMapIntensity: 0.3,
      }),
    )
    knob.position.y = 0.22
    knob.castShadow = true
    group.add(knob)
  }

  if (options.displayHidden) {
    const sprite = createTextSprite('?', { fontSize: 190, height: 256, width: 256 })
    sprite.position.set(0, 0.38, 0)
    sprite.scale.set(0.58, 0.58, 1)
    sprite.material.depthTest = false
    sprite.renderOrder = 4
    group.add(sprite)

    return group
  }

  if (options.openable) {
    for (let index = 0; index < BOX_MARBLE_COUNT; index += 1) {
      const marble = createMarbleMesh(box.color, 0.095)
      const column = index % 3
      const row = Math.floor(index / 3)
      marble.position.set((column - 1) * 0.22, 0.17, (row - 1) * 0.18)
      group.add(marble)
    }

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.022, 10, 40),
      new THREE.MeshStandardMaterial({ color: '#f6fbff', roughness: 0.4 }),
    )
    rim.rotation.x = Math.PI / 2
    rim.position.y = 0.085
    group.add(rim)

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({
        color: '#eaf6ff',
        transparent: true,
        opacity: 0.2,
        roughness: 0.06,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMapIntensity: 0.9,
        depthWrite: false,
      }),
    )
    dome.scale.set(1.05, 0.82, 0.98)
    dome.position.y = 0.085
    dome.renderOrder = 2
    group.add(dome)
  }

  if (colorblindMode) {
    const label = createTextSprite(MARBLE_COLOR_ABBREVIATIONS[box.color], {
      background: '#ffffff',
      color: '#111827',
      fontSize: 64,
    })
    label.position.set(0.32, 0.34, -0.26)
    label.scale.set(0.22, 0.11, 1)
    label.renderOrder = 4
    group.add(label)
  }

  return group
}

function darken(hex: string, amount: number): string {
  const color = new THREE.Color(hex)
  color.lerp(new THREE.Color('#000000'), Math.max(0, Math.min(1, amount)))

  return `#${color.getHexString()}`
}
