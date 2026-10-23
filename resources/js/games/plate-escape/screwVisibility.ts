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
