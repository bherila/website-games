import * as THREE from 'three'

import { generateLevel } from '../gameEngine'
import { boardingSeatTarget, boardingWalkPath } from '../scene/animation/boardingPassengers'
import { queueLayoutForState } from '../scene/sceneGeometry'

describe('boardingWalkPath', () => {
  it('routes gate → crosswalk → corridor → seat instead of a diagonal beeline', () => {
    const layout = queueLayoutForState(generateLevel(1))
    const from = new THREE.Vector3(1.4, 0.12, -6.2)
    const seat = boardingSeatTarget(3, 'regular', 0)

    const path = boardingWalkPath(from, seat, layout.capRadius)

    expect(path.length).toBeGreaterThanOrEqual(4)
    expect(path[0]).toEqual(from)

    // The walk funnels through the crosswalk on the lot's center line.
    const crosswalkPoints = path.slice(1, -2)
    for (const point of crosswalkPoints) {
      expect(point.x).toBe(0)
    }

    // The passenger approaches the slot from the corridor behind it, never
    // walking deeper (south) than the seat itself before turning in.
    const corridor = path[path.length - 2]
    const last = path[path.length - 1]
    expect(corridor?.x).toBeCloseTo(seat.x)
    expect(corridor && last && corridor.z < last.z).toBe(true)

    // Walking south the whole way: z never backtracks.
    for (let index = 1; index < path.length; index += 1) {
      expect(path[index]!.z + 1e-9).toBeGreaterThanOrEqual(path[index - 1]!.z)
    }
  })

  it('collapses the crosswalk leg when a large loop reaches the slot approach line', () => {
    const from = new THREE.Vector3(-0.5, 0.12, -4.4)
    const seat = boardingSeatTarget(0, 'regular', 1)

    const path = boardingWalkPath(from, seat, 2.4)

    // Still a valid, monotonic walk with no duplicated points.
    for (let index = 1; index < path.length; index += 1) {
      expect(path[index]!.distanceTo(path[index - 1]!)).toBeGreaterThan(0.05)
      expect(path[index]!.z + 1e-9).toBeGreaterThanOrEqual(path[index - 1]!.z)
    }
    expect(path[path.length - 1]).toEqual(seat)
  })
})
