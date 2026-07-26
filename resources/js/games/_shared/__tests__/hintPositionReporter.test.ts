import * as THREE from 'three'

import { createHintPositionReporter } from '../hintPositionReporter'
import type { TapHintPosition } from '../TapHint'

describe('createHintPositionReporter', () => {
  it('projects world positions and deduplicates sub-pixel changes', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const reports: Array<TapHintPosition | null> = []
    const reporter = createHintPositionReporter()
    const report = (worldPosition: THREE.Vector3 | null): void => reporter.report({
      camera,
      height: 200,
      onChange: (position) => reports.push(position),
      width: 200,
      worldPosition,
    })

    report(new THREE.Vector3(0, 0, 0))
    report(new THREE.Vector3(0.0001, 0, 0))
    report(new THREE.Vector3(1, 0, 0))
    report(null)
    report(null)

    expect(reports).toHaveLength(3)
    expect(reports[0]).toEqual({ x: 100, y: 100 })
    expect(reports[1]?.x).toBeGreaterThan(100)
    expect(reports[2]).toBeNull()
  })
})
