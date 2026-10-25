import * as THREE from 'three'

import { PANEL_FACE } from './houseGeometry'
import type { Plate } from './level'

const UP = new THREE.Vector3(0, 1, 0)
/** Foundation deck and lawn tops from createGarden; beyond the lawn a part falls freely. */
const DECK = { halfX: 1.97, halfZ: 1.44, top: -1.55 }
const LAWN = { radius: 2.8, top: -1.76 }
/** Roof slopes slide this far down their pitch before tipping off the eave. */
const ROOF_SLIDE = 0.8

export function groundAt(x: number, z: number): number {
  if (Math.abs(x) <= DECK.halfX && Math.abs(z) <= DECK.halfZ) return DECK.top
  return Math.hypot(x, z) <= LAWN.radius ? LAWN.top : -Infinity
}

/** How long a released plate stays on screen; it fades over the last FADE_SECONDS. */
export const FALL_SECONDS = 1.6
export const FADE_SECONDS = 0.4

export interface FallPose {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  /** Lying on the deck or lawn; the first such frame is the landing thud. */
  grounded: boolean
}

/** Points across both faces of the panel, so a wide part cannot sink between its corners. */
export function panelSamples(plate: Plate): THREE.Vector3[] {
  const [width, height] = plate.size
  const points: THREE.Vector3[] = []
  for (const x of [-width / 2, 0, width / 2]) for (const y of [-height / 2, 0, height / 2 + (plate.gableRise ?? 0)]) for (const z of [-PANEL_FACE, PANEL_FACE]) {
    points.push(new THREE.Vector3(x, y, z))
  }
  return points
}

interface Carried { position: THREE.Vector3, quaternion: THREE.Quaternion, clearance: number, flat: boolean }

/** The tip, slide and outward push without gravity, and how far the lowest point sits above the ground. */
function carried(plate: Plate, position: THREE.Vector3, quaternion: THREE.Quaternion, t: number): Carried {
  const roof = plate.finish.includes('roof')
  const up = UP.clone().applyQuaternion(quaternion)
  const outward = roof ? up.clone().negate() : new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion)
  outward.y = 0
  if (outward.lengthSq() < 1e-6) outward.set(0, 0, 1)
  outward.normalize()
  const slideTime = roof ? Math.sqrt(ROOF_SLIDE / 3) : 0
  const slide = 3 * Math.min(t, slideTime) ** 2
  const tumble = Math.max(0, t - slideTime)
  const tip = Math.min(Math.PI / 2, Math.PI / 2 * (tumble / 0.55) ** 2)
  // Tip about the bottom edge, which has already slid down the slope.
  const pivot = position.clone().addScaledVector(up, -plate.size[1] / 2 - slide)
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(UP, outward).normalize(), tip)
  const next = position.clone().addScaledVector(up, -slide).sub(pivot).applyQuaternion(turn).add(pivot).addScaledVector(outward, 1.2 * tumble ** 2)
  const rotated = turn.multiply(quaternion)
  let clearance = Infinity
  for (const sample of panelSamples(plate)) {
    const point = sample.applyQuaternion(rotated).add(next)
    clearance = Math.min(clearance, point.y - groundAt(point.x, point.z))
  }
  return { position: next, quaternion: rotated, clearance, flat: tip === Math.PI / 2 }
}

/** Fixed substep, so the fall is identical at any frame rate. */
const STEP = 1 / 120

/**
 * Where a released plate is `t` seconds into its fall, starting from the pose
 * it hung in. Walls tip outward about their bottom edge, roof slopes slide down
 * the pitch first, and raised covers drop. Gravity pulls each part onto
 * whatever deck or lawn is beneath it, never through it, and it slides outward
 * until it drops off the garden's edge. Recomputed from release each frame, so
 * undo needs no simulation state.
 */
export function fallPose(plate: Plate, position: THREE.Vector3, quaternion: THREE.Quaternion, elapsed: number): FallPose {
  // The replay costs one substep per 1/120 s, so it stops where the part leaves the screen.
  const t = Math.min(elapsed, FALL_SECONDS)
  let drop = 0
  let speed = 0
  let resting = false
  let pose = carried(plate, position, quaternion, 0)
  for (let time = 0; time < t;) {
    const step = Math.min(STEP, t - time)
    time += step
    pose = carried(plate, position, quaternion, time)
    speed += 9.8 * step
    drop += speed * step
    // Contact: rest on the ground (or be lifted by a tipping edge) and lose the fall speed.
    resting = drop >= pose.clearance
    if (resting) {
      drop = pose.clearance
      speed = 0
    }
  }
  pose.position.y -= drop
  return { position: pose.position, quaternion: pose.quaternion, grounded: t > 0 && resting && pose.flat }
}
