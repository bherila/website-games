import type { ReactElement, ReactNode } from 'react'

import type { QuarterTurns } from './input/orientation'

interface BoardRotorProps {
  children: ReactNode
  quarterTurns: QuarterTurns
  /** Rotor box size in px (axes already swapped for a quarter turn); `null` before the first measurement. */
  width: number | null
  height: number | null
}

/**
 * Rotates only the rendered board. The rotor is sized with the board's axes
 * swapped and then rotated by CSS, so the three.js canvas inside it renders at
 * the rotated aspect ratio (the scene's own ResizeObserver picks the swapped box
 * up and its fit-or-follow camera math is unchanged). The HUD, toolbar, overlays
 * and level select are siblings and stay upright.
 *
 * A counter-clockwise turn (3 quarter turns, i.e. `rotate(270deg)`) needs exactly
 * the same axis swap as a clockwise one — only the transform angle differs — so
 * both directions are handled by the same arithmetic.
 *
 * The flip animates briefly; `prefers-reduced-motion` disables the transition
 * (same convention as the win overlay's star row).
 */
const ROTOR_STYLES = `
  .chips-board-rotor {
    transition: transform 260ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  @media (prefers-reduced-motion: reduce) {
    .chips-board-rotor { transition: none; }
  }
`

export function BoardRotor({ children, quarterTurns, width, height }: BoardRotorProps): ReactElement {
  const measured = width !== null && height !== null && width > 0 && height > 0

  return (
    <div className="absolute inset-0 overflow-hidden">
      <style>{ROTOR_STYLES}</style>
      <div
        className="chips-board-rotor absolute top-1/2 left-1/2"
        data-quarter-turns={quarterTurns}
        data-testid="chips-board-rotor"
        style={{
          width: measured ? `${width}px` : '100%',
          height: measured ? `${height}px` : '100%',
          transform: `translate(-50%, -50%) rotate(${quarterTurns * 90}deg)`,
        }}
      >
        {children}
      </div>
    </div>
  )
}
