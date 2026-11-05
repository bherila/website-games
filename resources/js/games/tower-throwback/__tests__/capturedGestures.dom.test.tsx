import { act, fireEvent, render, screen } from '@testing-library/react'

import { makeTestState, placeShaft, placeSlabRow } from '../engine/__tests__/testState'
import type { EngineCommand } from '../gameTypes'
import type { SelectedTool } from '../hud/BuildPalette'
import { TowerScene } from '../TowerScene'

const createSceneController = jest.fn()
jest.mock('../scene/sceneController', () => ({
  createSceneController: (canvas: HTMLCanvasElement) => createSceneController(canvas) as unknown,
}))

function stubController() {
  return {
    render: jest.fn(),
    setOverlay: jest.fn(),
    setEvalOverlay: jest.fn(),
    setCatchment: jest.fn(),
    setDiagnosticPalette: jest.fn(),
    setReducedMotion: jest.fn(),
    fitTower: jest.fn(),
    screenToTile: jest.fn(() => null),
    screenToWorld: jest.fn(() => ({ x: 0, y: 0 })),
    setGhost: jest.fn(),
    setPlacementRange: jest.fn(),
    panBy: jest.fn(),
    goToFloor: jest.fn(),
    getViewport: jest.fn(() => ({ centerFloor: 0, minFloor: 0, maxFloor: 1 })),
    getRenderMetrics: jest.fn(() => ({ drawCalls: 0, frameMs: 0, triangles: 0 })),
    zoomBy: jest.fn(),
    resize: jest.fn(),
    setContextLossHandlers: jest.fn<(handlers: { onLost: () => void; onRestored: () => void }) => void>(),
    isReady: jest.fn(() => true),
    dispose: jest.fn(),
  }
}


function setup(tool: SelectedTool | null = { kind: 'officeS', isShaft: false }) {
  const state = makeTestState()
  placeSlabRow(state, 0, 0, 40)
  placeSlabRow(state, 1, 0, 40)
  placeShaft(state, 'standard', 10, 0, 1)
  const controller = stubController()
  const tile = { floor: 1, x: 10 }
  controller.screenToTile.mockImplementation(() => tile as never)
  createSceneController.mockReturnValue(controller)
  const onPlaceCommand = jest.fn()
  const onSelectTile = jest.fn()
  const onToggleStop = jest.fn()
  const props = {
    engineState: state,
    commandQueueRef: { current: [] as EngineCommand[] },
    buildToolRef: { current: tool },
    onPlaceCommand, onSelectTile, onToggleStop,
  }
  const view = render(<TowerScene {...props} />)
  const canvas = screen.getByLabelText(/^Tower playfield/) as HTMLCanvasElement
  const captured = new Set<number>()
  canvas.setPointerCapture = (id) => { captured.add(id) }
  canvas.hasPointerCapture = (id) => captured.has(id)
  canvas.releasePointerCapture = (id) => { captured.delete(id) }
  return { ...view, props, controller, tile, onPlaceCommand, onSelectTile, onToggleStop, canvas }
}

function pointer(canvas: HTMLElement, type: string, pointerType = 'mouse', pointerId = 1): void {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 20, clientY: 20 })
  Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType } })
  fireEvent(canvas, event)
}

beforeEach(() => createSceneController.mockReset())

describe('interrupted canvas gestures', () => {
  it.each(['mouse', 'touch', 'pen'])('cancels a captured %s placement when paused, including release after reopening', (pointerType) => {
    const scene = setup()
    pointer(scene.canvas!, 'pointerdown', pointerType)
    expect(scene.canvas!.hasPointerCapture(1)).toBe(true)
    scene.rerender(<TowerScene {...scene.props} paused />)
    expect(scene.canvas!.hasPointerCapture(1)).toBe(false)
    expect(scene.controller.setGhost).toHaveBeenLastCalledWith(null)
    scene.rerender(<TowerScene {...scene.props} />)
    pointer(scene.canvas!, 'pointerup', pointerType)
    expect(scene.onPlaceCommand).not.toHaveBeenCalled()
    pointer(scene.canvas!, 'pointerdown', pointerType)
    pointer(scene.canvas!, 'pointerup', pointerType)
    expect(scene.onPlaceCommand).toHaveBeenCalledTimes(1)
  })

  it.each(['Help', 'Loan', 'Inventory'])('cancels on a semantic %s modal even without a paused prop', async (label) => {
    const scene = setup()
    pointer(scene.canvas!, 'pointerdown')
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-label', label)
    await act(async () => { document.body.append(modal) })
    expect(scene.canvas!.hasPointerCapture(1)).toBe(false)
    await act(async () => { modal.remove() })
    pointer(scene.canvas!, 'pointerup')
    expect(scene.onPlaceCommand).not.toHaveBeenCalled()
  })

  it('blocks late resize, stop toggle, selection and camera input while covered', () => {
    const scene = setup(null)
    pointer(scene.canvas!, 'pointerdown')
    scene.rerender(<TowerScene {...scene.props} paused />)
    scene.tile.floor = 2
    pointer(scene.canvas!, 'pointermove')
    pointer(scene.canvas!, 'pointerup')
    fireEvent.wheel(scene.canvas!, { deltaY: 100 })
    expect(scene.onPlaceCommand).not.toHaveBeenCalled()
    expect(scene.onSelectTile).not.toHaveBeenCalled()
    expect(scene.onToggleStop).not.toHaveBeenCalled()
    expect(scene.controller.panBy).not.toHaveBeenCalled()
    expect(scene.controller.zoomBy).not.toHaveBeenCalled()
  })

  it.each(['pointercancel', 'lostpointercapture'])('cancels mouse gestures on %s', (eventName) => {
    const scene = setup()
    pointer(scene.canvas!, 'pointerdown')
    pointer(scene.canvas!, eventName)
    pointer(scene.canvas!, 'pointerup')
    expect(scene.onPlaceCommand).not.toHaveBeenCalled()
    expect(scene.canvas!.hasPointerCapture(1)).toBe(false)
  })

  it('cancels pending input on renderer context loss and requires a fresh gesture after recovery', () => {
    const scene = setup()
    pointer(scene.canvas!, 'pointerdown', 'touch')
    const handlers = scene.controller.setContextLossHandlers.mock.calls[0]![0] as { onLost: () => void; onRestored: () => void }
    act(() => handlers.onLost())
    pointer(scene.canvas!, 'pointerup', 'touch')
    expect(scene.onPlaceCommand).not.toHaveBeenCalled()
    act(() => handlers.onRestored())
    pointer(scene.canvas!, 'pointerdown', 'touch')
    pointer(scene.canvas!, 'pointerup', 'touch')
    expect(scene.onPlaceCommand).toHaveBeenCalledTimes(1)
  })
})
