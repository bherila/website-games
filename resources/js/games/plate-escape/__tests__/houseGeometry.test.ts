import * as THREE from 'three'

import { disposeObject } from '../../_shared/three/threeUtils'
import { coverStandoff, decoratePlate, PANEL_FACE, plateOutline, plateQuaternion } from '../houseGeometry'
import { LEVELS, PLATES } from '../level'

test('wall and roof frames keep screw heads facing outward without distorting the panel', () => {
  for (const level of LEVELS) {
    for (const plate of level.plates) {
      const rotation = plateQuaternion(plate)
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation)
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation)
      expect(normal.distanceTo(new THREE.Vector3().fromArray(plate.normal))).toBeLessThan(1e-10)
      expect(up.distanceTo(new THREE.Vector3().fromArray(plate.up))).toBeLessThan(1e-10)
      expect(normal.dot(up)).toBeCloseTo(0)
      for (const screw of level.screws.filter((candidate) => candidate.plate === plate.id)) {
        expect(Math.abs(screw.position[0]) + 0.245).toBeLessThan(plate.size[0] / 2)
        expect(Math.abs(screw.position[1]) + 0.245).toBeLessThan(plate.size[1] / 2)
      }
    }
  }
})

test('the pitched roof meets at one ridge above the two gabled end walls', () => {
  const ridges = PLATES.filter((plate) => plate.finish === 'roof').map((plate) => new THREE.Vector3(0, plate.size[1] / 2, 0)
    .applyQuaternion(plateQuaternion(plate)).add(new THREE.Vector3().fromArray(plate.position)))
  expect(ridges).toHaveLength(2)
  expect(ridges[0]!.distanceTo(ridges[1]!)).toBeLessThan(1e-10)
  for (const plate of PLATES.filter((candidate) => candidate.gableRise)) {
    const highest = Math.max(...plateOutline(plate).getPoints().map((point) => point.y)) + plate.position[1]
    expect(ridges[0]!.y).toBeGreaterThan(highest)
    expect(ridges[0]!.y - highest).toBeLessThan(0.15)
  }
})

test('cover spacers reach the wall behind them without crossing any screw’s access ray', () => {
  let checked = 0
  for (const level of LEVELS) {
    const blocks: THREE.Object3D[] = []
    for (const plate of level.plates) {
      const standoff = coverStandoff(plate, level.plates)
      if (standoff === 0) continue
      const details = decoratePlate(plate, standoff)
      details.position.fromArray(plate.position)
      details.quaternion.copy(plateQuaternion(plate))
      details.updateMatrixWorld(true)
      const spacers = details.children.filter((child) => child.userData.spacer)
      expect(spacers).toHaveLength(2)
      const normal = new THREE.Vector3().fromArray(plate.normal)
      for (const spacer of spacers) {
        // The far end sits on the wall face; the near end meets the cover's back.
        const box = new THREE.Box3().setFromObject(spacer)
        const depths = [box.min, box.max].map((corner) => corner.clone().sub(new THREE.Vector3().fromArray(plate.position)).dot(normal))
        expect(Math.min(...depths)).toBeCloseTo(PANEL_FACE - standoff, 5)
        expect(Math.max(...depths)).toBeCloseTo(-PANEL_FACE, 5)
      }
      blocks.push(...spacers)
      checked++
    }
    for (const screw of level.screws) {
      const plate = level.plates.find((candidate) => candidate.id === screw.plate)!
      const normal = new THREE.Vector3().fromArray(plate.normal)
      const head = new THREE.Vector3(...screw.position, 0.18).applyQuaternion(plateQuaternion(plate)).add(new THREE.Vector3().fromArray(plate.position))
      // Head radius 0.245: test the centre and four rim points of each head.
      const rim = [[0, 0], [0.245, 0], [-0.245, 0], [0, 0.245], [0, -0.245]].map(([x, y]) => new THREE.Vector3(x, y, 0).applyQuaternion(plateQuaternion(plate)).add(head))
      // Start behind the head: a ray that begins inside a block would miss its back faces.
      for (const origin of rim) expect(new THREE.Raycaster(origin.addScaledVector(normal, -0.3), normal, 0, 10).intersectObjects(blocks)).toEqual([])
    }
    for (const block of blocks) disposeObject(block)
  }
  // Workshop braces and glasshouse covers, front and back.
  expect(checked).toBe(4)
})
