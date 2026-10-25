import * as THREE from 'three'

import { plateQuaternion } from '../houseGeometry'
import { LEVELS } from '../level'
import { FALL_SECONDS, fallPose, groundAt, panelSamples } from '../plateMotion'

const plates = [...new Map(LEVELS.flatMap((level) => level.plates).map((plate) => [`${plate.id}:${plate.finish}:${plate.position.join()}`, plate])).values()]

test.each(plates.map((plate) => [plate.id, plate.finish, plate] as const))('%s (%s) lands without passing through the garden, then falls clear', (_id, _finish, plate) => {
  const start = new THREE.Vector3().fromArray(plate.position)
  const rotation = plateQuaternion(plate)
  const first = fallPose(plate, start, rotation, 0)
  expect(first.position.distanceTo(start)).toBeLessThan(1e-9)
  expect(first.quaternion.angleTo(rotation)).toBeLessThan(1e-9)
  let previous = first
  let grounded = false
  const frames = Math.round(FALL_SECONDS * 60)
  for (let frame = 1; frame <= frames; frame++) {
    const pose = fallPose(plate, start, rotation, frame / 60)
    const points = panelSamples(plate).map((point) => point.applyQuaternion(pose.quaternion).add(pose.position))
    // Nothing passes through the deck or lawn, and nothing jumps between frames.
    for (const point of points) expect(point.y).toBeGreaterThanOrEqual(groundAt(point.x, point.z) - 1e-9)
    expect(pose.position.distanceTo(previous.position)).toBeLessThan(0.35)
    grounded ||= pose.grounded
    previous = pose
  }
  // Walls topple onto the deck with an audible thud; raised parts may clear the lawn entirely.
  if (['front', 'back', 'side', 'glass-wall'].includes(plate.finish)) expect(grounded).toBe(true)
  const end = panelSamples(plate).map((point) => point.applyQuaternion(previous.quaternion).add(previous.position))
  expect(end.every((point) => groundAt(point.x, point.z) === -Infinity || point.y < -1.9)).toBe(true)
})

test('a roof slope slides down its pitch before it tips off the eave', () => {
  const roof = LEVELS[0]!.plates.find((plate) => plate.id === 'left-roof')!
  const start = new THREE.Vector3().fromArray(roof.position)
  const rotation = plateQuaternion(roof)
  const sliding = fallPose(roof, start, rotation, 0.3)
  expect(sliding.quaternion.angleTo(rotation)).toBeLessThan(1e-9)
  expect(sliding.position.x).toBeLessThan(start.x)
  expect(sliding.position.y).toBeLessThan(start.y)
  expect(fallPose(roof, start, rotation, 1).quaternion.angleTo(rotation)).toBeGreaterThan(0.5)
})
