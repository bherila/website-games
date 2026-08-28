import { act, fireEvent, render, screen } from '@testing-library/react'

import { FullscreenBottomControlButton, FullscreenIconButton } from '../FullscreenButton'

function setFullscreenEnabled(value: boolean | undefined): void {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value })
}

function setFullscreenElement(value: Element | null): void {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value })
}

describe('fullscreen buttons', () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    setFullscreenEnabled(undefined)
    setFullscreenElement(null)
    delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen
    window.matchMedia = originalMatchMedia
  })

  it('renders nothing where the fullscreen API is unavailable', () => {
    // jsdom's default: no fullscreenEnabled, matchMedia mock reports non-standalone.
    render(
      <>
        <FullscreenBottomControlButton />
        <FullscreenIconButton />
      </>,
    )
    expect(screen.queryByTestId('fullscreen-toggle')).not.toBeInTheDocument()
  })

  it('renders nothing in an installed PWA (standalone display mode)', () => {
    setFullscreenEnabled(true)
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia

    render(<FullscreenIconButton />)
    expect(screen.queryByTestId('fullscreen-toggle')).not.toBeInTheDocument()
  })

  it('requests fullscreen on the document element when toggled', () => {
    setFullscreenEnabled(true)
    const requestFullscreen = jest.fn().mockResolvedValue(undefined)
    Object.assign(document.documentElement, { requestFullscreen })

    render(<FullscreenIconButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }))
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
  })

  it('flips label and pressed state when fullscreen changes', () => {
    setFullscreenEnabled(true)

    render(<FullscreenIconButton />)
    const button = screen.getByRole('button', { name: 'Enter fullscreen' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    act(() => {
      setFullscreenElement(document.documentElement)
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(button).toHaveAccessibleName('Exit fullscreen')
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('meets the 44px touch-target convention via min-h-11/min-w-11', () => {
    setFullscreenEnabled(true)
    render(<FullscreenIconButton />)
    // jsdom has no layout engine, so assert the classes rather than pixels.
    expect(screen.getByTestId('fullscreen-toggle')).toHaveClass('min-h-11', 'min-w-11')
  })

  it('wraps the shared BottomControlButton with matching labels', () => {
    setFullscreenEnabled(true)
    render(<FullscreenBottomControlButton />)
    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeInTheDocument()
  })
})
