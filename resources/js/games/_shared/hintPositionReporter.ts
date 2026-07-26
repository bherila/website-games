import { type Camera, Vector3 } from 'three'

import type { TapHintPosition } from './TapHint'

interface WorldPosition {
  x: number
  y: number
  z: number
}

interface HintPositionReport {
  camera: Camera
  height: number
  onChange: ((position: TapHintPosition | null) => void) | undefined
  width: number
  worldPosition: WorldPosition | null
}

export interface HintPositionReporter {
  report: (input: HintPositionReport) => void
}

/** Projects hint targets and emits only visible CSS-pixel changes. */
export function createHintPositionReporter(changeThresholdPx = 0.5): HintPositionReporter {
  const projected = new Vector3()
  let last: TapHintPosition | null = null

  return {
    report({ camera, height, onChange, width, worldPosition }: HintPositionReport): void {
      if (!onChange) {
        return
      }

      let next: TapHintPosition | null = null
      if (worldPosition && width > 0 && height > 0) {
        projected.copy(worldPosition).project(camera)
        next = {
          x: ((projected.x + 1) / 2) * width,
          y: ((1 - projected.y) / 2) * height,
        }
      }

      const changed = (next === null) !== (last === null)
        || (next !== null && last !== null
          && (Math.abs(next.x - last.x) > changeThresholdPx || Math.abs(next.y - last.y) > changeThresholdPx))
      if (changed) {
        last = next
        onChange(next)
      }
    },
  }
}
