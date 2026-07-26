declare global {
  interface Window {
    __HOVER_VISUAL_READY__?: boolean
    __HOVER_VISUAL_STATE__?: HoverVisualState
  }
}

export interface HoverVisualState {
  frameCount: number
  mapId: string
  renderedAt: number
  seed: number | null
}

export interface HoverVisualTestOptions {
  enabled: boolean
  /** Fixed spawn seed so screenshots are deterministic. */
  seed: number | null
  /** Skip the attract screen and go straight into a round. */
  autoStart: boolean
  /** Round index to auto-start on (selects the map to screenshot). */
  round: number
}

export function readHoverVisualTestOptions(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
): HoverVisualTestOptions {
  const params = new URLSearchParams(search)
  const seedParam = params.get('seed')
  const parsedSeed = seedParam === null ? Number.NaN : Number(seedParam)
  const parsedRound = Number(params.get('round'))

  return {
    enabled: params.get('visualTest') === '1',
    seed: Number.isFinite(parsedSeed) ? Math.floor(parsedSeed) >>> 0 : null,
    autoStart: params.get('autoStart') === '1',
    round: Number.isFinite(parsedRound) && parsedRound > 0 ? Math.floor(parsedRound) : 0,
  }
}

export function resetHoverVisualReadiness(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.__HOVER_VISUAL_READY__ = false
  delete window.__HOVER_VISUAL_STATE__
}

export function markHoverVisualReady(state: HoverVisualState): void {
  if (typeof window === 'undefined') {
    return
  }

  window.__HOVER_VISUAL_STATE__ = state
  window.__HOVER_VISUAL_READY__ = true
}
