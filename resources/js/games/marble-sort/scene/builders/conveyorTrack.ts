import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import { BELT_MARKER_Y } from '../animation/conveyor'
import {
  BELT_TOP_Y,
  CONVEYOR_CENTER_Z,
  CONVEYOR_HEIGHT,
  CONVEYOR_PATH_HEIGHT,
  CONVEYOR_PATH_WIDTH,
  CONVEYOR_WIDTH,
} from '../sceneConstants'
import { conveyorPositionAt } from '../sceneGeometry'
import { type BeltMarkerRenderItem } from '../sceneTypes'
import { stadiumPath } from '../threeUtils'

const HOUSING = '#8d7bf5'
const HULL = '#6c5bd4'
const BELT = '#3c4254'
const RIM = '#fff2cf'
const ISLAND = '#ffd94f'

// Rim wall opening at the funnel throat so arriving marbles visibly roll
// through a gate instead of clipping through the wall.
const RIM_GAP_HALF_WIDTH = 0.72

/**
 * The floating conveyor pod: a violet housing with a real raised rubber belt
 * ring, a cream rim wall (open at the funnel throat) that visually holds the
 * marbles in, and a sunny centre island dividing the two straight runs.
 */
export function createConveyorTrack(): THREE.Group {
  const group = new THREE.Group()

  const housing = new THREE.Mesh(
    new RoundedBoxGeometry(CONVEYOR_WIDTH + 0.65, 0.62, CONVEYOR_HEIGHT + 0.61, 4, 0.26),
    new THREE.MeshPhysicalMaterial({
      color: HOUSING,
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.4,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.3,
    }),
  )
  housing.position.set(0, BELT_TOP_Y - 0.37, CONVEYOR_CENTER_Z)
  housing.castShadow = true
  housing.receiveShadow = true
  group.add(housing)

  const hull = new THREE.Mesh(
    new RoundedBoxGeometry(CONVEYOR_WIDTH - 0.4, 0.34, CONVEYOR_HEIGHT + 0.1, 4, 0.17),
    new THREE.MeshStandardMaterial({ color: HULL, roughness: 0.6 }),
  )
  hull.position.set(0, BELT_TOP_Y - 0.74, CONVEYOR_CENTER_Z)
  hull.castShadow = true
  group.add(hull)

  const beltGeometry = new THREE.ExtrudeGeometry(
    stadiumPath(new THREE.Shape(), CONVEYOR_WIDTH, CONVEYOR_HEIGHT, CONVEYOR_HEIGHT / 2),
    { bevelEnabled: false, depth: 0.08 },
  )
  beltGeometry.rotateX(Math.PI / 2)
  const belt = new THREE.Mesh(
    beltGeometry,
    new THREE.MeshStandardMaterial({ color: BELT, roughness: 0.88 }),
  )
  belt.position.set(0, BELT_TOP_Y, CONVEYOR_CENTER_Z)
  belt.receiveShadow = true
  group.add(belt)

  const rimGeometry = new THREE.ExtrudeGeometry(
    gatedRimShape(CONVEYOR_WIDTH + 0.28, CONVEYOR_HEIGHT + 0.28, CONVEYOR_WIDTH - 0.06, CONVEYOR_HEIGHT - 0.06),
    { bevelEnabled: false, depth: 0.22 },
  )
  rimGeometry.rotateX(Math.PI / 2)
  const rim = new THREE.Mesh(
    rimGeometry,
    new THREE.MeshPhysicalMaterial({
      color: RIM,
      roughness: 0.4,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.25,
      envMapIntensity: 0.3,
    }),
  )
  rim.position.set(0, BELT_TOP_Y + 0.13, CONVEYOR_CENTER_Z)
  rim.castShadow = true
  rim.receiveShadow = true
  group.add(rim)

  // The centre island between the two straight marble runs.
  const islandDepth = CONVEYOR_PATH_HEIGHT - 0.5
  const islandGeometry = new THREE.ExtrudeGeometry(
    stadiumPath(new THREE.Shape(), CONVEYOR_PATH_WIDTH - CONVEYOR_PATH_HEIGHT + islandDepth, islandDepth, islandDepth / 2),
    { bevelEnabled: false, depth: 0.1 },
  )
  islandGeometry.rotateX(Math.PI / 2)
  const island = new THREE.Mesh(
    islandGeometry,
    new THREE.MeshPhysicalMaterial({
      color: ISLAND,
      roughness: 0.35,
      metalness: 0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      envMapIntensity: 0.35,
    }),
  )
  island.position.set(0, BELT_TOP_Y + 0.1, CONVEYOR_CENTER_Z)
  island.castShadow = true
  group.add(island)

  return group
}

/**
 * Rim wall outline: a stadium ring with a gap in the north edge where the
 * funnel throat feeds the belt. Traced as one "C"-shaped polygon (outer
 * boundary out, inner boundary back) because ExtrudeGeometry holes cannot
 * express a break in the ring.
 */
function gatedRimShape(outerWidth: number, outerDepth: number, innerWidth: number, innerDepth: number): THREE.Shape {
  const outerRadius = outerDepth / 2
  const innerRadius = innerDepth / 2
  const outerEndX = outerWidth / 2 - outerRadius
  const innerEndX = innerWidth / 2 - innerRadius

  const shape = new THREE.Shape()
  shape.moveTo(RIM_GAP_HALF_WIDTH, -outerDepth / 2)
  shape.lineTo(outerEndX, -outerDepth / 2)
  shape.absarc(outerEndX, 0, outerRadius, -Math.PI / 2, Math.PI / 2, false)
  shape.lineTo(-outerEndX, outerDepth / 2)
  shape.absarc(-outerEndX, 0, outerRadius, Math.PI / 2, Math.PI * 1.5, false)
  shape.lineTo(-RIM_GAP_HALF_WIDTH, -outerDepth / 2)
  shape.lineTo(-RIM_GAP_HALF_WIDTH, -innerDepth / 2)
  shape.lineTo(-innerEndX, -innerDepth / 2)
  shape.absarc(-innerEndX, 0, innerRadius, Math.PI * 1.5, Math.PI / 2, true)
  shape.lineTo(innerEndX, innerDepth / 2)
  shape.absarc(innerEndX, 0, innerRadius, Math.PI / 2, -Math.PI / 2, true)
  shape.lineTo(RIM_GAP_HALF_WIDTH, -innerDepth / 2)
  shape.closePath()

  return shape
}

export function createConveyorBeltMarkers(slotCount: number): { group: THREE.Group, markers: BeltMarkerRenderItem[] } {
  const safeSlotCount = Math.max(1, slotCount)
  const group = new THREE.Group()
  const markers: BeltMarkerRenderItem[] = []
  const markerGeometry = new THREE.CylinderGeometry(0.082, 0.072, 0.024, 20)
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: '#c7cde0',
    metalness: 0.05,
    roughness: 0.6,
  })

  for (let slotIndex = 0; slotIndex < safeSlotCount; slotIndex += 1) {
    const marker = new THREE.Mesh(markerGeometry, markerMaterial)
    marker.receiveShadow = true
    const position = conveyorPositionAt(slotIndex / safeSlotCount)
    marker.position.set(position.x, BELT_MARKER_Y, position.z)
    group.add(marker)
    markers.push({ index: slotIndex, mesh: marker, total: safeSlotCount })
  }

  return { group, markers }
}
