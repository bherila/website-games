import * as THREE from 'three'

/**
 * Builds a square canvas texture from a draw callback. Used for the cheap procedural
 * stripe/accent looks on block faces and cannon/tent decoration (never real asset files).
 */
export function createCanvasTexture(
  draw: (context: CanvasRenderingContext2D, size: number) => void,
  size = 128,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create canvas context.')
  }

  draw(context, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true

  return texture
}

export function hexToCssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`
}
