import { fireEvent, render, screen } from '@testing-library/react'

import { injectUnit, makeTestState, placeShaft, placeSlabRow } from '../../engine/__tests__/testState'
import { FLOOR_MAX, FLOOR_MIN } from '../../gameTypes'
import { floorAtStripPosition, FloorNavigator, floorRangeForState, floorStripPercent } from '../FloorNavigator'

describe('FloorNavigator', () => {
  it('maps strip positions across the full legal floor range', () => {
    expect(floorAtStripPosition(0, 200)).toBe(FLOOR_MAX)
    expect(floorAtStripPosition(200, 200)).toBe(FLOOR_MIN)
    expect(floorStripPercent(FLOOR_MAX)).toBe(0)
    expect(floorStripPercent(FLOOR_MIN)).toBe(100)
  })

  it('derives occupied extents from units and shafts', () => {
    const state = makeTestState()
    for (let floor = 0; floor <= 8; floor += 1) {
      placeSlabRow(state, floor, 0, 10)
    }
    placeShaft(state, 'standard', 4, 0, 8)
    injectUnit(state, { kind: 'slab', floor: -2, x: 0, width: 4, storeys: 1 })

    expect(floorRangeForState(state)).toEqual({ minFloor: -2, maxFloor: 8 })
  })

  it('jumps to the clicked floor and reflects the current viewport', () => {
    const onGoToFloor = jest.fn()
    render(
      <FloorNavigator
        occupied={{ minFloor: -2, maxFloor: 20 }}
        viewport={{ centerFloor: 7.2, minFloor: 4, maxFloor: 10 }}
        onGoToFloor={onGoToFloor}
      />,
    )
    const strip = screen.getByRole('slider', { name: 'Tower floor navigator' })
    jest.spyOn(strip, 'getBoundingClientRect').mockReturnValue({
      bottom: 220,
      height: 200,
      left: 0,
      right: 28,
      top: 20,
      width: 28,
      x: 0,
      y: 20,
      toJSON: () => ({}),
    })

    expect(screen.getByLabelText('Current camera floor')).toHaveTextContent('7')
    expect(screen.getByTestId('camera-floor-range')).toHaveStyle({ top: `${floorStripPercent(10)}%` })
    fireEvent.click(strip, { clientY: 120 })
    // Derived, not hard-coded: the strip spans whatever range it is given, so a
    // literal here would silently pin the default range instead of the mapping.
    expect(onGoToFloor).toHaveBeenCalledWith(floorAtStripPosition(100, 200))
  })

  it('supports keyboard floor navigation and displays incident markers', () => {
    const onGoToFloor = jest.fn()
    render(
      <FloorNavigator
        incidents={[{ floor: 7, kind: 'bomb' }, { floor: -2, kind: 'fire' }]}
        occupied={{ minFloor: -2, maxFloor: 20 }}
        viewport={{ centerFloor: 7, minFloor: 4, maxFloor: 10 }}
        onGoToFloor={onGoToFloor}
      />,
    )

    const slider = screen.getByRole('slider', { name: 'Tower floor navigator' })
    expect(slider).toHaveAttribute('aria-valuenow', '7')
    expect(screen.getByTestId('incident-floor-marker-bomb-7')).toBeInTheDocument()
    expect(screen.getByTestId('incident-floor-marker-fire--2')).toBeInTheDocument()

    fireEvent.keyDown(slider, { key: 'ArrowUp' })
    fireEvent.keyDown(slider, { key: 'PageDown' })
    fireEvent.keyDown(slider, { key: 'Home' })
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onGoToFloor.mock.calls).toEqual([[8], [-3], [FLOOR_MAX], [FLOOR_MIN]])
  })
})
