import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

import { DeathOverlay } from '../overlays/DeathOverlay'
import { LevelCompleteOverlay } from '../overlays/LevelCompleteOverlay'
import { StuckOverlay } from '../overlays/StuckOverlay'

function noop(): void {}

interface OverlayCase {
  name: string
  label: string
  dialogTestId: string
  element: ReactElement
}

const OVERLAYS: readonly OverlayCase[] = [
  {
    name: 'LevelCompleteOverlay',
    label: 'Level complete',
    dialogTestId: 'win-dialog',
    element: (
      <LevelCompleteOverlay
        bestMoves={12}
        hasNextLevel
        isNewBest
        moves={12}
        par={16}
        stars={3}
        onMenu={noop}
        onNext={noop}
        onReplay={noop}
      />
    ),
  },
  {
    name: 'DeathOverlay',
    label: 'You died',
    dialogTestId: 'death-dialog',
    element: <DeathOverlay cause="drowned" onMenu={noop} onRestart={noop} />,
  },
  {
    name: 'StuckOverlay',
    label: 'No way to finish',
    dialogTestId: 'stuck-dialog',
    element: <StuckOverlay onMenu={noop} onRestart={noop} />,
  },
]

/**
 * jsdom has no layout, so these assert the *structure* that makes a too-tall
 * dialog reachable — `m-auto` on the child instead of centring on the scroll
 * container (the pattern documented in `games/_shared/LevelSelectGrid.tsx`).
 * The real geometry is asserted at a very short viewport in
 * `tests/e2e/chicks-challenge.spec.ts`.
 */
describe.each(OVERLAYS)('$name scroll layout', ({ label, dialogTestId, element }) => {
  it('centres the dialog with m-auto rather than centring on the scroll container', () => {
    render(element)

    const overlay = screen.getByRole('dialog', { name: label })
    expect(overlay.className).toContain('overflow-y-auto')
    // The anti-pattern: `align-items: center` on the scroll container puts the
    // overflow above the scroll origin, where scrolling can never reach it.
    expect(overlay.className).not.toContain('items-center')
    expect(overlay.className).not.toContain('justify-center')

    const dialog = screen.getByTestId(dialogTestId)
    expect(dialog.parentElement).toBe(overlay)
    expect(dialog.className).toContain('m-auto')
    expect(dialog.className).toContain('min-h-full')
    // Padding belongs to the scrolled child, so `min-h-full` cannot add a
    // permanent scroll of its own.
    expect(overlay.className).not.toContain('p-4')
    expect(dialog.className).toContain('p-4')
  })
})
