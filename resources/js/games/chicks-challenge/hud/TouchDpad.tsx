import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { type PointerEvent as ReactPointerEvent, type ReactElement, useEffect, useState } from 'react'

import type { MoveIntent } from '../engine/types'
import { createHoldRepeat } from '../input/holdRepeat'

interface TouchDpadProps {
  onIntent: (intent: MoveIntent) => void
  /** False on levels where waiting can never matter: the centre button is shown inert. */
  waitEnabled?: boolean
}

/**
 * On-screen D-pad for touch devices, built on the same pointer-capture pattern as
 * `hover/hud/TouchControls.tsx`. A press is one step; holding past the repeat
 * delay (`input/holdRepeat.ts`) auto-repeats at the keyboard cadence. The
 * center button is wait. Buttons are 48px
 * (above the 44px minimum). Placement (bottom row in portrait, right-hand column
 * in landscape) and safe-area insets are owned by `hud/GameToolbar.tsx`, which
 * lays the pad out as a sibling of the playfield rather than on top of it.
 */
export function TouchDpad({ onIntent, waitEnabled = true }: TouchDpadProps): ReactElement {
  const [repeat] = useState(createHoldRepeat)
  const stopRepeat = repeat.stop

  useEffect(() => repeat.stop, [repeat])

  const startRepeat = (intent: MoveIntent): void => {
    repeat.start(() => onIntent(intent))
  }

  const releasePointerCapture = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const endPress = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    releasePointerCapture(event)
    stopRepeat()
  }

  // Styled like the HUD chips: the pad now sits on the page background rather than
  // on top of the dark canvas, where a translucent dark fill washed out.
  const buttonClass =
    'pointer-events-auto flex size-12 touch-none items-center justify-center rounded-xl border border-white/70 bg-white/90 text-slate-700 shadow-md transition-transform active:scale-90 active:bg-slate-200 dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100 dark:active:bg-slate-800'

  function padButton(intent: MoveIntent, label: string, icon: ReactElement, gridArea: string): ReactElement {
    if (intent === 'wait' && !waitEnabled) {
      // Nothing on this level moves on its own, so a thumb landing between the
      // arrows must not spend a move.
      return (
        <button aria-label={label} className={`${buttonClass} opacity-40`} data-testid="touch-dpad-wait" disabled style={{ gridArea }} type="button">
          {icon}
        </button>
      )
    }

    return (
      <button
        aria-label={label}
        className={buttonClass}
        data-testid={`touch-dpad-${intent}`}
        style={{ gridArea }}
        type="button"
        onContextMenu={(event) => event.preventDefault()}
        onPointerCancel={endPress}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          startRepeat(intent)
        }}
        onPointerUp={endPress}
      >
        {icon}
      </button>
    )
  }

  return (
    <div
      className="pointer-events-none grid shrink-0 touch-none gap-1 select-none"
      data-testid="touch-dpad"
      style={{ gridTemplateAreas: '". up ." "left wait right" ". down ."', gridTemplateColumns: 'repeat(3, 3rem)', gridTemplateRows: 'repeat(3, 3rem)' }}
    >
      {padButton('up', 'Step up', <ChevronUp aria-hidden="true" className="size-5" />, 'up')}
      {padButton('left', 'Step left', <ChevronLeft aria-hidden="true" className="size-5" />, 'left')}
      {padButton('wait', 'Wait', <span aria-hidden="true" className="size-2.5 rounded-full bg-slate-500 dark:bg-white/70" />, 'wait')}
      {padButton('right', 'Step right', <ChevronRight aria-hidden="true" className="size-5" />, 'right')}
      {padButton('down', 'Step down', <ChevronDown aria-hidden="true" className="size-5" />, 'down')}
    </div>
  )
}
