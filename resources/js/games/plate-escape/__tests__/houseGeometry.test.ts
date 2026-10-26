import * as THREE from 'three'

import { disposeObject } from '../../_shared/three/threeUtils'
import { coverStandoff, createPlateMesh, decoratePlate, PANEL_FACE, plateOutline, plateQuaternion, screwAnchorOn, throughShafts } from '../houseGeometry'
import { heldPlates, LEVELS, type Plate, PLATES, type PuzzleLevel, type Screw } from '../level'
import { HINGE_SECONDS, hingePose, RAIL_SECONDS, railPose, rotorPose } from '../plateMotion'

/** Even-odd crossings of a ray toward +X against the panel's outline. */
function insideOutline(plate: Plate, x: number, y: number): boolean {
  const outline = plateOutline(plate).getPoints(24)
  let inside = false
  for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
    const a = outline[index]!
    const b = outline[previous]!
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

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
        if (plate.finish === 'wheel') expect(Math.hypot(...screw.position) + 0.245).toBeLessThan(plate.size[0] / 2)
        // A shaped panel holds the whole head, rim included.
        if (plate.outline) {
          for (const [x, y] of [[0, 0], [0.245, 0], [-0.245, 0], [0, 0.245], [0, -0.245]]) expect([screw.id, insideOutline(plate, screw.position[0] + x!, screw.position[1] + y!)]).toEqual([screw.id, true])
        }
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

const plateOf = (level: PuzzleLevel, id: string): Plate => level.plates.find((plate) => plate.id === id)!
const vector = (point: readonly number[]): THREE.Vector3 => new THREE.Vector3().fromArray(point)

/** Head centre and four rim points, each with the outward ray a screwdriver needs; head radius 0.245. */
function accessRays(level: PuzzleLevel, screw: Screw): THREE.Raycaster[] {
  const plate = plateOf(level, screw.plate)
  const rotation = plateQuaternion(plate)
  const normal = vector(plate.normal)
  return [[0, 0], [0.245, 0], [-0.245, 0], [0, 0.245], [0, -0.245]].map(([x, y]) => {
    const point = new THREE.Vector3(screw.position[0] + x!, screw.position[1] + y!, 0.18).applyQuaternion(rotation).add(vector(plate.position))
    // Start behind the head: a ray that begins inside a part would miss its back faces.
    return new THREE.Raycaster(point.addScaledVector(normal, -0.3), normal, 0, 10)
  })
}

function placed(object: THREE.Object3D, position: THREE.Vector3, quaternion: THREE.Quaternion): THREE.Object3D {
  const holder = new THREE.Group()
  holder.add(object)
  holder.position.copy(position)
  holder.quaternion.copy(quaternion)
  holder.updateMatrixWorld(true)
  return holder
}

test('a shared screw shows its shank from its head plate to the deepest plate it pins, clear of every other head', () => {
  let checked = 0
  for (const level of LEVELS) {
    const shafts: THREE.Object3D[] = []
    for (const plate of level.plates) {
      for (const shaft of throughShafts(plate, level.screws, level.plates)) {
        const screw = level.screws.find((candidate) => candidate.id === shaft.userData.shaft)!
        const holder = placed(shaft, vector(plate.position), plateQuaternion(plate))
        const deepest = plateOf(level, heldPlates(screw).at(-1)!)
        const normal = vector(plate.normal)
        const box = new THREE.Box3().setFromObject(holder)
        const depths = [box.min, box.max].map((corner) => corner.clone().sub(vector(deepest.position)).dot(normal))
        // It starts at the deepest plate's face and stops behind the head plate.
        expect(Math.min(...depths)).toBeCloseTo(PANEL_FACE, 5)
        expect(Math.max(...depths)).toBeCloseTo(vector(plate.position).sub(vector(deepest.position)).dot(normal) - PANEL_FACE, 5)
        shafts.push(holder)
        checked++
      }
    }
    for (const screw of level.screws) {
      const others = shafts.filter((holder) => holder.children[0]!.userData.shaft !== screw.id)
      for (const ray of accessRays(level, screw)) expect(ray.intersectObjects(others)).toEqual([])
    }
  }
  expect(checked).toBe(LEVELS.flatMap((level) => level.screws).filter((screw) => screw.through).length)
})

test('a shared screw crosses every plate it pins inside that plate', () => {
  for (const level of LEVELS) {
    for (const screw of level.screws.filter((candidate) => candidate.through)) {
      for (const id of screw.through!) {
        const plate = plateOf(level, id)
        const [x, y] = screwAnchorOn(screw, plate, level.plates)
        expect(insideOutline(plate, x, y)).toBe(true)
      }
    }
  }
})

test('an open captive panel sits in front of its host and covers exactly the heads that say so', () => {
  let checked = 0
  for (const level of LEVELS) {
    for (const plate of level.plates.filter((candidate) => candidate.hinge || candidate.rail)) {
      // Captive panels name their host and never hang on another captive panel.
      const host = plateOf(level, plate.host!)
      expect(host.hinge ?? host.rail).toBeUndefined()
      const open = plate.hinge
        ? hingePose(plate, vector(plate.position), plateQuaternion(plate), HINGE_SECONDS)
        : railPose(plate, vector(plate.position), plateQuaternion(plate), RAIL_SECONDS)
      const panel = placed(createPlateMesh(plate, []), open.position, open.quaternion)
      const box = new THREE.Box3().setFromObject(panel)
      const normal = vector(host.normal)
      for (const corner of [box.min, box.max]) expect(corner.clone().sub(vector(host.position)).dot(normal)).toBeGreaterThan(PANEL_FACE - 1e-6)
      // It opened: a hinge has turned most of its way, a shutter has left its closed place.
      if (plate.hinge) expect(open.quaternion.angleTo(plateQuaternion(plate))).toBeGreaterThan((plate.hingeAngle ?? Math.PI * 0.9) * 0.9)
      else expect(open.position.distanceTo(vector(plate.position))).toBeCloseTo(plate.rail!.travel)
      for (const screw of level.screws.filter((candidate) => candidate.plate !== plate.id)) {
        const rays = accessRays(level, screw)
        if (screw.coveredWhenOpen?.includes(plate.id)) {
          for (const ray of rays) expect([screw.id, ray.intersectObject(panel).length > 0]).toEqual([screw.id, true])
        } else {
          for (const ray of rays) expect([screw.id, ray.intersectObject(panel)]).toEqual([screw.id, []])
        }
      }
      checked++
    }
  }
  // The mill's three doors and hatches; in the harbor, three drop flaps (bait, end, stern), six railed
  // parts (two storm shutters, the hasp, the hook block, the counterweight, the lantern shutter) and the tower door.
  expect(checked).toBe(13)
})

test('turning parts cover what they cover at every angle, and no other head sits under their sweep', () => {
  const rotors = LEVELS.filter((level) => level.rotor)
  expect(rotors.map((level) => level.id)).toEqual([3, 6, 10])
  for (const level of rotors) {
    const rotor = level.rotor!
    const axis = vector(rotor.axis).normalize()
    const center = vector(rotor.center)
    const radial = (point: THREE.Vector3): number => {
      const offset = point.clone().sub(center)
      return offset.sub(axis.clone().multiplyScalar(offset.dot(axis))).length()
    }
    let sweep = 0
    for (const id of rotor.plates) {
      const plate = plateOf(level, id)
      for (const point of plateOutline(plate).getPoints(24)) sweep = Math.max(sweep, radial(new THREE.Vector3(point.x, point.y, 0).applyQuaternion(plateQuaternion(plate)).add(vector(plate.position))))
    }
    for (const screw of level.screws) {
      if (rotor.plates.includes(screw.plate)) continue
      const covers = (screw.blockedBy ?? []).filter((id) => rotor.plates.includes(id))
      if (covers.length) {
        for (let step = 0; step < 24; step++) {
          for (const id of covers) {
            const cover = plateOf(level, id)
            const pose = rotorPose(rotor, vector(cover.position), plateQuaternion(cover), step * Math.PI / 12)
            const mesh = placed(createPlateMesh(cover, []), pose.position, pose.quaternion)
            expect(accessRays(level, screw)[0]!.intersectObject(mesh).length).toBeGreaterThan(0)
          }
        }
        continue
      }
      // A head facing the same way as the rotor, behind it, must lie wholly outside its sweep.
      const plate = plateOf(level, screw.plate)
      if (vector(plate.normal).dot(axis) < 0.5) continue
      const head = new THREE.Vector3(...screw.position, 0.18).applyQuaternion(plateQuaternion(plate)).add(vector(plate.position))
      expect(radial(head) - 0.245).toBeGreaterThan(sweep)
    }
  }
})

test('nothing but a screw’s authored covers stands over its head', () => {
  for (const level of LEVELS) {
    const parts = level.plates.map((plate) => placed(createPlateMesh(plate, level.screws.filter((screw) => screw.plate === plate.id)), vector(plate.position), plateQuaternion(plate)))
    for (const screw of level.screws) {
      const clear = parts.filter((_part, index) => {
        const id = level.plates[index]!.id
        return id !== screw.plate && !(screw.blockedBy ?? []).includes(id)
      })
      for (const ray of accessRays(level, screw)) {
        const hits = ray.intersectObjects(clear).map((hit) => level.plates[parts.indexOf(hit.object.parent!)]!.id)
        expect([screw.id, hits]).toEqual([screw.id, []])
      }
    }
  }
})
