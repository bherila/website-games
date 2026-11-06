import { fireEvent, render, screen } from '@testing-library/react'

import { BuildingAnalysis } from '../engine/analysis'
import { Building, starterBuilding } from '../engine/building'
import { carsIn } from '../engine/uses'
import { Tower2Scene, type Tower2SceneProps } from '../Tower2Scene'

jest.mock('../scene/Tower2Renderer', () => ({
  Tower2Renderer: jest.fn().mockImplementation(() => ({
    setSize: jest.fn(),
    dispose: jest.fn(),
    renderer: { info: { render: { frame: 0 } } },
  })),
}))

beforeEach(() => {
  jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  globalThis.ResizeObserver = jest.fn().mockImplementation(() => ({ observe: jest.fn(), disconnect: jest.fn() }))
})
afterEach(() => jest.restoreAllMocks())

function scene(building = new Building()) {
  const onApply = jest.fn((commit: Parameters<Tower2SceneProps['onApply']>[0]) => commit(building))
  let props: Tower2SceneProps = {
    world: { building, analysis: new BuildingAnalysis(building), stamp: 0 },
    activeFloor: 0, tool: 'plate', facing: 'south', overlay: 'none', exterior: false,
    selection: null, touchMode: 'draw', onApply, onSelect: jest.fn(), onHint: jest.fn(),
  }
  const view = render(<Tower2Scene {...props} />)
  const canvas = screen.getByLabelText('Building plan')
  fireEvent.focus(canvas)
  return {
    building, canvas, onApply,
    update(next: Partial<Tower2SceneProps>) {
      props = { ...props, ...next }
      view.rerender(<Tower2Scene {...props} />)
    },
    key(key: string, options = {}) { fireEvent.keyDown(canvas, { key, ...options }) },
    status() { return screen.getByTestId('tower2-keyboard-status') },
    onSelect: props.onSelect,
  }
}

test('anchors and commits a rectangle through the engine; ignores held activation and cancels with Escape', () => {
  const plan = scene()
  expect(plan.canvas).toHaveAttribute('tabindex', '0')
  expect(plan.status()).toHaveTextContent('G · column 21, row 33')
  plan.key('Enter')
  plan.key('ArrowLeft')
  plan.key('ArrowLeft')
  plan.key('ArrowUp')
  plan.key('Enter', { repeat: true })
  expect(plan.onApply).not.toHaveBeenCalled()
  plan.key(' ')
  expect(plan.onApply).toHaveBeenCalledTimes(1)
  expect(plan.building.plateArea(0)).toBe(6)
  expect(plan.building.hasPlate(0, 18, 31)).toBe(true)
  expect(plan.status()).toHaveTextContent('Built.')
  plan.key('Enter')
  plan.key('ArrowLeft')
  plan.key('Escape')
  plan.key('Enter')
  expect(plan.onApply).toHaveBeenCalledTimes(1)
  expect(plan.status()).toHaveTextContent('Anchor column 18, row 32')
})

test('bounds the cursor, leaves shifted floor keys alone, and cancels anchors on floor, tool, undo and focus changes', () => {
  const plan = scene()
  for (let i = 0; i < 45; i++) { plan.key('ArrowLeft'); plan.key('ArrowUp') }
  expect(plan.status()).toHaveTextContent('column 1, row 1')
  plan.key('ArrowUp', { shiftKey: true })
  plan.key('Enter')
  plan.update({ activeFloor: -1 })
  plan.key('Enter')
  expect(plan.status()).toHaveTextContent('B1')
  expect(plan.onApply).not.toHaveBeenCalled()
  plan.update({ tool: 'erase' })
  plan.key('Enter')
  expect(plan.onApply).not.toHaveBeenCalled()
  plan.update({ world: { building: plan.building, analysis: new BuildingAnalysis(plan.building), stamp: 1 } })
  plan.key('Enter')
  expect(plan.onApply).not.toHaveBeenCalled()
  fireEvent.blur(plan.canvas)
  fireEvent.focus(plan.canvas)
  plan.key('Enter')
  expect(plan.onApply).not.toHaveBeenCalled()
  for (let i = 0; i < 45; i++) { plan.key('ArrowRight'); plan.key('ArrowDown') }
  expect(plan.status()).toHaveTextContent('column 40, row 40')
})

test('room and core placement share pointer validation, and Select inspects at the cursor', () => {
  const plan = scene(starterBuilding())
  plan.update({ tool: 'shop' })
  plan.key('Enter')
  const refusal = plan.onApply.mock.results[0]!.value
  expect(refusal.ok).toBe(false)
  if (!refusal.ok) expect(plan.status()).toHaveTextContent(refusal.reason)
  expect(plan.building.allRooms()).toHaveLength(4)
  for (let i = 0; i < 4; i++) plan.key('ArrowRight')
  for (let i = 0; i < 3; i++) plan.key('ArrowUp')
  plan.key('Enter')
  expect(plan.building.allRooms()).toHaveLength(5)
  expect(plan.status()).toHaveTextContent('Built.')
  plan.update({ tool: 'select' })
  plan.key(' ')
  expect(plan.onSelect).toHaveBeenCalledWith({ kind: 'room', id: 5 })
  for (let i = 0; i < 10; i++) plan.key('ArrowLeft')
  for (let i = 0; i < 2; i++) plan.key('ArrowUp')
  plan.update({ tool: 'core', cars: 2 })
  plan.key('Enter')
  expect(plan.building.cores()).toHaveLength(2)
  expect(carsIn(plan.building.cores()[1]!)).toBe(2)
})

test('blocks edits behind dialogs and in exterior view', () => {
  const plan = scene()
  plan.key('Enter')
  plan.update({ blocked: true })
  plan.key('Enter')
  expect(plan.onApply).not.toHaveBeenCalled()
  expect(plan.canvas).toHaveAttribute('tabindex', '-1')
  plan.update({ blocked: false })
  plan.key('Enter')
  expect(plan.onApply).not.toHaveBeenCalled()
  plan.update({ exterior: true })
  plan.key('Enter')
  expect(plan.onApply).not.toHaveBeenCalled()
  expect(plan.status()).toHaveTextContent('Return to plan view')
})
