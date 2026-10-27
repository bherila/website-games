import * as THREE from 'three'

import basketBalloonUrl from './assets/basket-balloon.webp'
import carouselWhirlUrl from './assets/carousel-whirl.webp'
import craneRatingUrl from './assets/crane-load-rating.webp'
import cuckooBirdUrl from './assets/cuckoo-bird.webp'
import floatFairUrl from './assets/float-fair.webp'
import gatehouseCrownUrl from './assets/gatehouse-crown.webp'
import gramophone78Url from './assets/gramophone-78.webp'
import lighthousePlaqueUrl from './assets/harbor-light-plaque.webp'
import liftUpUrl from './assets/lift-up.webp'
import lightshipNumberUrl from './assets/lightship-07.webp'
import locomotive20Url from './assets/locomotive-20.webp'
import musicBoxNoteUrl from './assets/music-box-note.webp'
import boatNameUrl from './assets/pip-name.webp'
import robot25Url from './assets/robot-25.webp'
import chestMarkUrl from './assets/sea-chest-anchor.webp'
import signalBoxSignUrl from './assets/signal-box-sign.webp'
import stationStopUrl from './assets/station-stop.webp'
import theaterTicketsUrl from './assets/theater-tickets.webp'
import toyEngine16Url from './assets/toy-engine-16.webp'
import wheelRideUrl from './assets/wheel-ride.webp'
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
  // Lower boiler side y=-.79..-.31, below its head at (0, .2).
  // The smokebox dial and all of its windows turn on the perpendicular front.
  { level: 16, plate: 'side-right', finish: 'loco', name: 'toy-engine-16', url: toyEngine16Url, size: [0.9, 0.48], position: [0, -0.55] },
  // Upper-right front x=.625..1.175 is beyond the tune disc's right rim (.4),
  // its windows at every stop, and its pin; y=.375...925 clears the front head
  // at (1, -.3) and stays below the lid throughout its upward hinge sweep.
  { level: 17, plate: 'front', finish: 'lacquer', name: 'music-box-note', url: musicBoxNoteUrl, size: [0.55, 0.55], position: [0.9, 0.65] },
  // Side band y=.69..1.01 is above both head rims (highest centre y=.3).
  // The clock and every window position lie on the perpendicular front.
  { level: 18, plate: 'right', finish: 'loco', name: 'station-stop', url: stationStopUrl, size: [1.2, 0.32], position: [0, 0.85] },
  // Front x=-.125..+.825, y=.75..1.01 is above the selector (top .6)
  // and diagonal brace, below the upper ledge (bottom 1.03), and right of
  // the pin at (-.6, .9). The shutter rails down the opposite back face.
  { level: 19, plate: 'front', finish: 'plank', name: 'signal-box-sign', url: signalBoxSignUrl, size: [0.95, 0.26], position: [0.35, 0.88] },
  // Lower engine side y=-.765..-.335 clears its head at (0, .2).
  // The smokebox windows face +x; the tender hatch's full sweep stays at -x.
  { level: 20, plate: 'engine-near', finish: 'loco', name: 'locomotive-20', url: locomotive20Url, size: [0.95, 0.43], position: [0, -0.55] },
  // Right-front x=.575..1.025 clears the clock's .455 bezel and sits between
  // heads at (.8, .55)/(.75, -.75). Door x=0 and weight x=-.75 travel elsewhere.
  { level: 21, plate: 'front', finish: 'clock', name: 'cuckoo-bird', url: cuckooBirdUrl, size: [0.45, 0.45], position: [0.8, -0.12] },
  // Right strip x=.71..1.09 clears the gate's full x=-.4..+.6 sweep
  // including its bevel; between right heads at y=.85/-.9. Weights run left.
  { level: 22, plate: 'front', finish: 'case', name: 'lift-up', url: liftUpUrl, size: [0.38, 0.38], position: [0.9, -0.03] },
  // Right wall y=-.28...08 is between heads at (0, .5)/(0, -.7).
  // The drawbridge hinge sweep and counterweight rail stay on the front face.
  { level: 23, plate: 'right', finish: 'stone', name: 'gatehouse-crown', url: gatehouseCrownUrl, size: [0.65, 0.36], position: [0, -0.1] },
  // Front x=.55..1.15 is right of the collar's full rim (x=.3), including
  // every window stop, and between heads at (.9, .6)/(.9, -.7).
  // The counterweight and record hatch move on the opposite back face.
  { level: 24, plate: 'front', finish: 'case', name: 'gramophone-78', url: gramophone78Url, size: [0.6, 0.28], position: [0.85, -0.05] },
  // Lower-left chest x=-.825..-.175, y=-.61..-.29 clears both head rims.
  // The visor's lowest edge lands at chest-local y=.325, above this band;
  // the drive weight and spring-box hatch both travel on the back.
  { level: 25, plate: 'chest', finish: 'tin', name: 'robot-25', url: robot25Url, size: [0.65, 0.32], position: [-0.5, -0.45] },
  // Board x=-.975...275 leaves .475 to its head at (.75, -.05), between
  // the trim rows. The rack is lower and on the perpendicular drum side.
  { level: 26, plate: 'board-front', finish: 'rounding', name: 'carousel-whirl', url: carouselWhirlUrl, size: [1.25, 0.3], position: [-0.35, 0] },
  // Rear basket x=-.225..+.225, y=-.5..+.3 sits between both head rims
  // with .375 clearance and below the rolled rim. The skid, rack and full
  // sign rail sweep/landing stay on the opposite front face.
  { level: 27, plate: 'basket-back', finish: 'wicker', name: 'basket-balloon', url: basketBalloonUrl, size: [0.45, 0.8], position: [0, -0.1] },
  // Header x=-1.3...5 lies between the frame bolts and left of its pin.
  // Its world y=1.15..1.55 is above the collar's entire rim/windows (top .97)
  // at every stop; the rack sits below the collar, off this header band.
  { level: 28, plate: 'header', finish: 'proscenium', name: 'theater-tickets', url: theaterTicketsUrl, size: [1.8, 0.4], position: [-0.4, 0.15] },
  // Bottom-centre y=-1.41..-1.09 is below the collar/window ring (radius .82),
  // between rim heads and inside the decorative bulb/rim rings. The rack is
  // upper-left; the left gondola's full rail sweep stays at x<-.75 and the
  // right gondola at x>.87, outside x=-.45..+.45.
  { level: 29, plate: 'wheel', finish: 'ferris', name: 'wheel-ride', url: wheelRideUrl, size: [0.9, 0.32], position: [0, -1.25] },
  // Garland x=-.5...5 clears the shared heads at (+/-.9, 0) and edge trim.
  // Clock windows and rack face the sides; weight and driven hatch run behind
  // the opposite arch, so none of their sweeps or landings cross this board.
  { level: 30, plate: 'garland', finish: 'banner', name: 'float-fair', url: floatFairUrl, size: [1, 0.32], position: [0, 0] },
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
