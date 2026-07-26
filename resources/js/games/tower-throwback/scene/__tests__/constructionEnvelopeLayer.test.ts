import * as THREE from 'three'

import { CITY_TOWER, NIAGARA_FALLS } from '../../engine/maps'
import {
  constructionEnvelopeForMap,
  createConstructionEnvelopeLayer,
  disposeConstructionEnvelopeLayer,
  setConstructionEnvelope,
} from '../constructionEnvelopeLayer'

describe('Niagara construction envelope', () => {
  it('derives both buildable banks and the bridge-only void from map geometry', () => {
    expect(constructionEnvelopeForMap(NIAGARA_FALLS)).toEqual([
      { kind: 'buildable', xMin: 0, xMaxExclusive: 189 },
      { kind: 'buildable', xMin: 277, xMaxExclusive: 375 },
      { kind: 'bridgeOnly', xMin: 189, xMaxExclusive: 277 },
    ])
    expect(constructionEnvelopeForMap(CITY_TOWER)).toEqual([])
  })

  it('is transparent, map-scoped, and visible only while a build tool is active', () => {
    const scene = new THREE.Scene()
    const layer = createConstructionEnvelopeLayer(scene)
    const material = layer.mesh.material as THREE.MeshBasicMaterial

    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
    expect(material.opacity).toBeLessThan(0.2)
    expect(layer.mesh.renderOrder).toBeLessThan(60)

    setConstructionEnvelope(layer, 'niagara-falls', false)
    expect(layer.mesh.visible).toBe(false)
    setConstructionEnvelope(layer, 'city-tower', true)
    expect(layer.mesh.visible).toBe(false)
    setConstructionEnvelope(layer, 'niagara-falls', true)
    expect(layer.mesh.visible).toBe(true)
    expect(layer.mesh.count).toBe(3)

    disposeConstructionEnvelopeLayer(layer)
    expect(scene.children).not.toContain(layer.mesh)
  })
})
