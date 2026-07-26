import * as THREE from 'three'

import { cameraDollyPosition, createCamera, easeOutCubic, projectToScreen, updateCameraAspect } from '../scene/cameraRig'
import { CAMERA_DOLLY_DURATION_S, CAMERA_DOLLY_START_OFFSET, CAMERA_POSITION } from '../scene/sceneConstants'

describe('easeOutCubic', () => {
  it('starts at 0 and ends at 1, clamped outside [0,1]', () => {
    expect(easeOutCubic(0)).toBeCloseTo(0)
    expect(easeOutCubic(1)).toBeCloseTo(1)
    expect(easeOutCubic(-1)).toBeCloseTo(0)
    expect(easeOutCubic(2)).toBeCloseTo(1)
  })

  it('is monotonically increasing across the domain', () => {
    let previous = -Infinity
    for (let t = 0; t <= 1; t += 0.05) {
      const value = easeOutCubic(t)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })
})

describe('cameraDollyPosition', () => {
  it('starts at CAMERA_POSITION + CAMERA_DOLLY_START_OFFSET at elapsed=0', () => {
    const position = cameraDollyPosition(0)
    expect(position.x).toBeCloseTo(CAMERA_POSITION[0] + CAMERA_DOLLY_START_OFFSET[0])
    expect(position.y).toBeCloseTo(CAMERA_POSITION[1] + CAMERA_DOLLY_START_OFFSET[1])
    expect(position.z).toBeCloseTo(CAMERA_POSITION[2] + CAMERA_DOLLY_START_OFFSET[2])
  })

  it('settles exactly on CAMERA_POSITION once the duration has elapsed', () => {
    const position = cameraDollyPosition(CAMERA_DOLLY_DURATION_S)
    expect(position.x).toBeCloseTo(CAMERA_POSITION[0])
    expect(position.y).toBeCloseTo(CAMERA_POSITION[1])
    expect(position.z).toBeCloseTo(CAMERA_POSITION[2])
  })

  it('stays pinned to CAMERA_POSITION well past the duration (no overshoot)', () => {
    const position = cameraDollyPosition(CAMERA_DOLLY_DURATION_S * 5)
    expect(position.y).toBeCloseTo(CAMERA_POSITION[1])
  })

  it('monotonically approaches CAMERA_POSITION as elapsed increases', () => {
    const distanceAt = (elapsed: number): number => cameraDollyPosition(elapsed).distanceTo(new THREE.Vector3(...CAMERA_POSITION))
    const samples = [0, 0.1, 0.2, 0.3, 0.4, CAMERA_DOLLY_DURATION_S]
    let previousDistance = Infinity
    for (const elapsed of samples) {
      const distance = distanceAt(elapsed)
      expect(distance).toBeLessThanOrEqual(previousDistance + 1e-9)
      previousDistance = distance
    }
  })
})

describe('createCamera / updateCameraAspect', () => {
  it('creates a camera positioned at CAMERA_POSITION looking toward the platform', () => {
    const camera = createCamera(0.75)
    expect(camera.position.x).toBeCloseTo(CAMERA_POSITION[0])
    expect(camera.position.y).toBeCloseTo(CAMERA_POSITION[1])
    expect(camera.position.z).toBeCloseTo(CAMERA_POSITION[2])
    expect(camera.aspect).toBeCloseTo(0.75)
  })

  it('updates aspect from width/height', () => {
    const camera = createCamera(1)
    updateCameraAspect(camera, 400, 800)
    expect(camera.aspect).toBeCloseTo(0.5)
  })
})

describe('projectToScreen', () => {
  it('projects a point directly ahead of the camera near the center of the canvas', () => {
    const camera = new THREE.PerspectiveCamera(50, 3 / 4, 0.1, 100)
    camera.position.set(0, 4.5, 10.5)
    camera.lookAt(0, 2, 0)
    camera.updateMatrixWorld()

    const screen = projectToScreen(camera, new THREE.Vector3(0, 2, 0), 300, 400)
    expect(screen).not.toBeNull()
    expect(screen?.x).toBeCloseTo(150, 0)
    expect(screen?.y).toBeCloseTo(200, 0)
  })

  it('places a point to the right of center on the right half of the canvas', () => {
    const camera = new THREE.PerspectiveCamera(50, 3 / 4, 0.1, 100)
    camera.position.set(0, 4.5, 10.5)
    camera.lookAt(0, 2, 0)
    camera.updateMatrixWorld()

    const screen = projectToScreen(camera, new THREE.Vector3(2, 2, 0), 300, 400)
    expect(screen).not.toBeNull()
    expect(screen?.x).toBeGreaterThan(150)
  })

  it('returns null for a point behind the camera', () => {
    const camera = new THREE.PerspectiveCamera(50, 3 / 4, 0.1, 100)
    camera.position.set(0, 4.5, 10.5)
    camera.lookAt(0, 2, 0)
    camera.updateMatrixWorld()

    const screen = projectToScreen(camera, new THREE.Vector3(0, 4.5, 20), 300, 400)
    expect(screen).toBeNull()
  })
})
