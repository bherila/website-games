/**
 * When the canvas redraws. Hands-on moments (a drag, a pan, a pinch, or input
 * in the last moment) render every display frame; otherwise only the walking
 * visitors change, and 30 frames a second keeps them smooth for a fraction of
 * the GPU time a 120 Hz display would spend.
 */

export const IDLE_FRAME_MS = 1000 / 30
/** How long after the last input the view keeps rendering at full rate. */
export const INPUT_LINGER_MS = 400
/** Highest device pixel ratio drawn; the flat-shaded plan stays crisp at 1.5. */
export const MAX_PIXEL_RATIO = 1.5

export interface FrameClock {
  lastRenderAt: number
  lastInputAt: number
}

export function shouldRender(clock: FrameClock, now: number, handsOn: boolean): boolean {
  if (handsOn || now - clock.lastInputAt < INPUT_LINGER_MS) return true
  // A small allowance keeps a 60 Hz display on an even every-other-frame cadence.
  return now - clock.lastRenderAt >= IDLE_FRAME_MS - 2
}

export function pixelRatioFor(devicePixelRatio: number | undefined): number {
  return Math.min(MAX_PIXEL_RATIO, devicePixelRatio || 1)
}
