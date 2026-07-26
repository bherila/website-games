import { createEngineState, stepEngine } from '../engine/engine'
import { exportSandbox, loadSandbox, restoreSandbox, saveSandbox } from '../gameProgress'

describe('sandbox 30-day continuation soak', () => {
  it('matches an uninterrupted simulation after a mid-run save and restore', () => {
    window.localStorage.clear()
    const uninterrupted = createEngineState({ seed: 1500, mapId: 'city-tower', lobbyHeight: 1 })
    stepEngine(uninterrupted, [
      { type: 'place', kind: 'lobby', floor: 0, x: 100, widthTiles: 40 },
      { type: 'place', kind: 'slab', floor: 1, x: 100, widthTiles: 40 },
      { type: 'placeShaft', kind: 'standard', x: 118, bottomFloor: 0, topFloor: 1 },
      { type: 'place', kind: 'officeS', floor: 1, x: 100 },
      { type: 'place', kind: 'restroom', floor: 1, x: 110 },
      { type: 'setSpeed', speed: 4 },
    ], 0)

    while (uninterrupted.clock.day < 15) {
      stepEngine(uninterrupted, [], 5)
    }
    expect(saveSandbox(uninterrupted, 'slot-a')).toEqual({ ok: true })
    const midpoint = loadSandbox('slot-a')!
    expect(exportSandbox(midpoint).length).toBeLessThan(1_000_000)
    const resumed = restoreSandbox(midpoint)

    while (uninterrupted.clock.day < 31) {
      expect(stepEngine(resumed, [], 5)).toEqual(stepEngine(uninterrupted, [], 5))
    }

    expect(saveSandbox(uninterrupted, 'slot-a')).toEqual({ ok: true })
    expect(saveSandbox(resumed, 'slot-b')).toEqual({ ok: true })
    expect(loadSandbox('slot-b')).toEqual(loadSandbox('slot-a'))
  }, 120_000)
})
