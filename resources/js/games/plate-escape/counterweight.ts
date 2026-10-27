import * as THREE from 'three'

import type { Plate } from './level'

/** The cord is drawn as a thin rod, so it reads on a phone where a one-pixel line would not. */
export const CORD_RADIUS = 0.03
/** A pulley wheel's radius; its axle is fixed to the host. */
export const PULLEY_RADIUS = 0.09

/**
 * Where the cord is tied to a part, in its own X/Y on its centre plane: the top
 * of a weight, the middle of a hinged part's free edge, or the leading edge of
 * a part that slides along a rail, so the cord pulls the way the part moves.
 */
export function cordAnchor(plate: Plate, quaternion: THREE.Quaternion): THREE.Vector3 {
  const [width, height] = plate.size
  if (plate.drivenBy === undefined) return new THREE.Vector3(0, height / 2, 0)
  if (plate.hinge) {
    return {
      left: new THREE.Vector3(width / 2, 0, 0),
      right: new THREE.Vector3(-width / 2, 0, 0),
      top: new THREE.Vector3(0, -height / 2, 0),
      bottom: new THREE.Vector3(0, height / 2, 0),
    }[plate.hinge]
  }
  // A rail runs in world space; find which edge leads, in the part's own frame.
  const along = new THREE.Vector3().fromArray(plate.rail!.along).applyQuaternion(quaternion.clone().invert())
  return Math.abs(along.x) > Math.abs(along.y) ? new THREE.Vector3(Math.sign(along.x) * width / 2, 0, 0) : new THREE.Vector3(0, Math.sign(along.y) * height / 2, 0)
}

export interface Pose { position: THREE.Vector3, quaternion: THREE.Quaternion }

/**
 * The cord in world space: from the top of the weight, over each pulley, to
 * the part it drives. Both ends follow the parts' current poses, so the cord
 * reads the same whether the parts are moving, at rest, or snapped there under
 * reduced motion.
 */
export function cordPoints(driven: Plate, weight: Plate, drivenPose: Pose, weightPose: Pose, frames: { driven: THREE.Quaternion, weight: THREE.Quaternion }): THREE.Vector3[] {
  const end = (plate: Plate, pose: Pose, frame: THREE.Quaternion): THREE.Vector3 => cordAnchor(plate, frame).applyQuaternion(pose.quaternion).add(pose.position)
  return [end(weight, weightPose, frames.weight), ...(driven.cord ?? []).map((point) => new THREE.Vector3().fromArray(point)), end(driven, drivenPose, frames.driven)]
}

/** The cord's total length along its path. */
export function cordLength(points: readonly THREE.Vector3[]): number {
  return points.slice(1).reduce((sum, point, index) => sum + point.distanceTo(points[index]!), 0)
}

const Y = new THREE.Vector3(0, 1, 0)

/** One rod per run of the cord; they never take part in selection. */
export function createCord(runs: number): THREE.Group {
  const cord = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color: '#2c2620', roughness: 0.85 })
  for (let index = 0; index < runs; index++) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(CORD_RADIUS, CORD_RADIUS, 1, 6), material)
    rod.raycast = () => {}
    rod.castShadow = true
    cord.add(rod)
  }
  cord.userData.cord = true
  return cord
}

/** Stretch each rod between consecutive points of the cord's path. */
export function placeCord(cord: THREE.Group, points: readonly THREE.Vector3[]): void {
  cord.children.forEach((rod, index) => {
    const from = points[index]!
    const to = points[index + 1]!
    const length = Math.max(1e-4, from.distanceTo(to))
    rod.position.copy(from).add(to).multiplyScalar(0.5)
    rod.quaternion.setFromUnitVectors(Y, to.clone().sub(from).divideScalar(length))
    rod.scale.set(1, length, 1)
  })
}

/**
 * A pulley wheel at each point the cord turns, on an axle along the host's
 * normal, in the host's own frame so it leaves with the host.
 */
export function createPulleys(driven: Plate, host: Plate, hostQuaternion: THREE.Quaternion): THREE.Group {
  const pulleys = new THREE.Group()
  const inverse = hostQuaternion.clone().invert()
  const metal = new THREE.MeshStandardMaterial({ color: '#8c6a3c', metalness: 0.55, roughness: 0.35 })
  const hub = new THREE.MeshStandardMaterial({ color: '#3d3a36', metalness: 0.5, roughness: 0.45 })
  for (const point of driven.cord ?? []) {
    const local = new THREE.Vector3().fromArray(point).sub(new THREE.Vector3().fromArray(host.position)).applyQuaternion(inverse)
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(PULLEY_RADIUS, PULLEY_RADIUS, 0.06, 18), metal)
    wheel.rotation.x = Math.PI / 2
    wheel.position.copy(local)
    // The axle runs back to the host's face.
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, Math.max(0.01, local.z), 8), hub)
    axle.rotation.x = Math.PI / 2
    axle.position.set(local.x, local.y, local.z / 2)
    for (const part of [wheel, axle]) {
      part.raycast = () => {}
      pulleys.add(part)
    }
  }
  pulleys.userData.pulleys = driven.id
  return pulleys
}
