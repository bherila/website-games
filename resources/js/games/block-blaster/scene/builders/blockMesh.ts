import * as THREE from 'three'

import { BLOCK_CATALOG, type BlockType } from '../../levels/levelTypes'
import { createCanvasTexture, hexToCssColor } from '../threeUtils'

export type BlockPattern = 'badge' | 'chisel' | 'flat' | 'frame' | 'trim' | 'zigzag'

export interface BlockVisualSpec {
  shape: 'box' | 'cylinder'
  size: [number, number, number]
  baseColor: number
  accentColor: number
  pattern: BlockPattern
}

const PATTERN_BY_TYPE: Record<BlockType, BlockPattern> = {
  crate: 'frame',
  smallCube: 'flat',
  beam: 'zigzag',
  plank: 'trim',
  barrel: 'badge',
  stone: 'chisel',
}

/**
 * Pure per-type visual spec (size/colors/pattern), sourced from BLOCK_CATALOG. Kept separate from
 * `createBlockMesh` so it can be unit-tested without a canvas/renderer (see blockMesh.test.ts).
 */
export function blockVisualSpec(type: BlockType): BlockVisualSpec {
  const catalog = BLOCK_CATALOG[type]

  return {
    shape: catalog.shape,
    size: catalog.size,
    baseColor: catalog.color,
    accentColor: catalog.accentColor,
    pattern: PATTERN_BY_TYPE[type],
  }
}

function drawPattern(context: CanvasRenderingContext2D, size: number, spec: BlockVisualSpec): void {
  const base = hexToCssColor(spec.baseColor)
  const accent = hexToCssColor(spec.accentColor)
  context.fillStyle = base
  context.fillRect(0, 0, size, size)

  switch (spec.pattern) {
    case 'frame': {
      const border = size * 0.12
      context.strokeStyle = accent
      context.lineWidth = border
      context.strokeRect(border / 2, border / 2, size - border, size - border)
      break
    }
    case 'zigzag': {
      const bandHeight = size * 0.28
      const bandY = (size - bandHeight) / 2
      context.fillStyle = accent
      context.beginPath()
      context.moveTo(0, bandY)
      const teeth = 6
      const step = size / teeth
      for (let i = 0; i <= teeth; i += 1) {
        const x = i * step
        const y = i % 2 === 0 ? bandY : bandY + bandHeight * 0.4
        context.lineTo(x, y)
      }
      for (let i = teeth; i >= 0; i -= 1) {
        const x = i * step
        const y = i % 2 === 0 ? bandY + bandHeight : bandY + bandHeight * 0.6
        context.lineTo(x, y)
      }
      context.closePath()
      context.fill()
      break
    }
    case 'trim': {
      const trim = size * 0.1
      context.fillStyle = accent
      context.fillRect(0, 0, size, trim)
      context.fillRect(0, size - trim, size, trim)
      break
    }
    case 'badge': {
      context.fillStyle = accent
      context.beginPath()
      context.arc(size / 2, size / 2, size * 0.28, 0, Math.PI * 2)
      context.fill()
      break
    }
    case 'chisel': {
      context.strokeStyle = accent
      context.lineWidth = size * 0.02
      const facets = 4
      for (let i = 1; i < facets; i += 1) {
        const offset = (size / facets) * i
        context.beginPath()
        context.moveTo(offset, 0)
        context.lineTo(offset - size * 0.08, size)
        context.stroke()
      }
      break
    }
    case 'flat':
    default:
      break
  }
}

/**
 * Builds a per-type block mesh centered at the origin, sized/colored from BLOCK_CATALOG, with a
 * cheap canvas stripe/accent texture matching the spec's "block catalog" table. Callers mirror the
 * physics body's world position/quaternion onto this mesh each frame (see BlockBlasterScene).
 */
export function createBlockMesh(type: BlockType): THREE.Mesh {
  const spec = blockVisualSpec(type)
  const texture = createCanvasTexture((context, size) => drawPattern(context, size, spec))
  const material = new THREE.MeshLambertMaterial({ map: texture, transparent: true })

  const geometry = spec.shape === 'cylinder'
    ? new THREE.CylinderGeometry(spec.size[0] / 2, spec.size[0] / 2, spec.size[1], 16)
    : new THREE.BoxGeometry(spec.size[0], spec.size[1], spec.size[2])

  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true

  return mesh
}
