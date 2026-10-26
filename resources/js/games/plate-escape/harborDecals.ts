import * as THREE from 'three'

import craneRatingUrl from './assets/crane-load-rating.webp'
import lighthousePlaqueUrl from './assets/harbor-light-plaque.webp'
import lightshipNumberUrl from './assets/lightship-07.webp'
import boatNameUrl from './assets/pip-name.webp'
import chestMarkUrl from './assets/sea-chest-anchor.webp'
import type { Plate } from './level'

interface HarborDecal {
  level: number
  plate: string
  finish: Plate['finish']
  name: string
  url: string
  size: readonly [number, number]
  position: readonly [number, number]
}

const DECALS: readonly HarborDecal[] = [
  // PIP: x=-.85..-.53, outside the bait flap's x=-.5..+.5 sweep and
  // the transom head at (0, -.2), whose rim radius is .245.
  { level: 11, plate: 'transom', finish: 'hull', name: 'pip', url: boatNameUrl, size: [0.32, 0.19], position: [-0.69, -0.42] },
  // LIGHT: x=.36..1.12, clear of both stone-base screw rims.
  { level: 12, plate: 'base-front', finish: 'stone', name: 'light', url: lighthousePlaqueUrl, size: [0.76, 0.35], position: [0.74, -0.04] },
  // The left front x=-1.2..-.7 is clear of the central hasp/lock-plate
  // and its full vertical sweep, both front heads, and the end flap on +x.
  { level: 13, plate: 'front', finish: 'plank', name: 'anchor', url: chestMarkUrl, size: [0.5, 0.5], position: [-0.95, 0.1] },
  // Cab back x=0.25..0.85, y=-0.02..0.32:
  // right of the screw at (-.4, 0).
  // The slanted counterweight drops below this band before reaching its x;
  // the hook block and tower door are on other faces and below the cab.
  { level: 14, plate: 'cab-back', finish: 'guard', name: '5t', url: craneRatingUrl, size: [0.6, 0.34], position: [0.55, 0.15] },
  // Port lettering x=-1.325..-.375 is far from its head at (.9, 0).
  // The lantern shutter runs inside the hull (z<=.67); the stern flap's
  // entire hinge sweep stays at the opposite end, outside this face.
  { level: 15, plate: 'port', finish: 'hull', name: '07', url: lightshipNumberUrl, size: [0.95, 0.42], position: [-0.85, -0.02] },
]

/** Painted planes belong to their panel, but never take part in selection or covers. */
export function decorateHarborPlate(details: THREE.Group, plate: Plate, levelId?: number): void {
  const spec = DECALS.find((candidate) => candidate.level === levelId && candidate.plate === plate.id && candidate.finish === plate.finish)
  if (!spec) return

  const texture = typeof document === 'undefined' ? new THREE.Texture() : new THREE.TextureLoader().load(spec.url)
  texture.colorSpace = THREE.SRGBColorSpace
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(spec.size[0], spec.size[1]), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }))
  decal.name = `harbor-decal:${spec.name}`
  decal.position.set(spec.position[0], spec.position[1], 0.145)
  decal.raycast = () => {}
  details.add(decal)
}
