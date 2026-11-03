import * as THREE from 'three'

/** A soft round dot; drawn additively, it turns a flat shot or spark into a point of light. */
export function createGlowTexture(): THREE.Texture | null {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.55)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  return texture
}

export function createGlowMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: createGlowTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
}

/** A soft-edged disc; overlapping copies blend into one worn dirt path. */
export function createDiscTexture(): THREE.Texture | null {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.55, 'rgba(255,255,255,1)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)

  return new THREE.CanvasTexture(canvas)
}

/** The spiral inside a portal. */
export function createSwirlTexture(): THREE.Texture | null {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  const middle = size / 2
  const backdrop = context.createRadialGradient(middle, middle, 0, middle, middle, middle)
  backdrop.addColorStop(0, '#f0abfc')
  backdrop.addColorStop(0.45, '#9333ea')
  backdrop.addColorStop(1, '#3b0764')
  context.fillStyle = backdrop
  context.arc(middle, middle, middle, 0, Math.PI * 2)
  context.fill()
  context.lineCap = 'round'
  for (let arm = 0; arm < 3; arm += 1) {
    context.strokeStyle = 'rgba(245,208,254,0.85)'
    context.lineWidth = 5
    context.beginPath()
    for (let step = 0; step <= 40; step += 1) {
      const turn = step / 40
      const angle = (arm * (Math.PI * 2) / 3) + (turn * Math.PI * 2.4)
      const radius = turn * middle * 0.92
      context.lineTo(middle + (Math.cos(angle) * radius), middle + (Math.sin(angle) * radius))
    }
    context.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  return texture
}
