import * as THREE from 'three'

import { disposeObject } from '../../../_shared/three/threeUtils'
import { starterBuilding } from '../../engine/building'
import { buildCityContext } from '../cityGeometry'
import { APPROACH_HALF_WIDTH, streetLayout } from '../cityLayout'
import { lotLook } from '../Tower2Renderer'

describe('the city around the lot', () => {
  test('keeps lobby and storefront approaches clear when rooms move or disappear', () => {
    const site = { width: 40, depth: 40 }
    for (const entranceX of [0, 6, 20, 33, 39]) {
      for (const doorX of [3, 11, 17, 30, 37]) {
        const layout = streetLayout(site, { x: entranceX, y: 35 }, [{ floor: 0, storefront: true, door: { x: doorX, y: 38 } }])
        for (const prop of layout.props) {
          for (const x of [entranceX + 0.5, doorX + 0.5, layout.crosswalkX]) {
            expect(prop.x + prop.width <= x - APPROACH_HALF_WIDTH || prop.x >= x + APPROACH_HALF_WIDTH).toBe(true)
          }
          expect(prop.y).toBeGreaterThanOrEqual(site.depth)
        }
      }
    }
    const empty = streetLayout(site, null, [])
    const room = { floor: 0, storefront: true, door: { x: 4, y: 39 } }
    expect(streetLayout(site, null, [room])).not.toEqual(empty)
    expect(streetLayout(site, null, [])).toEqual(empty)
    expect(streetLayout(site, null, [{ ...room, floor: 1 }])).toEqual(empty)
  })

  test('is deterministic, handles rectangular and crowded sites, and keeps props apart', () => {
    for (const site of [{ width: 40, depth: 40 }, { width: 18, depth: 27 }]) {
      const layout = streetLayout(site, null, [])
      expect(streetLayout(site, null, [])).toEqual(layout)
      expect(new Set(layout.props.map(prop => prop.kind))).toEqual(new Set(['bench', 'bus-stop', 'tree', 'lamp', 'car']))
      for (const prop of layout.props) {
        expect(prop.x).toBeGreaterThanOrEqual(0)
        expect(prop.x + prop.width).toBeLessThanOrEqual(site.width)
        for (const other of layout.props.filter(candidate => candidate !== prop)) {
          expect(prop.x + prop.width <= other.x || prop.x >= other.x + other.width || prop.y + prop.depth <= other.y || prop.y >= other.y + other.depth).toBe(true)
        }
      }
    }
    const full = Array.from({ length: 40 }, (_, x) => ({ floor: 0, storefront: true, door: { x, y: 39 } }))
    expect(streetLayout({ width: 40, depth: 40 }, null, full).props).toEqual([])
  })

  test('uses at most four render batches, with finite shaded geometry and low context blocks', () => {
    const building = starterBuilding()
    const city = buildCityContext(building, building.entrance(), building.roomsOn(0))
    expect(city.children.length).toBeLessThanOrEqual(4)
    expect(city.children.map(child => child.name)).toEqual(['city-static', 'city-tree', 'city-lamp', 'city-car'])
    for (const child of city.children) {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
      expect(mesh.material.vertexColors).toBe(true)
      expect(mesh.material.transparent).toBe(true)
      const positions = mesh.geometry.getAttribute('position')
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true)
      expect(mesh.geometry.getAttribute('color').count).toBe(positions.count)
      mesh.geometry.computeBoundingBox()
      expect(mesh.geometry.boundingBox!.max.y).toBeLessThan(5)
      if (mesh instanceof THREE.InstancedMesh) expect(mesh.count).toBeGreaterThan(0)
    }
    // The renderer applies the same existing fade/depth policy to every city batch.
    expect(lotLook(-1, false)).toEqual({ opacity: 0.07, depthWrite: false })
    const disposed = city.children.map(child => jest.spyOn((child as THREE.Mesh).geometry, 'dispose'))
    disposeObject(city)
    for (const spy of disposed) expect(spy).toHaveBeenCalledTimes(1)
  })
})
