import { expect, type Page, test } from '@playwright/test'

import type { HoverVisualState } from '../../resources/js/games/hover/visualTestMode'

const SETTINGS_KEY = 'bwh.hover-game.settings.v1'
const PROGRESS_KEY = 'bwh.hover-game.progress.v1'

async function drive(page: Page, isMobile: boolean): Promise<void> {
  if (!isMobile) {
    await page.keyboard.down('w')
    try {
      await expect.poll(async () => Number(await page.getByTestId('speed-value').textContent()), { timeout: 15_000 }).toBeGreaterThan(0)
    } finally {
      await page.keyboard.up('w')
    }
    return
  }

  const stick = await page.getByTestId('touch-stick').boundingBox()
  if (!stick) {
    throw new Error('The touch joystick is not mounted')
  }
  // CDP sends native touch input, including pointer capture and release.
  const session = await page.context().newCDPSession(page)
  const center = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 }
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] })
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: center.x, y: center.y - 36 }],
    })
    await expect.poll(async () => Number(await page.getByTestId('speed-value').textContent()), { timeout: 15_000 }).toBeGreaterThan(0)
  } finally {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await session.detach()
  }
  await expect(page.getByTestId('touch-stick-knob')).toHaveCSS('top', '36px')
}

test.describe('Hover gameplay', () => {
  // Layout and native touch are the contract here; avoid rendering four
  // physical pixels per CSS pixel on software WebGL mobile runners.
  test.use({ deviceScaleFactor: 1 })
  test.setTimeout(120_000)

  test('driving, pause and resume work with keyboard and native touch input', async ({ page, isMobile }) => {
    if (!isMobile) {
      await page.setViewportSize({ width: 1280, height: 720 })
    }
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto('/hover')
    await expect(page.getByRole('heading', { name: 'HOVER', exact: true })).toBeVisible()
    await expect(page.getByTestId('level-select-0')).toBeEnabled()
    await expect(page.getByTestId('level-select-1')).toBeDisabled()
    await page.getByRole('button', { name: 'Start Engine', exact: true }).click()
    await expect(page.getByText('Collect 3 blue flags — beat the drone!', { exact: true })).toBeHidden()
    await expect(page.getByLabel('Rear-view mirror')).toBeVisible()
    await expect(page.getByTestId('flag-dot-blue')).toHaveCount(3)
    await expect(page.getByTestId('flag-dot-red')).toHaveCount(3)
    await expect(page.getByTestId('speed-value')).toHaveText('0')
    await drive(page, isMobile)

    if (isMobile) {
      await page.getByRole('button', { name: 'Pause', exact: true }).tap()
    } else {
      await page.keyboard.press('Escape')
    }
    await expect(page.getByRole('heading', { name: 'PAUSED', exact: true })).toBeVisible()
    // Allow the last throttled HUD snapshot to settle, then prove no physics
    // progresses while paused, even if movement keys are pressed.
    await page.waitForTimeout(250)
    const speed = await page.getByTestId('speed-value').textContent()
    const flagValue = page.getByText(/^flags worth \d+$/)
    const pausedFlagValue = await flagValue.textContent()
    await page.keyboard.press('w')
    await page.waitForTimeout(350)
    await expect(page.getByTestId('speed-value')).toHaveText(speed!)
    await expect(flagValue).toHaveText(pausedFlagValue!)
    await page.getByRole('button', { name: 'Resume', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'PAUSED', exact: true })).toBeHidden()
    await expect(flagValue).not.toHaveText(pausedFlagValue!, { timeout: 15_000 })
    await drive(page, isMobile)

    if (!isMobile) {
      await page.getByRole('button', { name: 'Mute sound', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toBeVisible()
      await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), SETTINGS_KEY))
        .toMatchObject({ muted: true })
    }
    await page.reload()
    await expect(page.getByRole('heading', { name: 'HOVER', exact: true })).toBeVisible()
    await expect(page.getByTestId('level-select-1')).toBeDisabled()
    await page.getByTestId('level-select-0').click()
    await expect(page.getByTestId('score-value')).toHaveText('0')
    await expect(page.getByTestId('speed-value')).toHaveText('0')
    if (!isMobile) {
      await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toBeVisible()
    }
    expect(errors).toEqual([])
  })

  test('the seeded map preview renders another arena without unlocking it', async ({ page, isMobile }) => {
    if (!isMobile) {
      await page.setViewportSize({ width: 1280, height: 720 })
    }
    await page.goto('/hover?visualTest=1&autoStart=1&seed=42&round=3')
    await expect.poll(() => page.evaluate(() => window.__HOVER_VISUAL_READY__ === true), { timeout: 30_000 }).toBe(true)
    const rendered: HoverVisualState | undefined = await page.evaluate(() => window.__HOVER_VISUAL_STATE__)
    // The readiness hook reports the URL seed; the engine offsets it by the
    // round index when generating this arena's spawns.
    expect(rendered).toMatchObject({ mapId: 'neon', seed: 42 })
    await expect(page.getByLabel('Rear-view mirror')).toBeVisible()
    expect(await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY)).toBeNull()
    await page.goto('/hover')
    await expect(page.getByTestId('level-select-0')).toBeEnabled()
    await expect(page.getByTestId('level-select-3')).toBeDisabled()
  })
})
