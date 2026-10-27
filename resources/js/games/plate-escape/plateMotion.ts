import * as THREE from 'three'

import { PANEL_FACE } from './houseGeometry'
import type { Plate, PuzzleLevel, Rotor } from './level'
import { groundAt, type StageId, waterAt } from './stage'

const UP = new THREE.Vector3(0, 1, 0)
/** Roof slopes slide this far down their pitch before tipping off the eave. */
const ROOF_SLIDE = 0.8

/** How long a released plate stays on screen; it fades over the last FADE_SECONDS. */
export const FALL_SECONDS = 1.6
export const FADE_SECONDS = 0.4

export interface FallPose {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  /** Lying on the deck or lawn; the first such frame is the landing thud. */
  grounded: boolean
  /** Some of it has reached water; the first such frame is the splash. */
  wet: boolean
}

/** Points across both faces of the panel, so a wide part cannot sink between its corners. */
export function panelSamples(plate: Plate): THREE.Vector3[] {
  const [width, height] = plate.size
  const points: THREE.Vector3[] = []
  if (plate.outline) {
    for (const [x, y] of [[0, 0] as const, ...plate.outline]) for (const z of [-PANEL_FACE, PANEL_FACE]) points.push(new THREE.Vector3(x, y, z))
    return points
  }
  for (const x of [-width / 2, 0, width / 2]) for (const y of [-height / 2, 0, height / 2 + (plate.gableRise ?? 0)]) for (const z of [-PANEL_FACE, PANEL_FACE]) {
    points.push(new THREE.Vector3(x, y, z))
  }
  return points
}

interface Carried { position: THREE.Vector3, quaternion: THREE.Quaternion, clearance: number, flat: boolean }

/** The tip, slide and outward push without gravity, and how far the lowest point sits above the ground. */
function carried(plate: Plate, position: THREE.Vector3, quaternion: THREE.Quaternion, t: number, stage: StageId): Carried {
  const roof = plate.finish.includes('roof')
  const up = UP.clone().applyQuaternion(quaternion)
  // A part lying flat, such as a seat or a deck, simply drops.
  if (Math.abs(new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).y) > 0.95) {
    let clearance = Infinity
    for (const sample of panelSamples(plate)) {
      const point = sample.applyQuaternion(quaternion).add(position)
      clearance = Math.min(clearance, point.y - groundAt(point.x, point.z, stage))
    }
    return { position: position.clone(), quaternion: quaternion.clone(), clearance, flat: true }
  }
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
    clearance = Math.min(clearance, point.y - groundAt(point.x, point.z, stage))
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
export function fallPose(plate: Plate, position: THREE.Vector3, quaternion: THREE.Quaternion, elapsed: number, stage: StageId = 'garden'): FallPose {
  // The replay costs one substep per 1/120 s, so it stops where the part leaves the screen.
  const t = Math.min(elapsed, FALL_SECONDS)
  let drop = 0
  let speed = 0
  let resting = false
  let pose = carried(plate, position, quaternion, 0, stage)
  for (let time = 0; time < t;) {
    const step = Math.min(STEP, t - time)
    time += step
    pose = carried(plate, position, quaternion, time, stage)
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
  const wet = t > 0 && panelSamples(plate).some((sample) => {
    const point = sample.applyQuaternion(pose.quaternion).add(pose.position)
    const water = waterAt(point.x, point.z, stage)
    return water !== undefined && point.y <= water
  })
  return { position: pose.position, quaternion: pose.quaternion, grounded: t > 0 && resting && pose.flat, wet }
}

/** A captive panel swings this far open, nearly flat against the wall beside its hinge. */
export const HINGE_OPEN = Math.PI * 0.9
export const HINGE_SECONDS = 0.7

const HINGES: Record<NonNullable<Plate['hinge']>, { edge: (size: Plate['size']) => THREE.Vector3, axis: THREE.Vector3, sign: number }> = {
  left: { edge: ([width]) => new THREE.Vector3(-width / 2, 0, 0), axis: new THREE.Vector3(0, 1, 0), sign: -1 },
  right: { edge: ([width]) => new THREE.Vector3(width / 2, 0, 0), axis: new THREE.Vector3(0, 1, 0), sign: 1 },
  top: { edge: ([, height]) => new THREE.Vector3(0, height / 2, 0), axis: new THREE.Vector3(1, 0, 0), sign: -1 },
  bottom: { edge: ([, height]) => new THREE.Vector3(0, -height / 2, 0), axis: new THREE.Vector3(1, 0, 0), sign: 1 },
}

/**
 * A hinged panel `t` seconds after its last screw left: it swings outward about
 * its hinge edge and stays there. The edge runs through the panel's centre
 * plane, so the open panel still sits in front of its wall.
 */
export function hingePose(plate: Plate, position: THREE.Vector3, quaternion: THREE.Quaternion, t: number): { position: THREE.Vector3, quaternion: THREE.Quaternion } {
  const hinge = HINGES[plate.hinge!]
  const progress = Math.min(1, Math.max(0, t / HINGE_SECONDS))
  const angle = hinge.sign * (plate.hingeAngle ?? HINGE_OPEN) * (1 - (1 - progress) ** 3)
  const swing = new THREE.Quaternion().setFromAxisAngle(hinge.axis, angle)
  const edge = hinge.edge(plate.size)
  const offset = edge.clone().sub(edge.clone().applyQuaternion(swing)).applyQuaternion(quaternion)
  return { position: position.clone().add(offset), quaternion: quaternion.clone().multiply(swing) }
}

/** A freed shutter drops down its rail under gravity and stops at the end of its travel. */
export const RAIL_SECONDS = 0.4

export function railPose(plate: Plate, position: THREE.Vector3, quaternion: THREE.Quaternion, t: number): { position: THREE.Vector3, quaternion: THREE.Quaternion } {
  const progress = Math.min(1, Math.max(0, t / RAIL_SECONDS)) ** 2
  const along = new THREE.Vector3().fromArray(plate.rail!.along).normalize()
  return { position: position.clone().addScaledVector(along, plate.rail!.travel * progress), quaternion: quaternion.clone() }
}

/** Where a hinged or railed part comes to rest: the end of its swing or of its rail. */
export function restingPose(plate: Plate, position: THREE.Vector3, quaternion: THREE.Quaternion): { position: THREE.Vector3, quaternion: THREE.Quaternion } {
  return plate.hinge ? hingePose(plate, position, quaternion, HINGE_SECONDS) : railPose(plate, position, quaternion, RAIL_SECONDS)
}

/**
 * Parts whose resting place a dashed outline shows before they move: a captive
 * cover, a part a counterweight drives, and the counterweight itself.
 */
export function outlinedPlates(level: Pick<PuzzleLevel, 'plates' | 'screws'>): Plate[] {
  return level.plates.filter((plate) => plate.drivenBy || level.plates.some((other) => other.drivenBy === plate.id)
    || level.screws.some((screw) => screw.coveredWhenOpen?.includes(plate.id)))
}

/** Turns a part's pose `angle` radians about the rotor's axis. */
export function rotorPose(rotor: Rotor, position: THREE.Vector3, quaternion: THREE.Quaternion, angle: number): { position: THREE.Vector3, quaternion: THREE.Quaternion } {
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().fromArray(rotor.axis).normalize(), angle)
  const center = new THREE.Vector3().fromArray(rotor.center)
  return { position: position.clone().sub(center).applyQuaternion(turn).add(center), quaternion: turn.multiply(quaternion) }
}

/** A rotor coasts to a stop within this long of the player reaching for the board. */
export const ROTOR_STOP_SECONDS = 0.5
/** And it picks up again this gently once they have left it alone. */
export const ROTOR_START_SECONDS = 1.5
export const ROTOR_IDLE_SECONDS = 4

/** The rotor's angular speed after `dt` seconds of easing toward `target` (0 to stop). */
export function nextRotorSpeed(rotor: Rotor, speed: number, target: number, dt: number): number {
  const full = Math.PI * 2 / rotor.period
  if (target < speed) return Math.max(target, speed - full / ROTOR_STOP_SECONDS * dt)
  return Math.min(target, speed + full / ROTOR_START_SECONDS * dt)
}
