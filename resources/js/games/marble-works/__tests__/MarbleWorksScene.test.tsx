import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'

import { LEVELS } from '../levels/levels'
import { MarbleWorksScene, type MarbleWorksSceneProps } from '../MarbleWorksScene'
import { MarbleWorksSceneController } from '../scene/sceneController'

jest.mock('../scene/sceneController', () => ({ MarbleWorksSceneController: jest.fn() }))
const factory = jest.mocked(MarbleWorksSceneController)
const layout = { width: 600, height: 800, cellSize: 80, left: 0, top: 0 }
function controller() {
  return {
    resize: jest.fn(() => layout), setPlacements: jest.fn(), setGhost: jest.fn(), setSelection: jest.fn(),
    setBuildOverlay: jest.fn(), setGhostPaths: jest.fn(), renderFirstFrame: jest.fn(), dispose: jest.fn(),
    startRun: jest.fn(), resetRun: jest.fn(),
  }
}
function props(): MarbleWorksSceneProps {
  return {
    level: LEVELS[0]!, placements: [{ uid: 'kept', pieceId: 'ramp-steep', col: 1, row: 3, variant: 0, flipped: false }],
    ghost: null, selected: null, editing: true, freeCells: [], tutorialCell: null, ghostPaths: null, runToken: null,
    onReady: jest.fn(), onMenu: jest.fn(), onRunEnd: jest.fn(), onLayout: jest.fn(), onBoardPointer: jest.fn(),
  }
}

beforeEach(() => factory.mockReset())

it.each(['constructor', 'resize', 'setPlacements', 'renderFirstFrame'] as const)('recovers from %s failure with placements and a fresh canvas', (stage) => {
  const broken = controller()
  const healthy = controller()
  factory.mockImplementationOnce(() => {
    if (stage === 'constructor') throw new Error('graphics unavailable')
    broken[stage].mockImplementationOnce(() => { throw new Error('graphics unavailable') })
    return broken as unknown as MarbleWorksSceneController
  }).mockImplementationOnce(() => healthy as unknown as MarbleWorksSceneController)
  const callbacks = props()
  render(<MarbleWorksScene {...callbacks} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Your pieces are kept')
  expect(callbacks.onReady).not.toHaveBeenCalledWith(true)
  fireEvent.pointerDown(screen.getByTestId('marble-works-board'), { button: 0 })
  expect(callbacks.onBoardPointer).not.toHaveBeenCalled()
  expect(screen.queryByTestId('marble-works-canvas')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  expect(healthy.setPlacements).toHaveBeenCalledWith(callbacks.placements)
  expect(healthy.setPlacements.mock.invocationCallOrder[0]).toBeLessThan(healthy.renderFirstFrame.mock.invocationCallOrder[0]!)
  expect(callbacks.onReady).toHaveBeenLastCalledWith(true)
  expect(screen.getAllByTestId('marble-works-canvas')).toHaveLength(1)
})

it('survives StrictMode and callback changes without replacing the active scene', () => {
  const controllers: ReturnType<typeof controller>[] = []
  factory.mockImplementation(() => { const next = controller(); controllers.push(next); return next as unknown as MarbleWorksSceneController })
  const callbacks = props()
  const mounted = render(<StrictMode><MarbleWorksScene {...callbacks} /></StrictMode>)
  expect(controllers).toHaveLength(2)
  expect(controllers[0]!.dispose).toHaveBeenCalledTimes(1)
  mounted.rerender(<StrictMode><MarbleWorksScene {...callbacks} onReady={jest.fn()} onRunEnd={jest.fn()} /></StrictMode>)
  expect(controllers).toHaveLength(2)
  mounted.unmount()
  expect(controllers[1]!.dispose).toHaveBeenCalledTimes(1)
})

it('detaches the failed canvas even if disposal throws and ignores late resize and error callbacks', () => {
  const broken = controller()
  broken.dispose.mockImplementation(() => { throw new Error('cleanup failed') })
  const healthy = controller()
  let fail: () => void = () => {}
  factory.mockImplementationOnce((_canvas, _level, options) => { fail = options.onError; return broken as unknown as MarbleWorksSceneController })
    .mockImplementationOnce(() => healthy as unknown as MarbleWorksSceneController)
  const callbacks = props()
  render(<MarbleWorksScene {...callbacks} />)
  act(() => { fail() })
  expect(screen.queryByTestId('marble-works-canvas')).not.toBeInTheDocument()
  const calls = broken.resize.mock.calls.length
  fireEvent(window, new Event('resize'))
  expect(broken.resize).toHaveBeenCalledTimes(calls)
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  act(() => { fail() })
  expect(callbacks.onReady).toHaveBeenLastCalledWith(true)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('disposes a controller returned after context loss during construction', () => {
  const partial = controller()
  factory.mockImplementationOnce((canvas) => {
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    return partial as unknown as MarbleWorksSceneController
  })
  const callbacks = props()
  render(<MarbleWorksScene {...callbacks} />)
  expect(partial.dispose).toHaveBeenCalledTimes(1)
  expect(partial.renderFirstFrame).not.toHaveBeenCalled()
  expect(callbacks.onReady).not.toHaveBeenCalledWith(true)
  expect(screen.queryByTestId('marble-works-canvas')).not.toBeInTheDocument()
})
