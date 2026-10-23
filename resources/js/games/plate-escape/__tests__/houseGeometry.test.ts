import * as THREE from 'three'

import { plateOutline, plateQuaternion } from '../houseGeometry'
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
