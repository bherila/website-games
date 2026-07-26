import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, type Page, test, type TestInfo } from '@playwright/test'

declare global {
  interface Window {
    __TOWER_VISUAL_READY__?: boolean
  }
}

const SCENARIOS = [
  { name: 'full-car', scenario: 'fullCar' },
  { name: 'damage-explosion-fire', scenario: 'damage' },
] as const
const ART_PACK_SCENARIOS = ['starter', 'midgame', 'endgame'] as const
const ART_PACK_TIMES = ['day', 'night'] as const
const OCCUPIED_UNIT_SCENARIOS = [
  { name: 'occupied-units-day', scenario: 'activityDay' },
  { name: 'occupied-units-night', scenario: 'activityNight' },
] as const

const SCREENSHOT_DIR = path.join('test-results', 'tower-throwback')

test.describe('Tower Throwback visual harness', () => {
  for (const scenario of ART_PACK_SCENARIOS) {
    for (const time of ART_PACK_TIMES) {
      test(`captures the ${scenario} art pack at ${time}`, async ({ page }, testInfo) => {
        await page.goto(`/games/tower-throwback?visualTest=1&seed=1502&scenario=${scenario}&time=${time}`)
        await waitForVisualReady(page)

        await expect(page.locator('canvas').first()).toBeVisible()
        await capture(page, testInfo, `art-pack-${scenario}-${time}`)
      })
    }
  }

  for (const scenario of SCENARIOS) {
    test(`captures ${scenario.name}`, async ({ page }, testInfo) => {
      await page.goto(`/games/tower-throwback?visualTest=1&seed=1551&scenario=${scenario.scenario}`)
      await waitForVisualReady(page)

      const canvas = page.locator('canvas').first()
      await expect(canvas).toBeVisible()
      await capture(page, testInfo, scenario.name)
      if (scenario.scenario === 'damage') {
        const saved = await page.evaluate(() => ({
          progress: window.localStorage.getItem('bwh.tower-throwback.progress.v1'),
          sandbox: window.localStorage.getItem('bwh.tower-throwback.sandbox.v1'),
        }))
        expect(saved).toEqual({ progress: null, sandbox: null })
      }
    })
  }

  for (const scenario of OCCUPIED_UNIT_SCENARIOS) {
    test(`captures ${scenario.name}`, async ({ page }, testInfo) => {
      await page.goto(`/games/tower-throwback?visualTest=1&seed=1555&scenario=${scenario.scenario}`)
      await waitForVisualReady(page)
      await zoomForInteriorArt(page)
      await capture(page, testInfo, scenario.name)
    })
  }

  test('captures a valid stacked slab bulk preview', async ({ page }, testInfo) => {
    await page.goto('/games/tower-throwback?visualTest=1&seed=1551&scenario=starter&surface=bulkGhost')
    await waitForVisualReady(page)

    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible()

    await capture(page, testInfo, 'bulk-ghost')
  })

  test('captures the Eval overlay', async ({ page }, testInfo) => {
    await page.goto('/games/tower-throwback?visualTest=1&seed=1553&scenario=midgame&surface=eval')
    await waitForVisualReady(page)

    await expect(page.getByTestId('overlay-eval')).toHaveAttribute('aria-pressed', 'true')
    await capture(page, testInfo, 'eval-overlay')
  })

  test('captures heatmap navigation and tile explanation', async ({ page }, testInfo) => {
    test.setTimeout(60_000)
    await page.goto('/games/tower-throwback?visualTest=1&seed=1501&scenario=midgame&surface=heatmap')
    await waitForVisualReady(page)

    await expect(page.getByTestId('overlay-noise')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('overlay-legend-noise')).toContainText('Noise exposure')
    const canvas = page.locator('canvas').first()
    await canvas.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      element.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        ctrlKey: true,
        deltaY: -240,
      }))
    })
    const navigator = page.getByRole('slider', { name: 'Tower floor navigator' })
    const currentFloor = page.getByLabel('Current camera floor')
    await expect(navigator).toBeVisible()
    const initialFloor = await currentFloor.textContent()
    await navigator.click({ position: { x: 14, y: 18 } })
    await expect(currentFloor).not.toHaveText(initialFloor ?? '')

    const box = await canvas.boundingBox()
    if (!box) {
      throw new Error('Tower canvas has no layout box')
    }
    await canvas.click({ force: true, position: { x: box.width / 2, y: box.height * 0.92 } })
    await expect(page.getByTestId('overlay-tile-sample')).toBeVisible()
    await capture(page, testInfo, 'heatmap-navigation')
  })

  test('captures the disaster setting', async ({ page }, testInfo) => {
    await page.goto('/games/tower-throwback?visualTest=1&seed=1553&scenario=starter&surface=disasters')
    await waitForVisualReady(page)

    await expect(page.getByText('Disasters: on')).toBeVisible()
    await capture(page, testInfo, 'disable-disasters')
  })

  test('captures populated toast history', async ({ page }, testInfo) => {
    await page.goto('/games/tower-throwback?visualTest=1&seed=1553&scenario=fire&surface=toastHistory')
    await waitForVisualReady(page)

    const drawer = page.getByRole('complementary', { name: 'Recent events' })
    await expect(drawer).toBeVisible()
    await expect(page.getByText('Fire response dispatched')).toBeVisible()

    await page.getByRole('button', { name: 'Close recent events' }).click()
    await expect(drawer).toBeHidden()
    await expect(page.getByTestId('fire-banner')).toContainText('2 units burning')
    await capture(page, testInfo, 'fire-dispatch')

    await page.getByRole('button', { name: 'Toggle recent events' }).click()
    await expect(drawer).toBeVisible()
    await capture(page, testInfo, 'toast-history')
  })

  test('captures a valid shaft resize preview', async ({ page }, testInfo) => {
    await page.goto('/games/tower-throwback?visualTest=1&seed=1553&scenario=midgame&surface=shaftResize')
    await waitForVisualReady(page)

    await expect(page.getByTestId('shaft-resize-readout')).toContainText('refund')
    await capture(page, testInfo, 'shaft-resize')
  })

})

async function waitForVisualReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__TOWER_VISUAL_READY__ === true, undefined, { timeout: 30_000 })
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

async function zoomForInteriorArt(page: Page): Promise<void> {
  await page.locator('canvas').first().evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect()
    for (let step = 0; step < 1; step += 1) {
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        ctrlKey: true,
        deltaY: -100,
      }))
    }
  })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const screenshot = await page.screenshot({ fullPage: false })
  const filename = `${name}-${testInfo.project.name}.png`

  await testInfo.attach(filename, { body: screenshot, contentType: 'image/png' })
  await mkdir(SCREENSHOT_DIR, { recursive: true })
  await writeFile(path.join(SCREENSHOT_DIR, filename), screenshot)
}
