import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

import { expect, type Page, test } from '@playwright/test'

import { SANDBOX_STORAGE_KEY } from '../../resources/js/games/tower-throwback/gameTypes'

declare global {
  interface Window {
    __TOWER_VISUAL_READY__?: boolean
    __TOWER_DRAW_CALLS__?: number
  }
}

/**
 * GPU draw-call budget for small endgame and large saved towers.
 *
 * Before atlas-quad batching the endgame drew ~1,053 calls (97% one-mesh-per-unit
 * atlas quads). Batching each z-layer into a single merged BufferGeometry collapses
 * those to a handful. TARGET is the design goal; CEILING is the hard CI gate — a
 * regression that reintroduces per-unit meshes blows straight past it.
 */
const DRAW_CALL_TARGET = 64
const DRAW_CALL_CEILING = 128

/** Reuse the reviewed 1,417-unit rush-hour tower without shipping test data to players. */
const largeTower = JSON.parse(gunzipSync(readFileSync(new URL('../../resources/js/games/tower-throwback/__tests__/fixtures/big-bot-tower.v2.json.gz', import.meta.url))).toString('utf8')) as {
  units: unknown[]
  clock: { day: number; minute: number }
  speed: number
}

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
  // Draw calls measure scene batches, not pixel fill rate. Keep phone layout
  // while avoiding unnecessary high-DPI work on software WebGL runners.
  test.use({ deviceScaleFactor: 1 })
  for (const time of ['day', 'night'] as const) {
    test(`endgame stays within the draw-call budget at ${time}`, async ({ page }) => {
      await page.goto(`/tower-throwback?visualTest=1&seed=1502&scenario=endgame&time=${time}`)
      await expect(page.locator('canvas').first()).toBeVisible()

      const drawCalls = await measureDrawCalls(page)

      console.log(`[draw-call budget] endgame ${time}: ${drawCalls} calls (target ${DRAW_CALL_TARGET}, ceiling ${DRAW_CALL_CEILING})`)
      expect(drawCalls).toBeGreaterThan(0)
      expect(drawCalls).toBeLessThanOrEqual(DRAW_CALL_CEILING)
    })

    test(`a large saved tower stays within the draw-call budget at ${time}`, async ({ page, isMobile }) => {
      if (!isMobile) await page.setViewportSize({ width: 1280, height: 720 })
      // The saved simulation is paused. Render deliberate real frames instead
      // of spending software-GPU time drawing continuously during UI setup.
      const now = new Date()
      await page.clock.install({ time: new Date(now.getTime() - 3_600_000) })
      await page.clock.pauseAt(now)
      const atlasFailures: string[] = []
      page.on('console', (message) => {
        if (message.text().includes('style-gate atlas failed to load')) atlasFailures.push(message.text())
      })
      expect(largeTower.units.length).toBeGreaterThanOrEqual(1_400)
      expect(largeTower.units.length).toBeLessThanOrEqual(1_500)
      await page.addInitScript(({ key, saved }) => {
        localStorage.setItem(key, saved)
      }, {
        key: SANDBOX_STORAGE_KEY,
        saved: JSON.stringify({ ...largeTower, speed: 0, clock: { ...largeTower.clock, minute: time === 'day' ? 720 : 60 } }),
      })
      await page.goto('/tower-throwback?renderStats=1')
      await page.getByTestId('resume-autosave').click()
      // The real HUD publishes at 10 Hz; include that first snapshot.
      await page.clock.runFor(150)
      await expect(page.locator('canvas').first()).toBeVisible()
      await expect(page.getByTestId('speed-0')).toHaveAttribute('aria-pressed', 'true')

      // Check the restored scene, not just the source JSON: a failed import or
      // a fallback starter must never satisfy the large-tower budget check.
      const inventory = page.getByRole('button', { name: 'Inventory', exact: true })
      if (!await inventory.isVisible()) await page.getByRole('button', { name: 'More', exact: true }).click()
      await inventory.click()
      await expect(page.getByRole('dialog', { name: 'Tower inventory' })).toContainText(`${largeTower.units.length.toLocaleString()} units`)
      await page.getByRole('button', { name: 'Close tower inventory', exact: true }).click()
      await expect.poll(async () => {
        await page.clock.runFor(150)
        return page.evaluate(() => window.__TOWER_VISUAL_READY__ === true)
      }).toBe(true)
      expect(atlasFailures, 'measure the loaded atlas rather than fallback artwork').toEqual([])
      // Discard the initial sample before the action, then prove a post-fit
      // render reported a viewport enclosing the complete occupied range.
      await page.evaluate(() => { delete window.__TOWER_DRAW_CALLS__ })
      await page.getByTestId('zoom-fit').focus()
      await page.keyboard.press('Enter')
      let sample = { fits: false, calls: 0 }
      await expect.poll(async () => {
        await page.clock.runFor(16)
        sample = await page.evaluate(() => {
          const camera = document.querySelector('[data-testid="camera-floor-range"]')?.getBoundingClientRect()
          const occupied = document.querySelector('[data-testid="occupied-floor-range"]')?.getBoundingClientRect()
          return {
            fits: !!camera && !!occupied && camera.top <= occupied.top + 0.5 && camera.bottom >= occupied.bottom - 0.5,
            calls: window.__TOWER_DRAW_CALLS__ ?? 0,
          }
        })
        return sample.fits && sample.calls > 0
      }).toBe(true)
      const drawCalls = sample.calls

      console.log(`[draw-call budget] ${largeTower.units.length} units ${time}: ${drawCalls} calls (ceiling ${DRAW_CALL_CEILING})`)
      expect(drawCalls).toBeGreaterThan(0)
      expect(drawCalls).toBeLessThanOrEqual(DRAW_CALL_CEILING)
    })
  }
})
