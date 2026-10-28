import * as THREE from 'three'

interface AtlasOptions {
  loader?: Pick<THREE.TextureLoader, 'load'>
  /** Sign bands keep their coloured backing until their lettering is ready. */
  hideUntilLoaded?: boolean
}

/** One shared texture lifetime, independent of floor geometry rebuilds. */
export function loadAtlas(materials: readonly THREE.MeshBasicMaterial[], url: string, { loader = new THREE.TextureLoader(), hideUntilLoaded = false }: AtlasOptions = {}): () => void {
  let disposed = false
  if (hideUntilLoaded) for (const material of materials) material.visible = false
  const texture = loader.load(url, loaded => {
    if (disposed) return
    loaded.colorSpace = THREE.SRGBColorSpace
    loaded.userData.cached = true
    for (const material of materials) {
      material.map = loaded
      material.visible = true
      material.needsUpdate = true
    }
  }, undefined, () => {
    if (disposed) return
    for (const material of materials) {
      material.map = null
      material.visible = !hideUntilLoaded
      material.needsUpdate = true
    }
  })
  texture.userData.cached = true
  return () => {
    if (disposed) return
    disposed = true
    for (const material of materials) {
      material.map = null
      material.visible = !hideUntilLoaded
      material.needsUpdate = true
    }
    texture.dispose()
  }
}
