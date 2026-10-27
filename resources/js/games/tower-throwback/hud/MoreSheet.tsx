import { type ReactElement, type ReactNode, useRef, useSyncExternalStore } from 'react'

import { useDialogFocus } from '../overlays/dialogFocus'

const NARROW_QUERY = '(max-width: 639px)'

function narrowSnapshot(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches
}

function subscribeToWidth(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(NARROW_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Match the HUD's sm breakpoint, including rotation/resizing during a session. */
export function useNarrowHud(): boolean {
  return useSyncExternalStore(subscribeToWidth, narrowSnapshot, () => false)
}

interface MoreSheetProps {
  onClose: () => void
  onRestoreFocus: () => void
  children: (close: () => void) => ReactNode
}

/** Secondary phone controls share one blocking sheet; desktop keeps its toolbar. */
export function MoreSheet({ children, onClose, onRestoreFocus }: MoreSheetProps): ReactElement {
  const dialogRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const { onDialogKeyDown, restoreFocus } = useDialogFocus({ dialogRef, initialFocusRef: closeRef, onEscape: onClose, onRestoreFocus })
  const close = (): void => {
    // Restore before a child action mounts another dialog, so cleanup cannot
    // take focus away from the new dialog's own initial control.
    restoreFocus()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-slate-950/70" onClick={close}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tower-more-title"
        onKeyDown={onDialogKeyDown}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl border border-white/15 bg-slate-900 p-4 text-white shadow-2xl [&_button]:min-h-11 [&_button]:min-w-11"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="tower-more-title" className="font-bold">More</h2>
          <button ref={closeRef} type="button" aria-label="Close More" className="rounded-lg bg-slate-800 px-3 font-semibold" onClick={close}>Close</button>
        </div>
        <div className="flex flex-wrap items-start gap-3">{children(close)}</div>
      </section>
    </div>
  )
}
