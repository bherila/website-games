import * as THREE from 'three'

import floorFinishesUrl from '../assets/floor-finishes.webp'
import { loadAtlas } from './atlasMaterials'

/**
 * Keep the plain vertex-colour materials until a complete image arrives.
 * One owner releases the shared atlas; floor rebuilds only release geometry.
 */
export function loadFloorAtlas(materials: readonly THREE.MeshBasicMaterial[], loader: Pick<THREE.TextureLoader, 'load'> = new THREE.TextureLoader()): () => void {
  return loadAtlas(materials, floorFinishesUrl, { loader })
}
