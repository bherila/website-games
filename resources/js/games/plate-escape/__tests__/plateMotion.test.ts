import * as THREE from 'three'

import { plateQuaternion } from '../houseGeometry'
import { LEVELS } from '../level'
import { FALL_SECONDS, fallPose, HINGE_SECONDS, hingePose, nextRotorSpeed, panelSamples, RAIL_SECONDS, railPose, ROTOR_START_SECONDS, ROTOR_STOP_SECONDS, rotorPose } from '../plateMotion'
import { groundAt, type StageId } from '../stage'

const plates = [...new Map(LEVELS.flatMap((level) => level.plates.map((plate) => ({ plate, stage: level.stage ?? 'garden' as StageId })))
  .map((entry) => [`${entry.stage}:${entry.plate.id}:${entry.plate.finish}:${entry.plate.position.join()}`, entry])).values()]

test.each(plates.map(({ plate, stage }) => [plate.id, stage, plate] as const))('%s (%s) lands without passing through the ground, then falls clear', (_id, stage, plate) => {
  const start = new THREE.Vector3().fromArray(plate.position)
  const rotation = plateQuaternion(plate)
  const first = fallPose(plate, start, rotation, 0, stage)
  expect(first.position.distanceTo(start)).toBeLessThan(1e-9)
  expect(first.quaternion.angleTo(rotation)).toBeLessThan(1e-9)
  let previous = first
  let grounded = false
  const frames = Math.round(FALL_SECONDS * 60)
  for (let frame = 1; frame <= frames; frame++) {
    const pose = fallPose(plate, start, rotation, frame / 60, stage)
    const points = panelSamples(plate).map((point) => point.applyQuaternion(pose.quaternion).add(pose.position))
    // Nothing passes through the deck or lawn, and nothing jumps between frames.
    for (const point of points) expect(point.y).toBeGreaterThanOrEqual(groundAt(point.x, point.z, stage) - 1e-9)
    expect(pose.position.distanceTo(previous.position)).toBeLessThan(0.35)
    grounded ||= pose.grounded
    previous = pose
  }
  // Walls topple onto the deck with an audible thud; raised parts may clear the lawn entirely.
  if (['front', 'back', 'side', 'glass-wall'].includes(plate.finish)) expect(grounded).toBe(true)
  // A part lying flat drops onto whatever is below and fades there; anything else falls clear.
  const lying = Math.abs(new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).y) > 0.95
  if (lying) {
    expect(grounded).toBe(true)
    return
  }
  const end = panelSamples(plate).map((point) => point.applyQuaternion(previous.quaternion).add(previous.position))
  expect(end.every((point) => groundAt(point.x, point.z, stage) === -Infinity || point.y < -1.9)).toBe(true)
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

test('a call long after the fall costs no more than the fall itself', () => {
  const wall = LEVELS[0]!.plates.find((plate) => plate.id === 'front')!
  const start = new THREE.Vector3().fromArray(wall.position)
  const rotation = plateQuaternion(wall)
  const end = fallPose(wall, start, rotation, FALL_SECONDS)
  // Five minutes later the replay is clamped to the visible window, not 36,000 substeps further on.
  const later = fallPose(wall, start, rotation, 300)
  expect(later.position.distanceTo(end.position)).toBeLessThan(1e-9)
  expect(later.quaternion.angleTo(end.quaternion)).toBeLessThan(1e-9)
})

test('a turning rotor coasts to a stop within half a second of a touch and never runs backward', () => {
  const rotor = LEVELS.find((level) => level.id === 10)!.rotor!
  const full = Math.PI * 2 / rotor.period
  // Twenty seconds a turn: gentle.
  expect(rotor.period).toBeGreaterThanOrEqual(20)
  let speed = full
  let elapsed = 0
  while (speed > 0) {
    speed = nextRotorSpeed(rotor, speed, 0, 1 / 60)
    elapsed += 1 / 60
    expect(speed).toBeGreaterThanOrEqual(0)
  }
  expect(elapsed).toBeLessThanOrEqual(ROTOR_STOP_SECONDS + 1 / 60)
  // A slow frame cannot overshoot either way.
  expect(nextRotorSpeed(rotor, full, 0, 5)).toBe(0)
  expect(nextRotorSpeed(rotor, 0, full, 5)).toBe(full)
  expect(nextRotorSpeed(rotor, 0, full, ROTOR_START_SECONDS / 2)).toBeCloseTo(full / 2)
})

test('rotor poses turn about the hub and come back after a full turn', () => {
  const level = LEVELS.find((candidate) => candidate.id === 10)!
  const sail = level.plates.find((plate) => plate.id === 'sail-amber')!
  const start = new THREE.Vector3().fromArray(sail.position)
  const hub = new THREE.Vector3().fromArray(level.rotor!.center)
  const half = rotorPose(level.rotor!, start, plateQuaternion(sail), Math.PI)
  expect(half.position.distanceTo(hub)).toBeCloseTo(start.distanceTo(hub))
  expect(half.position.x).toBeCloseTo(2 * hub.x - start.x)
  const full = rotorPose(level.rotor!, start, plateQuaternion(sail), Math.PI * 2)
  expect(full.position.distanceTo(start)).toBeLessThan(1e-9)
  expect(full.quaternion.angleTo(plateQuaternion(sail))).toBeLessThan(1e-6)
})

test('a hinged panel starts closed and finishes opening on time', () => {
  const door = LEVELS.find((level) => level.id === 9)!.plates.find((plate) => plate.id === 'loft-door')!
  const start = new THREE.Vector3().fromArray(door.position)
  const rotation = plateQuaternion(door)
  expect(hingePose(door, start, rotation, 0).quaternion.angleTo(rotation)).toBeLessThan(1e-9)
  const open = hingePose(door, start, rotation, HINGE_SECONDS)
  expect(hingePose(door, start, rotation, 60).position.distanceTo(open.position)).toBeLessThan(1e-9)
  // The hinge edge stays put while the panel turns about it.
  const edge = new THREE.Vector3(-door.size[0] / 2, 0, 0)
  expect(edge.clone().applyQuaternion(open.quaternion).add(open.position).distanceTo(edge.applyQuaternion(rotation).add(start))).toBeLessThan(1e-9)
})

test('a dropped weight and the part its cord drives each stop at a fixed end, whatever the time since, and the weight hangs clear of the ground', () => {
  for (const level of LEVELS) {
    for (const driven of level.plates.filter((plate) => plate.drivenBy)) {
      const weight = level.plates.find((plate) => plate.id === driven.drivenBy)!
      for (const plate of [driven, weight]) {
        const start = new THREE.Vector3().fromArray(plate.position)
        const rotation = plateQuaternion(plate)
        const pose = (t: number) => plate.hinge ? hingePose(plate, start, rotation, t) : railPose(plate, start, rotation, t)
        const lasts = plate.hinge ? HINGE_SECONDS : RAIL_SECONDS
        expect(pose(0).position.distanceTo(start)).toBeLessThan(1e-9)
        // Reduced motion shows the end at once; a slow frame, a long pause or a fast one land in the same place.
        for (const later of [lasts, lasts + 1 / 30, 60]) {
          expect(pose(later).position.distanceTo(pose(lasts).position)).toBeLessThan(1e-9)
          expect(pose(later).quaternion.angleTo(pose(lasts).quaternion)).toBeLessThan(1e-9)
        }
        // It travels the whole way smoothly, never jumping between frames.
        for (let frame = 1; frame <= Math.ceil(lasts * 60); frame++) expect(pose(frame / 60).position.distanceTo(pose((frame - 1) / 60).position)).toBeLessThan(0.35)
      }
      const end = railPose(weight, new THREE.Vector3().fromArray(weight.position), plateQuaternion(weight), RAIL_SECONDS)
      for (const point of panelSamples(weight).map((sample) => sample.applyQuaternion(end.quaternion).add(end.position))) {
        expect(point.y).toBeGreaterThan(groundAt(point.x, point.z, level.stage))
      }
    }
  }
})
