import { fireEvent, render, screen } from '@testing-library/react'

import { SpeedControls } from '../SpeedControls'

describe('SpeedControls', () => {
  it('offers only 1×/8×/16× (plus pause) and fires onSetSpeed', () => {
    const onSetSpeed = jest.fn()
    render(
      <SpeedControls speed={8} fastMode={false} fastModeActive={false} onSetSpeed={onSetSpeed} onSetFastMode={jest.fn()} />,
    )

    expect(screen.getByTestId('speed-8')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('speed-1')).toHaveAttribute('aria-pressed', 'false')
    // 2× and 4× were removed from the UI.
    expect(screen.queryByTestId('speed-2')).toBeNull()
    expect(screen.queryByTestId('speed-4')).toBeNull()

    fireEvent.click(screen.getByTestId('speed-0'))
    expect(onSetSpeed).toHaveBeenCalledWith(0)
    fireEvent.click(screen.getByTestId('speed-16'))
    expect(onSetSpeed).toHaveBeenCalledWith(16)
  })

  it('toggles fast mode and reflects checked/active state', () => {
    const onSetFastMode = jest.fn()
    const { rerender } = render(
      <SpeedControls speed={16} fastMode={false} fastModeActive={false} onSetSpeed={jest.fn()} onSetFastMode={onSetFastMode} />,
    )

    const toggle = screen.getByTestId('fast-mode-toggle')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(onSetFastMode).toHaveBeenCalledWith(true)

    rerender(
      <SpeedControls speed={16} fastMode={true} fastModeActive={true} onSetSpeed={jest.fn()} onSetFastMode={onSetFastMode} />,
    )
    expect(screen.getByTestId('fast-mode-toggle')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByTestId('fast-mode-toggle'))
    expect(onSetFastMode).toHaveBeenCalledWith(false)
  })
})
