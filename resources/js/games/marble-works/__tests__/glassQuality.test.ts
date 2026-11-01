import * as THREE from 'three'

import { createMarbleMesh } from '../scene/builders/marbleMesh'
import { applyGlassQuality, markGlass, medianFrameTime } from '../scene/glassQuality'

describe('glass quality', () => {
  it('swaps refraction for tinted see-through glass and back', () => {
    const material = markGlass(new THREE.MeshPhysicalMaterial({ transmission: 1, opacity: 1 }), 0.55)
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1), material)

    applyGlassQuality(mesh, 'lite')
    expect(material).toMatchObject({ transmission: 0, transparent: true, opacity: 0.55, depthWrite: false })

    applyGlassQuality(mesh, 'refractive')
    expect(material).toMatchObject({ transmission: 1, transparent: false, opacity: 1, depthWrite: true })
  })

  it('leaves materials that are not glass alone', () => {
    const steel = createMarbleMesh('steel')
    const glass = createMarbleMesh('glass')
    applyGlassQuality(steel.group, 'lite')
    applyGlassQuality(glass.group, 'lite')

    const transmissions = (group: THREE.Group): number[] => {
      const values: number[] = []
      group.traverse((object) => {
        const { material } = object as THREE.Mesh
        if (material instanceof THREE.MeshPhysicalMaterial) {
          values.push(material.transmission)
        }
      })
      return values
    }

    expect(transmissions(steel.group).every((value) => value === 0)).toBe(true)
    expect(transmissions(glass.group)).toEqual([0])
  })

  it('judges frame rate by the median, ignoring single hitches', () => {
    expect(medianFrameTime([0.016, 0.016, 0.5, 0.017, 0.016])).toBeCloseTo(0.016)
  })
})
