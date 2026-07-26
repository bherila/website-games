import { fireEvent, render, screen } from '@testing-library/react'

import { BottomControlButton, ColorblindToggle, GAME_TOOLBAR_PADDING_CLASS, gameToolbarReservedHeightPx, Metric } from '../GameControlPrimitives'

describe('shared game control primitives', () => {
  it('supports metric emphasis and colorblind changes', () => {
    const onCheckedChange = jest.fn()
    render(
      <>
        <Metric emphasis label="Score" value="1,200" />
        <ColorblindToggle checked={false} id="shared-colorblind" onCheckedChange={onCheckedChange} />
      </>,
    )

    expect(screen.getByText('1,200')).toHaveClass('text-2xl')
    fireEvent.click(screen.getByRole('switch', { name: 'Colorblind mode' }))
    expect(onCheckedChange.mock.calls[0]?.[0]).toBe(true)
  })

  it('keeps toolbar layout and camera reservations in one module', () => {
    expect(GAME_TOOLBAR_PADDING_CLASS).toBe('pb-[4.5rem] sm:pb-24')
    expect(gameToolbarReservedHeightPx(false)).toBe(72)
    expect(gameToolbarReservedHeightPx(true)).toBe(96)
  })

  it('requires confirmation before invoking destructive power-up actions', () => {
    const onClick = jest.fn()
    render(
      <BottomControlButton
        confirmation={{ actionLabel: 'Use it', description: 'Confirm this action.', title: 'Continue?' }}
        disabled={false}
        icon={<span>+</span>}
        label="Power up"
        onClick={onClick}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Power up' }))
    expect(onClick).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
