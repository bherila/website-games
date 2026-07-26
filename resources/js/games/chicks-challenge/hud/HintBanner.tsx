import type { ReactElement } from 'react'

interface HintBannerProps {
  text: string
}

/**
 * Bottom banner shown while the player stands on a hint tile
 * (docs/games/chicks-challenge.md "HUD & screens"). Overlays the bottom of the
 * playfield rather than the toolbar, and wraps instead of overflowing on a
 * narrow phone.
 */
export function HintBanner({ text }: HintBannerProps): ReactElement {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-2">
      <p
        className="max-w-full rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-center text-xs font-medium text-balance text-slate-700 shadow-md sm:text-sm dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-200"
        data-testid="hint-banner"
      >
        {text}
      </p>
    </div>
  )
}
