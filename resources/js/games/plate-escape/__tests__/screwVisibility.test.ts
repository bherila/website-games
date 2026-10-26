import * as THREE from 'three'

import { LEVELS } from '../level'
import { facesCamera, MIN_FACING, ORBIT_POLAR } from '../screwVisibility'

const fromPolar = (polar: number, azimuth: number): THREE.Vector3 => new THREE.Vector3().setFromSphericalCoords(1, polar, azimuth)

test('a head seen nearly edge-on is not offered, while one turned a little toward the camera is', () => {
  const normal = new THREE.Vector3(0, 0, 1)
  const at = (degrees: number): THREE.Vector3 => new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(degrees)), 0, Math.cos(THREE.MathUtils.degToRad(degrees)))
  expect(facesCamera(normal, at(0))).toBe(true)
  expect(facesCamera(normal, at(75))).toBe(true)
  expect(facesCamera(normal, at(85))).toBe(false)
  expect(facesCamera(normal, at(120))).toBe(false)
  expect(Math.acos(MIN_FACING)).toBeGreaterThan(THREE.MathUtils.degToRad(78))
})

test('every screw head on every level can be faced squarely enough from somewhere in the orbit', () => {
  for (const level of LEVELS) {
    for (const screw of level.screws) {
      const plate = level.plates.find((candidate) => candidate.id === screw.plate)!
      const normal = new THREE.Vector3().fromArray(plate.normal).normalize()
      let reachable = false
      for (let polar = ORBIT_POLAR[0]; polar <= ORBIT_POLAR[1] && !reachable; polar += 0.05) {
        for (let azimuth = 0; azimuth < Math.PI * 2 && !reachable; azimuth += Math.PI / 36) reachable = facesCamera(normal, fromPolar(polar, azimuth))
      }
      expect([level.id, screw.id, reachable]).toEqual([level.id, screw.id, true])
    }
  }
})
