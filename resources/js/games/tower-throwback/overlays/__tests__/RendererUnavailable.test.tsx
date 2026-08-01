import { fireEvent, render, screen } from '@testing-library/react'

import { RendererUnavailable } from '../RendererUnavailable'

describe('RendererUnavailable', () => {
  it('requires an explicit trapped choice and restores focus after recovery', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const onRetry = jest.fn()
    const onExit = jest.fn()
    const rendered = render(<RendererUnavailable detail="WebGL disabled" onRetry={onRetry} onExit={onExit} />)

    const dialog = screen.getByRole('alertdialog', { name: 'Graphics unavailable' })
    const retry = screen.getByTestId('renderer-retry')
    const exit = screen.getByTestId('renderer-exit')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(retry).toHaveFocus()

    fireEvent.keyDown(retry, { key: 'Shift' })
    fireEvent.keyDown(retry, { key: 'Tab', shiftKey: true })
    expect(exit).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onRetry).not.toHaveBeenCalled()
    expect(onExit).not.toHaveBeenCalled()

    rendered.unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})
