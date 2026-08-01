/**
 * Shown when the WebGL renderer cannot be CREATED at all — a blocked or
 * software-disabled GPU, an exhausted context pool, a browser without WebGL.
 *
 * This is distinct from context loss (`contextLoss.ts`), which happens after a
 * successful start and is recoverable in place. Here there is no canvas to
 * recover, so the job is to say so plainly, offer a retry, and keep the player's
 * save reachable instead of leaving a blank rectangle behind.
 */
import { type ReactElement, useRef } from 'react'

import { useDialogFocus } from './dialogFocus'

interface RendererUnavailableProps {
  /** Best-effort detail from the failed construction; omitted when unknown. */
  detail: string | null
  onRetry: () => void
  onExit: () => void
}

export function RendererUnavailable({ detail, onRetry, onExit }: RendererUnavailableProps): ReactElement {
  const dialogRef = useRef<HTMLElement | null>(null)
  const retryButtonRef = useRef<HTMLButtonElement | null>(null)
  const { onDialogKeyDown } = useDialogFocus({
    dialogRef,
    initialFocusRef: retryButtonRef,
  })

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950 p-6"
      data-testid="renderer-unavailable"
    >
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="renderer-unavailable-title"
        onKeyDown={onDialogKeyDown}
        className="max-w-md rounded-xl border border-amber-400/40 bg-slate-900/90 p-5 text-white shadow-xl"
      >
        <h2 id="renderer-unavailable-title" className="text-lg font-bold text-amber-100">Graphics unavailable</h2>
        <p className="mt-2 text-sm text-white/75">
          Tower Throwback needs WebGL, and this browser could not start it. Hardware acceleration may be turned off, or
          too many other 3D tabs may be open.
        </p>
        <p className="mt-2 text-sm text-white/75">Your saved tower is safe — nothing was overwritten.</p>
        {detail && (
          <p className="mt-2 break-words rounded bg-black/30 px-2 py-1 font-mono text-[11px] text-white/50" data-testid="renderer-unavailable-detail">
            {detail}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            ref={retryButtonRef}
            type="button"
            data-testid="renderer-retry"
            onClick={onRetry}
            className="rounded bg-sky-500/85 px-3 py-1.5 text-sm font-bold text-slate-950 hover:bg-sky-400"
          >
            Try again
          </button>
          <button
            type="button"
            data-testid="renderer-exit"
            onClick={onExit}
            className="rounded bg-white/10 px-3 py-1.5 text-sm font-bold text-white/85 hover:bg-white/20"
          >
            Back to games
          </button>
        </div>
      </section>
    </div>
  )
}
