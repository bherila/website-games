import type * as THREE from 'three'

import { easeOutBack } from './easings'

const POP_DURATION = 0.38
const POP_START_SCALE = 0.55

export interface BoxPopTween {
  group: THREE.Object3D
  from: THREE.Vector3
  to: THREE.Vector3
  startedAt: number
  duration: number
}

/** Slides a freshly dispensed box from the chute mouth into its grid cell. */
export function createBoxPopTween(
  group: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  now: number,
): BoxPopTween {
  group.position.copy(from)
  group.scale.setScalar(POP_START_SCALE)

  return {
    group,
    from: from.clone(),
    to: to.clone(),
    startedAt: now,
    duration: POP_DURATION,
  }
}

export function updateBoxPopTween(tween: BoxPopTween, now: number): boolean {
  const t = Math.min(1, Math.max(0, (now - tween.startedAt) / tween.duration))
  const eased = easeOutBack(t)

  tween.group.position.set(
    tween.from.x + (tween.to.x - tween.from.x) * eased,
    tween.from.y + (tween.to.y - tween.from.y) * eased,
    tween.from.z + (tween.to.z - tween.from.z) * eased,
  )
  tween.group.scale.setScalar(POP_START_SCALE + (1 - POP_START_SCALE) * eased)

  if (t >= 1) {
    tween.group.position.copy(tween.to)
    tween.group.scale.setScalar(1)
    return true
  }

  return false
}
