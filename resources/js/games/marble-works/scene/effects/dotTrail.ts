import * as THREE from 'three'

import type { Vec2 } from '../../pieces/pieceCatalog'

export interface DotTrail {
  mesh: THREE.InstancedMesh
  /** Newest last. */
  points: Vec2[]
}

const DUMMY = new THREE.Object3D()

/** A fading tail of dots behind the rolling marble. */
export function createDotTrail(capacity: number, radius: number, color: string, opacity: number): DotTrail {
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(radius, 10, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
    capacity,
  )
  mesh.count = 0
  mesh.frustumCulled = false

  return { mesh, points: [] }
}

/** Lays dots along `points`; with `taper` the oldest dots shrink away. */
export function setDotTrail(trail: DotTrail, points: readonly Vec2[], z: number, taper: boolean): void {
  const capacity = trail.mesh.instanceMatrix.count
  const visible = points.slice(-capacity)
  trail.points = [...visible]
  visible.forEach(([x, y], index) => {
    const scale = taper ? (index + 1) / visible.length : 1
    DUMMY.position.set(x, y, z)
    DUMMY.scale.setScalar(scale)
    DUMMY.updateMatrix()
    trail.mesh.setMatrixAt(index, DUMMY.matrix)
  })
  trail.mesh.count = visible.length
  trail.mesh.instanceMatrix.needsUpdate = true
}

/** Every `stride`-th point, for a dotted last-run path. */
export function thinPath(path: readonly Vec2[], stride: number): Vec2[] {
  return path.filter((_, index) => index % stride === 0)
}
