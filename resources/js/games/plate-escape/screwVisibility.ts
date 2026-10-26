import type * as THREE from 'three'

export interface ScrewSight { screwId: string, coveredBy?: string | undefined }

/** Glass reveals a head visually but remains a physical barrier to selection. */
export function traceScrew(ray: THREE.Raycaster, objects: THREE.Object3D[]): ScrewSight | null {
  let coveredBy: string | undefined
  for (const hit of ray.intersectObjects(objects, true)) {
    let visible = true
    for (let parent: THREE.Object3D | null = hit.object; parent; parent = parent.parent) if (!parent.visible) visible = false
    if (!visible) continue
    let screw: THREE.Object3D | null = hit.object
    while (screw && screw.userData.screwId === undefined) screw = screw.parent
    if (screw) return { screwId: screw.userData.screwId as string, coveredBy }
    if (typeof hit.object.userData.glassPlateName === 'string') coveredBy ??= hit.object.userData.glassPlateName
    else return null
  }
  return null
}

/** The camera's orbit, as polar angles from straight above: not overhead, and a little below level. */
export const ORBIT_POLAR = [0.5, Math.PI / 2 + 0.12] as const

/** The cosine of the widest angle between a head's face and the camera at which it can be tapped (about 80°). */
export const MIN_FACING = 0.17

/**
 * Whether a head turned toward `normal` can be tapped from the camera direction `toCamera`
 * (both unit length). A head seen nearly edge-on is not offered: its button would flicker
 * and crowd its neighbours.
 */
export function facesCamera(normal: THREE.Vector3, toCamera: THREE.Vector3): boolean {
  return normal.dot(toCamera) > MIN_FACING
}
