import * as THREE from 'three'

import floorFinishesUrl from '../assets/floor-finishes.webp'

/**
 * Keep the plain vertex-colour materials until a complete image arrives.
 * One owner releases the shared atlas; floor rebuilds only release geometry.
 */
export function loadFloorAtlas(materials: readonly THREE.MeshBasicMaterial[], loader: Pick<THREE.TextureLoader, 'load'> = new THREE.TextureLoader()): () => void {
  let disposed = false
  const texture = loader.load(floorFinishesUrl, loaded => {
    if (disposed) return
    loaded.colorSpace = THREE.SRGBColorSpace
    loaded.userData.cached = true
    for (const material of materials) {
      material.map = loaded
      material.needsUpdate = true
    }
  }, undefined, () => {
    // Failed or unavailable image: leave the original colours visible.
    if (disposed) return
    for (const material of materials) {
      material.map = null
      material.needsUpdate = true
    }
  })
  texture.userData.cached = true
  return () => {
    if (disposed) return
    disposed = true
    for (const material of materials) {
      material.map = null
      material.needsUpdate = true
    }
    texture.dispose()
  }
}
