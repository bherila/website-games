import { type ReactElement, useRef } from 'react'

import { useDialogFocus } from '../../tower-throwback/overlays/dialogFocus'

export function GraphicsUnavailable({ onRetry, onExit, onRestoreFocus }: {
  onRetry: () => void
  onExit: () => void
  onRestoreFocus: () => void
}): ReactElement {
  const dialogRef = useRef<HTMLElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const { onDialogKeyDown } = useDialogFocus({ dialogRef, initialFocusRef: retryRef, onRestoreFocus })

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950 p-4">
      <section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="tower-defense-graphics-title" aria-describedby="tower-defense-graphics-description" onKeyDown={onDialogKeyDown} className="max-w-sm rounded-3xl border border-amber-400/40 bg-slate-900 p-5 text-white shadow-2xl">
        <h2 id="tower-defense-graphics-title" className="text-xl font-black">Graphics unavailable</h2>
        <p id="tower-defense-graphics-description" className="mt-3 text-sm text-slate-200">
          Tower Defense could not start its 3D graphics. Your run is paused. Close other 3D tabs or enable hardware acceleration, then retry to return to this run paused. You can also return to level select without replacing it.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button ref={retryRef} type="button" onClick={onRetry} className="min-h-12 rounded-full bg-amber-400 px-4 font-black text-amber-950">Retry graphics</button>
          <button type="button" onClick={onExit} className="min-h-12 rounded-full bg-white/10 px-4 font-bold">Level select</button>
        </div>
      </section>
    </div>
  )
}
