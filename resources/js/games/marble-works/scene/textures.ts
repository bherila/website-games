import * as THREE from 'three'

export function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) {
    draw(context)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4

  return texture
}

/** Deterministic pseudo-random sequence so procedural textures never flicker between rebuilds. */
export function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = ((state * 1103515245) + 12345) & 0x7fffffff

    return state / 0x7fffffff
  }
}
