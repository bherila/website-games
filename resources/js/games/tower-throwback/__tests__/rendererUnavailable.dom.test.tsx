/**
 * Renderer INITIALISATION failure (distinct from context loss, which is covered
 * in `scene/__tests__/contextLoss.dom.test.ts`). A browser that cannot create a
 * WebGL context at all must not take the React shell down with it.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'

import { makeTestState } from '../engine/__tests__/testState'
import type { EngineCommand, EngineState } from '../gameTypes'
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
    setContextLossHandlers: jest.fn(),
    isReady: jest.fn(() => true),
    dispose: jest.fn(),
  }
}

function renderScene(state: EngineState = makeTestState(), onExit = jest.fn()) {
  render(
    <TowerScene
      engineState={state}
      commandQueueRef={createRef<EngineCommand[]>() as React.RefObject<EngineCommand[]>}
      buildToolRef={createRef<SelectedTool | null>() as React.RefObject<SelectedTool | null>}
      onExit={onExit}
    />,
  )
  return onExit
}

beforeEach(() => {
  createSceneController.mockReset()
})

describe('renderer initialisation failure', () => {
  it('renders a retryable fallback instead of throwing out of the tree', () => {
    createSceneController.mockImplementation(() => {
      throw new Error('WebGL context creation failed')
    })

    expect(() => renderScene()).not.toThrow()

    expect(screen.getByTestId('renderer-unavailable')).toBeInTheDocument()
    expect(screen.getByTestId('renderer-unavailable-detail')).toHaveTextContent('WebGL context creation failed')
  })

  it('reassures the player that their save is intact', () => {
    createSceneController.mockImplementation(() => {
      throw new Error('nope')
    })
    renderScene()

    expect(screen.getByRole('alertdialog', { name: 'Graphics unavailable' })).toHaveTextContent('saved tower is safe')
  })

  it('retrying re-attempts construction and clears the fallback on success', () => {
    createSceneController
      .mockImplementationOnce(() => {
        throw new Error('transient')
      })
      .mockImplementation(() => stubController())

    renderScene()
    expect(screen.getByTestId('renderer-unavailable')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('renderer-retry'))

    expect(createSceneController).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId('renderer-unavailable')).toBeNull()
  })

  it('keeps a safe exit available while the renderer is down', () => {
    createSceneController.mockImplementation(() => {
      throw new Error('nope')
    })
    const onExit = renderScene()

    fireEvent.click(screen.getByTestId('renderer-exit'))

    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('does not leak a controller when construction fails', () => {
    const controller = stubController()
    createSceneController
      .mockImplementationOnce(() => {
        throw new Error('transient')
      })
      .mockImplementation(() => controller)

    renderScene()
    fireEvent.click(screen.getByTestId('renderer-retry'))

    // The failed attempt produced no controller, so nothing was left undisposed
    // and the successful retry owns exactly one.
    expect(controller.dispose).not.toHaveBeenCalled()
    expect(controller.setContextLossHandlers).toHaveBeenCalledTimes(1)
  })

  it('does not show the fallback when the renderer starts normally', () => {
    createSceneController.mockImplementation(() => stubController())

    renderScene()

    expect(screen.queryByTestId('renderer-unavailable')).toBeNull()
  })
})
