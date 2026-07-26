import type { ReactElement } from 'react'

export interface TapHintPosition {
  x: number
  y: number
}

/** Pulsing "tap here" marker anchored at a canvas-relative CSS pixel position. */
export function TapHint({ position }: { position: TapHintPosition | null }): ReactElement | null {
  if (!position) {
    return null
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
      data-testid="tap-hint"
      style={{ left: position.x, top: position.y }}
    >
      <span className="absolute inset-0 -m-4 animate-ping rounded-full border-4 border-white/80" />
      <span className="absolute inset-0 -m-4 rounded-full border-2 border-white/90" />
      <span className="relative -bottom-2 -right-2 block text-3xl motion-safe:animate-bounce">👆</span>
    </div>
  )
}
