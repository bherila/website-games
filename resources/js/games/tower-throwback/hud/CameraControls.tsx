/**
 * Visible zoom affordance. Wheel and pinch already work, but neither is
 * discoverable and pinch is awkward on small touch targets — these buttons are
 * the only camera control a touch player can find without documentation.
 *
 * Camera-only: nothing here enqueues an engine command or reads engine state.
 */
import type { ReactElement } from 'react'

interface CameraControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFitTower: () => void
}

const BUTTON_CLASS =
  'inline-flex h-8 w-8 items-center justify-center text-sm font-bold text-white/85 transition-colors hover:bg-white/15'

export function CameraControls({ onZoomIn, onZoomOut, onFitTower }: CameraControlsProps): ReactElement {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg bg-slate-950/70 shadow-lg backdrop-blur-sm"
      role="group"
      aria-label="Camera zoom"
    >
      <button type="button" data-testid="zoom-in" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn} className={BUTTON_CLASS}>
        <span aria-hidden="true">+</span>
      </button>
      <button
        type="button"
        data-testid="zoom-out"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={onZoomOut}
        className={`${BUTTON_CLASS} border-t border-white/10`}
      >
        <span aria-hidden="true">−</span>
      </button>
      <button
        type="button"
        data-testid="zoom-fit"
        aria-label="Fit whole tower"
        title="Fit whole tower"
        onClick={onFitTower}
        className={`${BUTTON_CLASS} border-t border-white/10 text-[11px]`}
      >
        <span aria-hidden="true">⤢</span>
      </button>
    </div>
  )
}
