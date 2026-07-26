import * as THREE from 'three'

type TextureMaterialKey =
  | 'alphaMap'
  | 'aoMap'
  | 'bumpMap'
  | 'clearcoatMap'
  | 'clearcoatNormalMap'
  | 'clearcoatRoughnessMap'
  | 'displacementMap'
  | 'emissiveMap'
  | 'envMap'
  | 'gradientMap'
  | 'iridescenceMap'
  | 'iridescenceThicknessMap'
  | 'lightMap'
  | 'map'
  | 'matcap'
  | 'metalnessMap'
  | 'normalMap'
  | 'roughnessMap'
  | 'sheenColorMap'
  | 'sheenRoughnessMap'
  | 'specularColorMap'
  | 'specularIntensityMap'
  | 'specularMap'
  | 'thicknessMap'
  | 'transmissionMap'

const MATERIAL_TEXTURE_KEYS: TextureMaterialKey[] = [
  'alphaMap',
  'aoMap',
  'bumpMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'gradientMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'lightMap',
  'map',
  'matcap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularColorMap',
  'specularIntensityMap',
  'specularMap',
  'thicknessMap',
  'transmissionMap',
]

export function clearGroup(group: THREE.Group): void {
  const children = [...group.children]
  for (const child of children) {
    group.remove(child)
    disposeObject(child)
  }
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) {
      mesh.geometry.dispose()
    }

    const material = mesh.material
    if (Array.isArray(material)) {
      for (const item of material) {
        disposeMaterial(item)
      }
    } else if (material) {
      disposeMaterial(material)
    }
  })
}

function disposeMaterial(material: THREE.Material): void {
  const textured = material as THREE.Material & Partial<Record<TextureMaterialKey, THREE.Texture | null>>
  for (const key of MATERIAL_TEXTURE_KEYS) {
    textured[key]?.dispose()
  }

  material.dispose()
}

export function findBoxId(object: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = object
  while (current) {
    const boxId = current.userData.boxId
    if (typeof boxId === 'string') {
      return boxId
    }

    current = current.parent
  }

  return null
}

export function createTextSprite(
  text: string,
  options: {
    background?: string
    color?: string
    fontSize?: number
    height?: number
    width?: number
  } = {},
): THREE.Sprite {
  const width = options.width ?? 256
  const height = options.height ?? 128
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create canvas context.')
  }

  context.clearRect(0, 0, width, height)
  if (options.background) {
    roundRect(context, 8, 8, width - 16, height - 16, 24)
    context.fillStyle = options.background
    context.fill()
  }
  context.font = `900 ${options.fontSize ?? 62}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineWidth = 10
  context.strokeStyle = '#111827'
  context.strokeText(text, width / 2, height / 2)
  context.fillStyle = options.color ?? '#ffffff'
  context.fillText(text, width / 2, height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true })

  return new THREE.Sprite(material)
}

export function createCanvasTexture(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create canvas context.')
  }

  draw(context, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  return texture
}

/**
 * A stadium (rounded rectangle whose corner radius may reach half the depth)
 * outline as a THREE.Shape/Path, centred on the origin in the XY plane.
 * Rotate the extruded geometry by +PI/2 around X to lay it flat: shape Y
 * becomes world Z and the extrusion depth extends downward from y = 0.
 */
export function stadiumPath<T extends THREE.Path>(path: T, width: number, depth: number, radius: number): T {
  const x = -width / 2
  const y = -depth / 2
  path.moveTo(x + radius, y)
  path.lineTo(x + width - radius, y)
  path.quadraticCurveTo(x + width, y, x + width, y + radius)
  path.lineTo(x + width, y + depth - radius)
  path.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth)
  path.lineTo(x + radius, y + depth)
  path.quadraticCurveTo(x, y + depth, x, y + depth - radius)
  path.lineTo(x, y + radius)
  path.quadraticCurveTo(x, y, x + radius, y)
  path.closePath()

  return path
}

export function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}
