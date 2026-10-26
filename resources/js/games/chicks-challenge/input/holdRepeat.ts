import { INPUT_REPEAT_DELAY_MS, INPUT_REPEAT_MS } from '../gameTypes'

/**
 * Press-and-hold auto-repeat shared by every Chick's Challenge input source
 * (keyboard, swipe-and-hold, D-pad). `start` fires once immediately; repeats
 * begin only after `delayMs` of continuous holding, then follow every
 * `intervalMs`, like a keyboard's repeat delay.
 *
 * The delay is what keeps one press one step on a phone. With repeats starting
 * at the plain cadence (150 ms), a D-pad press held for ~200 ms, or a swipe
 * whose finger kept moving for 150 ms after crossing the threshold, already
 * produced a second step — on a step puzzle with no slack, an unintended move.
 */
export interface HoldRepeat {
  start: (fire: () => void) => void
  stop: () => void
}

export function createHoldRepeat(delayMs: number = INPUT_REPEAT_DELAY_MS, intervalMs: number = INPUT_REPEAT_MS): HoldRepeat {
  let delayId: number | null = null
  let intervalId: number | null = null

  const stop = (): void => {
    if (delayId !== null) {
      window.clearTimeout(delayId)
      delayId = null
    }
    if (intervalId !== null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
  }

  return {
    start(fire: () => void): void {
      stop()
      fire()
      delayId = window.setTimeout(() => {
        delayId = null
        fire()
        intervalId = window.setInterval(fire, intervalMs)
      }, delayMs)
    },
    stop,
  }
}
