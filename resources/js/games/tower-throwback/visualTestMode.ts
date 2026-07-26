/**
 * Visual-test hooks — `?visualTest=1&seed=N&scenario=starter|midgame|endgame|fullCar|damage|fire|activityDay|activityNight`
 * with optional `time=day|night`
 * with optional `surface=bulkGhost|eval|heatmap|disasters|toastHistory|shaftResize`
 * boots a deterministic canned tower (engine/scenarios.ts) and Playwright
 * waits on `window.__TOWER_VISUAL_READY__` before screenshotting.
 */

import type { ScenarioName } from './engine/scenarios'
import type { ToastHistoryItem } from './hud/ToastHistoryDrawer'

declare global {
  interface Window {
    __TOWER_VISUAL_READY__?: boolean
    /** Latest GPU draw-call count (renderer.info.render.calls), published in visual-test mode. */
    __TOWER_DRAW_CALLS__?: number
  }
}

export interface VisualTestConfig {
  seed: number
  scenario: ScenarioName
  surface: VisualTestSurface
  time: VisualTestTime
}

export type VisualTestSurface = 'bulkGhost' | 'eval' | 'heatmap' | 'disasters' | 'toastHistory' | 'shaftResize' | null
export type VisualTestTime = 'day' | 'night' | null

const SCENARIOS: readonly ScenarioName[] = ['starter', 'midgame', 'endgame', 'fullCar', 'damage', 'fire', 'activityDay', 'activityNight']
const SURFACES: readonly Exclude<VisualTestSurface, null>[] = ['bulkGhost', 'eval', 'heatmap', 'disasters', 'toastHistory', 'shaftResize']
const TIMES: readonly Exclude<VisualTestTime, null>[] = ['day', 'night']

export function getVisualTestConfig(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
): VisualTestConfig | null {
  const params = new URLSearchParams(search)
  if (params.get('visualTest') !== '1') {
    return null
  }
  const parsedSeed = Number(params.get('seed'))
  const scenarioParam = params.get('scenario')
  const scenario = SCENARIOS.find((name) => name === scenarioParam) ?? 'starter'
  const surfaceParam = params.get('surface')
  const surface = SURFACES.find((name) => name === surfaceParam) ?? null
  const timeParam = params.get('time')
  const time = TIMES.find((name) => name === timeParam) ?? null
  return {
    seed: Number.isFinite(parsedSeed) ? Math.floor(parsedSeed) >>> 0 : 1,
    scenario,
    surface,
    time,
  }
}

export function markVisualReady(): void {
  if (typeof window === 'undefined') {
    return
  }
  window.__TOWER_VISUAL_READY__ = true
}

/** Canned drawer contents for the `surface=toastHistory` screenshot. */
export function visualToastHistoryFixture(): ToastHistoryItem[] {
  return [
    {
      clock: { day: 4, minute: 612 },
      sequence: 3,
      toast: { id: 'visual-fire', type: 'warning', title: 'Fire response dispatched', body: 'Two units are burning on floor 2.' },
    },
    {
      clock: { day: 4, minute: 545 },
      sequence: 2,
      toast: { id: 'visual-star', type: 'starUp', title: 'Three-star tower', body: 'New services are available.' },
    },
    {
      clock: { day: 3, minute: 1080 },
      sequence: 1,
      toast: { id: 'visual-info', type: 'info', title: 'Evening rush complete', body: 'Average elevator wait returned to normal.' },
    },
  ]
}
