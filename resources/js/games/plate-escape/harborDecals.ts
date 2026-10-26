import * as THREE from 'three'

import lighthousePlaqueUrl from './assets/harbor-light-plaque.webp'
import boatNameUrl from './assets/pip-name.webp'
import type { Plate } from './level'

/** Painted planes belong to their panel, but never take part in selection or covers. */
export function decorateHarborPlate(details: THREE.Group, plate: Plate, levelId?: number): void {
  const boat = levelId === 11 && plate.id === 'transom' && plate.finish === 'hull'
  const lantern = levelId === 12 && plate.id === 'base-front' && plate.finish === 'stone'
  if (!boat && !lantern) return

  // PIP fits the low outer stern corner, x=-.85..-.53, outside the flap's
  // x=-.5..+.5 sweep and the head at (0, -.2), whose rim radius is .245.
  // The plaque occupies x=.36..1.12, clear of both stone-base screw rims.
  const texture = typeof document === 'undefined' ? new THREE.Texture() : new THREE.TextureLoader().load(boat ? boatNameUrl : lighthousePlaqueUrl)
  texture.colorSpace = THREE.SRGBColorSpace
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(boat ? 0.32 : 0.76, boat ? 0.19 : 0.35), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }))
  decal.name = boat ? 'harbor-decal:pip' : 'harbor-decal:light'
  decal.position.set(boat ? -0.69 : 0.74, boat ? -0.42 : -0.04, 0.145)
  decal.raycast = () => {}
  details.add(decal)
}
