import * as THREE from 'three'

/**
 * How glass is drawn. `refractive` uses `transmission`, which costs a second render of the
 * whole board every frame (three.js renders the opaque scene into a buffer to bend through
 * the glass). `lite` draws the same materials as tinted, glossy, see-through glass without
 * that pass. Software-rendered browsers start in `lite`; a device that cannot hold a
 * playable frame rate in `refractive` drops to `lite` after its first frames.
 */
export type GlassQuality = 'refractive' | 'lite'

interface GlassUserData {
  transmission: number
  transparent: boolean
  opacity: number
  liteOpacity: number
}

/** Marks a material as glass; under `lite` it is drawn at `liteOpacity` instead of refracting. */
export function markGlass<T extends THREE.MeshPhysicalMaterial>(material: T, liteOpacity: number): T {
  const glass: GlassUserData = { transmission: material.transmission, transparent: material.transparent, opacity: material.opacity, liteOpacity }
  material.userData.glass = glass

  return material
}

/** Applies `quality` to one material (a no-op unless it was marked with `markGlass`). */
export function setMaterialQuality(material: THREE.Material, quality: GlassQuality): void {
  const glass = material.userData.glass as GlassUserData | undefined
  if (!glass || !(material instanceof THREE.MeshPhysicalMaterial)) {
    return
  }
  const lite = quality === 'lite'
  const transmission = lite ? 0 : glass.transmission
  const transparent = lite ? true : glass.transparent
  if (material.transmission === transmission && material.transparent === transparent) {
    return
  }
  material.transmission = transmission
  material.transparent = transparent
  material.opacity = lite ? glass.liteOpacity : glass.opacity
  material.depthWrite = !lite
  material.needsUpdate = true
}

/** Applies `quality` to every glass material under `root`. */
export function applyGlassQuality(root: THREE.Object3D, quality: GlassQuality): void {
  root.traverse((object) => {
    const { material } = object as THREE.Mesh
    if (Array.isArray(material)) {
      material.forEach((entry) => setMaterialQuality(entry, quality))
    } else if (material) {
      setMaterialQuality(material, quality)
    }
  })
}

/** Whether WebGL is running on a CPU rasteriser (no GPU), where refraction is unaffordable. */
export function isSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))

  return /swiftshader|llvmpipe|softpipe|software/i.test(name)
}

/** Frames sampled before deciding whether refraction is affordable. */
export const QUALITY_SAMPLE_FRAMES = 30
/** Median frame time above which refraction is dropped (about 22 fps). */
export const QUALITY_SLOW_FRAME_S = 0.045

/** Median of the sampled frame times. */
export function medianFrameTime(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b)

  return sorted[Math.floor(sorted.length / 2)] ?? 0
}
