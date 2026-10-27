import * as THREE from 'three'

import { attachContextLossHandlers } from '../../../_shared/three/contextLoss'
import { makeTestState, placeShaft, placeSlabRow, setStars } from '../../engine/__tests__/testState'
import { createStructureLayer, syncStructure } from '../structureMesh'

function loseContext(canvas: HTMLCanvasElement): Event {
  const event = new Event('webglcontextlost', { cancelable: true })
  canvas.dispatchEvent(event)
  return event
}

function restoreContext(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new Event('webglcontextrestored'))
}

describe('GPU rebuild on context restore', () => {
  it('rebuilds the structure layer on restore without mutating engine state', () => {
    const canvas = document.createElement('canvas')
    const state = makeTestState()
    setStars(state, 4, 4)
    for (let floor = 0; floor <= 3; floor += 1) {
      placeSlabRow(state, floor, 0, 30)
    }
    placeShaft(state, 'standard', 5, 0, 3)

    const scene = new THREE.Scene()
    const structure = createStructureLayer(scene)
    syncStructure(structure, state)

    const childrenBefore = [...structure.rebuilt.children]
    const engineSnapshot = JSON.stringify(state)

    // Mirror the controller's rebuildGpuResources → onRestored wiring.
    attachContextLossHandlers(canvas, {
      onLost: jest.fn(),
      onRestored: () => {
        structure.version = -1
        syncStructure(structure, state)
      },
    })

    restoreContext(canvas)

    const childrenAfter = [...structure.rebuilt.children]
    expect(childrenAfter.length).toBe(childrenBefore.length)
    // Fresh mesh instances → GPU resources were re-created, not reused.
    expect(childrenAfter[0]).not.toBe(childrenBefore[0])
    // Rendering-side recovery must never touch the simulation state.
    expect(JSON.stringify(state)).toBe(engineSnapshot)
  })
})
