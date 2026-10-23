import * as THREE from 'three'

import { disposeObject } from '../../_shared/three/threeUtils'
import { blockingPlates, createPuzzle, hasWon, removeScrew } from '../engine'
import { createPlateMesh, plateQuaternion } from '../houseGeometry'
import { getLevel } from '../level'
import { traceScrew } from '../screwVisibility'
import { VILLAGE_TRACES } from './campaignFixtures'

test.each(VILLAGE_TRACES)('level $level has reachable authored win and overflow traces', ({ level, win, lose }) => {
  let state = createPuzzle(level)
  for (const id of win) {
    const screw = getLevel(level).screws.find((candidate) => candidate.id === id)!
    expect(blockingPlates(state, screw)).toEqual([])
    const next = removeScrew(state, id)
    expect(next).not.toBe(state)
    expect(next.overflow).toBeNull()
    state = next
  }
  expect(hasWon(state)).toBe(true)
  let previous = createPuzzle(level)
  state = previous
  for (const id of lose) { previous = state; state = removeScrew(state, id) }
  expect(state.overflow).not.toBeNull()
  expect(hasWon(state)).toBe(false)
  expect(previous.overflow).toBeNull()
  expect(previous.spare).toHaveLength(getLevel(level).spareCapacity)
})

test('authored covers actually intersect the screw’s outward access ray', () => {
  for (const { level: id } of VILLAGE_TRACES) {
    const level = getLevel(id)
    for (const screw of level.screws) {
      const plate = level.plates.find((candidate) => candidate.id === screw.plate)!
      const point = new THREE.Vector3(...screw.position, 0.18).applyQuaternion(plateQuaternion(plate)).add(new THREE.Vector3(...plate.position))
      const normal = new THREE.Vector3(...plate.normal)
      const ray = new THREE.Raycaster(point.clone().addScaledVector(normal, 10), normal.clone().negate(), 0, 10)
      for (const coverId of screw.blockedBy ?? []) {
        const cover = level.plates.find((candidate) => candidate.id === coverId)!
        const mesh = createPlateMesh(cover, level.screws.filter((candidate) => candidate.plate === coverId))
        mesh.position.fromArray(cover.position)
        mesh.quaternion.copy(plateQuaternion(cover))
        mesh.updateMatrixWorld(true)
        expect(ray.intersectObject(mesh).length).toBeGreaterThan(0)
        disposeObject(mesh)
      }
    }
  }
})

test('seeing a head through glass never makes it selectable through the cover', () => {
  const cover = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial())
  cover.position.z = 1
  const head = new THREE.Mesh(new THREE.CircleGeometry(0.2), new THREE.MeshBasicMaterial())
  head.userData.screwId = 'blue-head'
  const scene = new THREE.Group()
  scene.add(cover, head)
  scene.updateMatrixWorld(true)
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -1))
  expect(traceScrew(ray, [scene])).toBeNull()
  cover.userData.glassPlateName = 'Glass cover'
  expect(traceScrew(ray, [scene])).toEqual({ screwId: 'blue-head', coveredBy: 'Glass cover' })
  cover.visible = false
  expect(traceScrew(ray, [scene])).toEqual({ screwId: 'blue-head', coveredBy: undefined })
  disposeObject(scene)
})

test('blocked heads cannot consume storage or release their wall before the cover', () => {
  for (const id of [3, 4, 5]) {
    const state = createPuzzle(id)
    expect(removeScrew(state, 'front-1')).toBe(state)
    expect(state.removed).toEqual([])
  }
})
