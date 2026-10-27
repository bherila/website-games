/**
 * WebGL context-loss wiring. A GPU reset (driver hiccup, tab backgrounded for a
 * long soak, OOM) fires `webglcontextlost` on the canvas; unless the event is
 * `preventDefault()`-ed the browser never fires `webglcontextrestored`, leaving
 * a permanently blank canvas while the sim + autosave keep running. This helper
 * keeps that wiring in one testable place, separate from the renderer so it can
 * be exercised without a live GL context.
 */

export interface ContextLossCallbacks {
  /** Fired after the lost event is preventDefault()-ed; pause rendering here. */
  onLost: () => void
  /** Fired when the GPU context comes back; rebuild resources + resume here. */
  onRestored: () => void
}

/** Attach the loss/restore listeners to `canvas`; returns a detach cleanup. */
export function attachContextLossHandlers(canvas: HTMLCanvasElement, callbacks: ContextLossCallbacks): () => void {
  const onLost = (event: Event): void => {
    // Mandatory: without preventDefault the context is never restored.
    event.preventDefault()
    callbacks.onLost()
  }
  const onRestored = (): void => {
    callbacks.onRestored()
  }

  canvas.addEventListener('webglcontextlost', onLost as EventListener, false)
  canvas.addEventListener('webglcontextrestored', onRestored as EventListener, false)

  return () => {
    canvas.removeEventListener('webglcontextlost', onLost as EventListener, false)
    canvas.removeEventListener('webglcontextrestored', onRestored as EventListener, false)
  }
}
