import { expect, type Page, test } from '@playwright/test'

declare global {
  interface Window {
    __TOWER_VISUAL_READY__?: boolean
    __TOWER_DRAW_CALLS__?: number
  }
}

/**
 * GPU draw-call budget for Tower Throwback's endgame scene (#1620 item 9).
 *
 * Before atlas-quad batching the endgame drew ~1,053 calls (97% one-mesh-per-unit
 * atlas quads). Batching each z-layer into a single merged BufferGeometry collapses
 * those to a handful. TARGET is the design goal; CEILING is the hard CI gate — a
 * regression that reintroduces per-unit meshes blows straight past it.
 */
const DRAW_CALL_TARGET = 64
const DRAW_CALL_CEILING = 128

async function measureDrawCalls(page: Page): Promise<number> {
  await page.waitForFunction(() => window.__TOWER_VISUAL_READY__ === true, undefined, { timeout: 30_000 })
  // Wait for the throttled render-metrics callback to publish at least once, rather
  // than driving frames ourselves — the scene parks rendering when idle, so a fixed
  // requestAnimationFrame loop can stall and time out.
  await page.waitForFunction(() => typeof window.__TOWER_DRAW_CALLS__ === 'number' && window.__TOWER_DRAW_CALLS__ > 0, undefined, {
    timeout: 30_000,
  })
  const calls = await page.evaluate(() => window.__TOWER_DRAW_CALLS__)
  expect(typeof calls).toBe('number')
  return calls as number
}

test.describe('Tower Throwback draw-call budget', () => {
  for (const time of ['day', 'night'] as const) {
    test(`endgame stays within the draw-call budget at ${time}`, async ({ page }) => {
      await page.goto(`/tower-throwback?visualTest=1&seed=1502&scenario=endgame&time=${time}`)
      await expect(page.locator('canvas').first()).toBeVisible()

      const drawCalls = await measureDrawCalls(page)
      // eslint-disable-next-line no-console
      console.log(`[draw-call budget] endgame ${time}: ${drawCalls} calls (target ${DRAW_CALL_TARGET}, ceiling ${DRAW_CALL_CEILING})`)
      expect(drawCalls).toBeGreaterThan(0)
      expect(drawCalls).toBeLessThanOrEqual(DRAW_CALL_CEILING)
    })
  }
})
