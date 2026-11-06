import { type ReactElement, useRef } from 'react'

import { useDialogFocus } from '../tower-throwback/overlays/dialogFocus'

/** A blocker until the existing plan can be seen and edited again. */
export function GraphicsUnavailable({ onRetry }: { onRetry: () => void }): ReactElement {
  const dialogRef = useRef<HTMLElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const { onDialogKeyDown } = useDialogFocus({
    dialogRef,
    initialFocusRef: retryRef,
    onRestoreFocus: () => document.querySelector<HTMLCanvasElement>('canvas[aria-label="Building plan"]')?.focus(),
  })

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950 p-6">
      <section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="tower2-graphics-title" aria-describedby="tower2-graphics-description" onKeyDown={onDialogKeyDown} className="max-w-md rounded-2xl border border-amber-400/40 bg-slate-900 p-5 text-white shadow-xl">
        <h2 id="tower2-graphics-title" className="text-lg font-bold text-amber-100">Graphics unavailable</h2>
        <div id="tower2-graphics-description" className="mt-2 space-y-2 text-sm text-white/80">
          <p>Tower 2 could not start its WebGL graphics. Enable hardware acceleration or close other 3D tabs, then try again.</p>
          <p>Your plan is still here. Try again to continue building.</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button ref={retryRef} type="button" onClick={onRetry} className="rounded-lg bg-cyan-300 px-3 py-2 font-bold text-slate-950 hover:bg-cyan-200">Try again</button>
          <a href="/" className="rounded-lg bg-white/10 px-3 py-2 font-semibold hover:bg-white/20">Back to games</a>
        </div>
      </section>
    </div>
  )
}
