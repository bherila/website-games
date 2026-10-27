import * as THREE from 'three'

import { disposeObject } from '../../_shared/three/threeUtils'
import { cordLength, cordPoints, createCord, createPulleys, placeCord } from '../counterweight'
import { dialAngle } from '../dial'
import { createPuzzle, showing } from '../engine'
import { coverStandoff, createPlateMesh, decoratePlate, PANEL_FACE, plateOutline, plateQuaternion, screwAnchorOn, throughShafts } from '../houseGeometry'
import { getLevel, heldPlates, LAB_LEVELS, LEVELS, type Plate, PLATES, type PuzzleLevel, type Screw } from '../level'
import { HINGE_SECONDS, hingePose, outlinedPlates, RAIL_SECONDS, railPose, restingPose, rotorPose } from '../plateMotion'

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

test('harbor decals fit their own panels, clear heads and captive sweeps, and never occlude selection', () => {
  for (const [levelId, plateId] of [[11, 'transom'], [12, 'base-front'], [13, 'front'], [14, 'cab-back'], [15, 'port']] as const) {
    const level = LEVELS.find((candidate) => candidate.id === levelId)!
    const plate = level.plates.find((candidate) => candidate.id === plateId)!
    const details = decoratePlate(plate, 0, level.screws, levelId)
    const decals = details.children.filter((child) => child.name.startsWith('harbor-decal:'))
    expect(decals).toHaveLength(1)
    const decal = decals[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
    expect(decal).toBeInstanceOf(THREE.Mesh)
    const { width, height } = decal.geometry.parameters
    for (const dx of [-width / 2, width / 2]) {
      for (const dy of [-height / 2, height / 2]) expect(insideOutline(plate, decal.position.x + dx, decal.position.y + dy)).toBe(true)
    }
    for (const screw of level.screws.filter((candidate) => candidate.plate === plateId)) {
      const dx = Math.max(Math.abs(screw.position[0] - decal.position.x) - width / 2, 0)
      const dy = Math.max(Math.abs(screw.position[1] - decal.position.y) - height / 2, 0)
      expect(Math.hypot(dx, dy)).toBeGreaterThan(0.245)
    }
    if (levelId === 11) {
      const flap = level.plates.find((candidate) => candidate.id === 'bait-flap')!
      expect(decal.position.x + width / 2).toBeLessThan(-flap.size[0] / 2)
    }
    if (levelId >= 13) {
      const inversePlate = new THREE.Matrix4().compose(new THREE.Vector3().fromArray(plate.position), plateQuaternion(plate), new THREE.Vector3(1, 1, 1)).invert()
      const painted = new THREE.Box2(new THREE.Vector2(decal.position.x - width / 2, decal.position.y - height / 2), new THREE.Vector2(decal.position.x + width / 2, decal.position.y + height / 2))
      for (const cover of level.plates.filter((candidate) => candidate.hinge || candidate.rail)) {
        const body = createPlateMesh(cover, [])
        body.geometry.computeBoundingBox()
        const intervals = 128
        for (let index = 0; index <= intervals; index++) {
          const progress = index / intervals
          const position = new THREE.Vector3().fromArray(cover.position)
          const rotation = plateQuaternion(cover)
          // Uniform angles include the quarter-turn; rails have linear bounds.
          const pose = cover.rail ? railPose(cover, position, rotation, Math.sqrt(progress) * RAIL_SECONDS) : hingePose(cover, position, rotation, (1 - Math.cbrt(1 - progress)) * HINGE_SECONDS)
          const frame = new THREE.Matrix4().compose(pose.position, pose.quaternion, new THREE.Vector3(1, 1, 1))
          const sweep = body.geometry.boundingBox!.clone().applyMatrix4(inversePlate.clone().multiply(frame))
          // Bound travel between adjacent samples. Per-pose boxes preserve
          // the empty upper corner beside the crane's diagonal rail.
          sweep.expandByScalar(cover.rail ? cover.rail.travel / intervals : Math.hypot(...cover.size, 2 * PANEL_FACE) * Math.PI / intervals)
          if (sweep.max.z > decal.position.z) {
            expect([levelId, cover.id, painted.intersectsBox(new THREE.Box2(new THREE.Vector2(sweep.min.x, sweep.min.y), new THREE.Vector2(sweep.max.x, sweep.max.y)))]).toEqual([levelId, cover.id, false])
          }
        }
        disposeObject(body)
      }
    }
    details.updateMatrixWorld(true)
    const ray = new THREE.Raycaster(decal.position.clone().add(new THREE.Vector3(0, 0, 5)), new THREE.Vector3(0, 0, -1))
    expect(ray.intersectObject(decal)).toHaveLength(0)
    expect(decal.material.transparent).toBe(true)
    expect(decal.material.map?.colorSpace).toBe(THREE.SRGBColorSpace)
    const disposed = jest.spyOn(decal.material.map!, 'dispose')
    disposeObject(details)
    expect(disposed).toHaveBeenCalledTimes(1)
    // Reused panel names must not inherit another level's markings.
    for (const other of [...LEVELS.map((candidate) => candidate.id), 16].filter((id) => id !== levelId)) {
      const unrelated = decoratePlate(plate, 0, level.screws, other)
      expect(unrelated.children.some((child) => child.name.startsWith('harbor-decal:'))).toBe(false)
      disposeObject(unrelated)
    }
    for (const other of level.plates.filter((candidate) => candidate.id !== plateId)) {
      const unrelated = decoratePlate(other, 0, level.screws, levelId)
      expect(unrelated.children.some((child) => child.name.startsWith('harbor-decal:'))).toBe(false)
      disposeObject(unrelated)
    }
  }
})

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
      const details = decoratePlate(plate, standoff, level.screws.filter((screw) => screw.plate === plate.id), level.id)
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
  // parts (two storm shutters, the hasp, the hook block, the counterweight, the lantern shutter) and the tower door;
  // on the railway, the music box's lid, the signal box's shutter and the tender's coal hatch; in the clockworks,
  // six weights, the six parts their cords drive, and the robot's visor; at the fair, the ride sign, the sliding gondola, and the float's weight and hatch.
  expect(checked).toBe(33)
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
  for (const level of [...LEVELS, ...LAB_LEVELS]) {
    const parts = level.plates.map((plate) => placed(createPlateMesh(plate, level.screws.filter((screw) => screw.plate === plate.id)), vector(plate.position), plateQuaternion(plate)))
    for (const screw of level.screws) {
      // A dial turns over the heads behind it; the next test checks it at every stop.
      const clear = parts.filter((_part, index) => {
        const { id, dial } = level.plates[index]!
        return id !== screw.plate && !dial && !(screw.blockedBy ?? []).includes(id)
      })
      for (const ray of accessRays(level, screw)) {
        const hits = ray.intersectObjects(clear).map((hit) => level.plates[parts.indexOf(hit.object.parent!)]!.id)
        expect([screw.id, hits]).toEqual([screw.id, []])
      }
    }
  }
})

test('a dial\'s window crosses exactly the heads the engine shows at each stop, and no other head', () => {
  const dialled = [...LEVELS, ...LAB_LEVELS].filter((level) => level.plates.some((plate) => plate.dial))
  expect(dialled.length).toBeGreaterThanOrEqual(LAB_LEVELS.length)
  for (const level of dialled) {
    // Each dial on its own: a selector turns only itself, so the others never stand over its heads.
    for (const plate of level.plates.filter((candidate) => candidate.dial)) {
      const dial = plate.dial!
      // Every head behind the dial comes into a window at some stop.
      for (const screw of level.screws.filter((candidate) => candidate.underDial?.dial === plate.id)) {
        const stops = Array.from({ length: dial.stops }, (_, stop) => ({ ...createPuzzle(level.id), dials: { ...createPuzzle(level.id).dials, [plate.id]: stop } }))
        expect({ level: level.id, screw: screw.id, seen: stops.some((board) => showing(board, screw)) }).toEqual({ level: level.id, screw: screw.id, seen: true })
      }
      for (let stop = 0; stop < dial.stops; stop++) {
        const turned = plateQuaternion(plate).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), dialAngle(dial, stop)))
        const disc = placed(new THREE.Group().add(createPlateMesh(plate, []), decoratePlate(plate)), vector(plate.position), turned)
        const board = { ...createPuzzle(level.id), dials: { ...createPuzzle(level.id).dials, [plate.id]: stop } }
        const shown = level.screws.filter((screw) => screw.underDial?.dial === plate.id && showing(board, screw))
        // A head in each window that is over a filled slot: a two-window dial shows two, and an empty slot shows none.
        const filled = new Set(level.screws.filter((screw) => screw.underDial?.dial === plate.id).map((screw) => screw.underDial!.slot))
        const expected = dial.windows.filter((window) => filled.has((window + stop) % dial.stops)).length
        expect({ level: level.id, dial: plate.id, stop, shown: shown.length }).toEqual({ level: level.id, dial: plate.id, stop, shown: expected })
        for (const screw of level.screws) {
          const rays = accessRays(level, screw)
          const blocked = rays.filter((ray) => ray.intersectObject(disc).length > 0).length
          // A head in the window is clear at its centre and all round its rim; any other head behind the dial is hidden.
          const hidden = screw.underDial?.dial === plate.id && !showing(board, screw)
          expect({ level: level.id, stop, screw: screw.id, blocked }).toEqual({ level: level.id, stop, screw: screw.id, blocked: hidden ? rays.length : 0 })
        }
      }
    }
  }
})

/** A part placed in a pose with its details, as the scene draws it. */
function drawn(level: PuzzleLevel, plate: Plate, pose: { position: THREE.Vector3, quaternion: THREE.Quaternion }): THREE.Object3D {
  const screws = level.screws.filter((screw) => screw.plate === plate.id)
  return placed(new THREE.Group().add(createPlateMesh(plate, screws), decoratePlate(plate, 0, screws, level.id)), pose.position, pose.quaternion)
}

const counterweighted = LEVELS.filter((level) => level.plates.some((plate) => plate.drivenBy))

test('a counterweight\'s part covers exactly the heads that list it while shut, and stands over no head once its cord has pulled it open', () => {
  for (const level of counterweighted) {
    for (const driven of level.plates.filter((plate) => plate.drivenBy)) {
      const weight = plateOf(level, driven.drivenBy!)
      for (const [part, end] of [[driven, driven.hinge ? hingePose(driven, vector(driven.position), plateQuaternion(driven), HINGE_SECONDS) : railPose(driven, vector(driven.position), plateQuaternion(driven), RAIL_SECONDS)], [weight, railPose(weight, vector(weight.position), plateQuaternion(weight), RAIL_SECONDS)]] as const) {
        const shut = drawn(level, part, { position: vector(part.position), quaternion: plateQuaternion(part) })
        const open = drawn(level, part, end)
        for (const screw of level.screws.filter((candidate) => candidate.plate !== part.id)) {
          const rays = accessRays(level, screw)
          // Shut, it covers the whole head of every screw that names it, and touches no other.
          const covered = (screw.blockedBy ?? []).includes(part.id)
          expect({ level: level.id, part: part.id, screw: screw.id, shut: rays.filter((ray) => ray.intersectObject(shut).length > 0).length }).toEqual({ level: level.id, part: part.id, screw: screw.id, shut: covered ? rays.length : 0 })
          // Open, it is clear of every head, rim included: a counterweight only ever opens access.
          expect({ level: level.id, part: part.id, screw: screw.id, open: rays.filter((ray) => ray.intersectObject(open).length > 0).length }).toEqual({ level: level.id, part: part.id, screw: screw.id, open: 0 })
        }
        disposeObject(shut)
        disposeObject(open)
      }
    }
  }
})

test('a counterweight\'s cord and pulleys cross no head, shut or open, and the cord takes up what the weight lets out', () => {
  for (const level of counterweighted) {
    for (const driven of level.plates.filter((plate) => plate.drivenBy)) {
      const weight = plateOf(level, driven.drivenBy!)
      const host = plateOf(level, driven.host!)
      const frames = { driven: plateQuaternion(driven), weight: plateQuaternion(weight) }
      const shut = { driven: { position: vector(driven.position), quaternion: frames.driven }, weight: { position: vector(weight.position), quaternion: frames.weight } }
      const open = {
        driven: driven.hinge ? hingePose(driven, vector(driven.position), frames.driven, HINGE_SECONDS) : railPose(driven, vector(driven.position), frames.driven, RAIL_SECONDS),
        weight: railPose(weight, vector(weight.position), frames.weight, RAIL_SECONDS),
      }
      const pulleys = placed(createPulleys(driven, host, plateQuaternion(host)), vector(host.position), plateQuaternion(host))
      const lengths: number[] = []
      for (const pose of [shut, open]) {
        const points = cordPoints(driven, weight, pose.driven, pose.weight, frames)
        lengths.push(cordLength(points))
        const cord = createCord(points.length - 1)
        placeCord(cord, points)
        cord.updateMatrixWorld(true)
        // The scene never lets the cord or a pulley take a tap, so neither may hide a head.
        cord.traverse((rod) => { rod.raycast = THREE.Mesh.prototype.raycast })
        pulleys.traverse((part) => { part.raycast = THREE.Mesh.prototype.raycast })
        for (const screw of level.screws.filter((candidate) => candidate.plate !== weight.id)) {
          // While shut, a head under the part is out of reach anyway.
          if (pose === shut && screw.blockedBy?.includes(driven.id)) continue
          const crossing = accessRays(level, screw).filter((ray) => ray.intersectObjects([cord, pulleys]).length > 0).length
          expect({ level: level.id, driven: driven.id, screw: screw.id, open: pose === open, crossing }).toEqual({ level: level.id, driven: driven.id, screw: screw.id, open: pose === open, crossing: 0 })
        }
        disposeObject(cord)
      }
      // A sliding part moves as far as the weight drops; a hinged one takes up some of the slack.
      if (driven.rail) expect(lengths[1]).toBeCloseTo(lengths[0]!, 2)
      else expect(lengths[1]).toBeLessThanOrEqual(lengths[0]! + 1e-6)
      disposeObject(pulleys)
    }
  }
})

test('in the clockworks every part\'s details (case trim, clock faces, weights, the horn, a robot\'s head) are carved clear of every head, their own included', () => {
  for (const level of counterweighted) {
    const carved = new Map(level.plates
      .map((plate) => [plate.id, placed(decoratePlate(plate, 0, level.screws.filter((screw) => screw.plate === plate.id), level.id), vector(plate.position), plateQuaternion(plate))]))
    for (const screw of level.screws) {
      // Only a cover the screw names may stand over it; a dial is checked at every stop by the dial test.
      const others = [...carved].filter(([id]) => !screw.blockedBy?.includes(id) && screw.underDial?.dial !== id).map(([, details]) => details)
      const crossing = accessRays(level, screw).filter((ray) => ray.intersectObjects(others).length > 0).length
      expect({ level: level.id, screw: screw.id, crossing }).toEqual({ level: level.id, screw: screw.id, crossing: 0 })
    }
    carved.forEach((details) => disposeObject(details))
  }
})

test('each dashed resting outline, a counterweight\'s stop included, lies over exactly the heads its part will cover', () => {
  const weights: string[] = []
  for (const level of LEVELS) {
    for (const plate of outlinedPlates(level)) {
      if (level.plates.some((other) => other.drivenBy === plate.id)) weights.push(`${level.id}:${plate.id}`)
      // The outline as the scene draws it, filled in so a ray inside it counts.
      const pose = restingPose(plate, vector(plate.position), plateQuaternion(plate))
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(plateOutline(plate)), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
      fill.position.z = 0.15
      const outline = placed(fill, pose.position, pose.quaternion)
      for (const screw of level.screws.filter((candidate) => candidate.plate !== plate.id)) {
        const crossing = accessRays(level, screw).filter((ray) => ray.intersectObject(outline).length > 0).length
        const lands = screw.coveredWhenOpen?.includes(plate.id) ?? false
        expect({ level: level.id, plate: plate.id, screw: screw.id, crossing: crossing > 0 }).toEqual({ level: level.id, plate: plate.id, screw: screw.id, crossing: lands })
      }
      disposeObject(outline)
    }
  }
  // Every counterweight shows where it will hang: six of them across the clockworks, and the float's.
  expect(weights).toHaveLength(7)
})

test('the fair arches hang their lamps under the lintel, inside the arch', () => {
  const level = getLevel(30)
  for (const plate of level.plates.filter((candidate) => candidate.finish === 'arch')) {
    const bulbs: THREE.Mesh[] = []
    decoratePlate(plate, 0, level.screws.filter((screw) => screw.plate === plate.id), level.id).traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry instanceof THREE.SphereGeometry) bulbs.push(object)
    })
    expect(bulbs.length).toBeGreaterThan(0)
    for (const bulb of bulbs) {
      expect(Number.isFinite(bulb.position.y)).toBe(true)
      expect(insideOutline(plate, bulb.position.x, bulb.position.y)).toBe(true)
    }
  }
})
