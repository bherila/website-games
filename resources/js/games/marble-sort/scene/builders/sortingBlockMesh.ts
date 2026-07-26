import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import {
  MARBLE_COLOR_ABBREVIATIONS,
  MARBLE_COLORS,
  SORTING_BLOCK_CAPACITY,
  type SortingBlock,
  type SortingStack,
} from '../../gameEngine'
import {
  SORTING_STACK_BLOCK_DEPTH,
  SORTING_STACK_VISIBLE_BLOCKS,
} from '../sceneConstants'
import {
  sortingStackBlockOffset,
  sortingStackColumnPosition,
  sortingStackSpacing,
} from '../sceneGeometry'
import { createTextSprite } from '../threeUtils'

const BLOCK_MAX_WIDTH = 1.0
const BLOCK_HEIGHT = 0.4
const BLOCK_GAP = 0.1
const STUD_MAX_RADIUS = 0.14

/**
 * Blocks must never be wider than the per-stack column spacing, or adjacent
 * stacks visually overlap on levels with many colors.
 */
export function sortingBlockWidth(totalStacks: number): number {
  return Math.min(BLOCK_MAX_WIDTH, sortingStackSpacing(totalStacks) - BLOCK_GAP)
}

export function createSortingStackMesh(
  stack: SortingStack,
  totalStacks: number,
  colorblindMode: boolean,
): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(sortingStackColumnPosition(stack.index, totalStacks))
  group.userData.stackId = stack.id
  group.userData.stackIndex = stack.index
  const blockWidth = sortingBlockWidth(totalStacks)

  if (stack.blocks.length === 0) {
    const lane = new THREE.Mesh(
      new THREE.BoxGeometry(blockWidth, 0.06, SORTING_STACK_BLOCK_DEPTH * 1.4),
      new THREE.MeshStandardMaterial({ color: '#cfc4a2', roughness: 0.85 }),
    )
    lane.position.set(0, 0.04, 0)
    lane.receiveShadow = true
    group.add(lane)

    return group
  }

  const visible = stack.blocks.slice(0, SORTING_STACK_VISIBLE_BLOCKS)
  visible.forEach((block, depth) => {
    const blockGroup = createSortingBlockMesh(block, depth === 0, blockWidth)
    blockGroup.position.copy(sortingStackBlockOffset(depth))
    blockGroup.userData.blockId = block.id
    blockGroup.userData.depth = depth
    group.add(blockGroup)
  })

  if (colorblindMode) {
    const topBlock = stack.blocks[0]
    if (topBlock) {
      const label = createTextSprite(MARBLE_COLOR_ABBREVIATIONS[topBlock.color], {
        background: '#ffffff',
        color: '#111827',
        fontSize: 62,
      })
      label.position.set(blockWidth * 0.36, 0.52, 0.06)
      label.scale.set(0.22, 0.11, 1)
      group.add(label)
    }
  }

  return group
}

export function createSortingBlockMesh(
  block: SortingBlock,
  isActive: boolean,
  blockWidth = BLOCK_MAX_WIDTH,
): THREE.Group {
  const group = new THREE.Group()
  const hex = MARBLE_COLORS[block.color].hex
  const widthScale = blockWidth / BLOCK_MAX_WIDTH
  const studRadius = STUD_MAX_RADIUS * Math.min(1, widthScale * 1.15)
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(blockWidth, BLOCK_HEIGHT, SORTING_STACK_BLOCK_DEPTH, 5, Math.min(0.12, blockWidth * 0.2)),
    new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: 0.28,
      metalness: 0.0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.3,
    }),
  )
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const rim = new THREE.Mesh(
    new RoundedBoxGeometry(blockWidth * 0.985, BLOCK_HEIGHT * 0.3, SORTING_STACK_BLOCK_DEPTH * 0.985, 3, 0.04),
    new THREE.MeshPhysicalMaterial({
      color: darken(hex, 0.28),
      roughness: 0.5,
      metalness: 0.0,
      clearcoat: 0.4,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.25,
    }),
  )
  rim.position.y = -BLOCK_HEIGHT / 2 + 0.04
  group.add(rim)

  if (isActive) {
    for (let slot = 0; slot < SORTING_BLOCK_CAPACITY; slot += 1) {
      const filled = slot < block.slotsFilled
      const dimpleX = (slot - 1) * 0.28 * widthScale
      const dimpleY = BLOCK_HEIGHT / 2 + 0.005
      const dimple = new THREE.Mesh(
        new THREE.CylinderGeometry(studRadius * 0.92, studRadius * 0.78, 0.04, 24),
        new THREE.MeshStandardMaterial({ color: darken(hex, 0.55), roughness: 0.65 }),
      )
      dimple.position.set(dimpleX, dimpleY, 0)
      group.add(dimple)

      if (filled) {
        const marble = new THREE.Mesh(
          new THREE.SphereGeometry(studRadius * 0.92, 22, 14),
          new THREE.MeshPhysicalMaterial({
            color: hex,
            roughness: 0.2,
            metalness: 0.0,
            clearcoat: 0.6,
            clearcoatRoughness: 0.15,
            envMapIntensity: 0.4,
          }),
        )
        marble.position.set(dimpleX, dimpleY + studRadius * 0.55, 0)
        marble.castShadow = true
        group.add(marble)
        const highlight = new THREE.Mesh(
          new THREE.SphereGeometry(studRadius * 0.3, 12, 8),
          new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }),
        )
        highlight.position.set(dimpleX - studRadius * 0.3, dimpleY + studRadius * 0.85, studRadius * 0.3)
        group.add(highlight)
      }
    }
  }

  return group
}

function darken(hex: string, amount: number): string {
  const color = new THREE.Color(hex)
  color.lerp(new THREE.Color('#000000'), Math.max(0, Math.min(1, amount)))

  return `#${color.getHexString()}`
}
