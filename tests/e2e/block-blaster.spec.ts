import { expect, type Page, test } from '@playwright/test'

const PROGRESS_KEY = 'bwh.block-blaster.progress.v1'

async function tapPoint(page: Page, point: { x: number; y: number }): Promise<void> {
  if (page.context().browser()?.browserType().name() === 'chromium' && await page.evaluate(() => navigator.maxTouchPoints > 0)) {
    await page.touchscreen.tap(point.x, point.y)
  } else {
    await page.mouse.click(point.x, point.y)
  }
}

async function sceneBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const canvas = page.getByTestId('block-blaster-scene').locator('canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('Block Blaster canvas is not mounted')
  }
  return box
}

async function shootHint(page: Page): Promise<void> {
  const hint = page.getByTestId('tap-hint')
  await expect(hint).toBeVisible()
  // The marker is anchored to the block's canvas position; its animated finger
  // extends away from that point. Aim at the anchor, as the tutorial requests.
  const anchor = await hint.evaluate((element) => ({
    x: Number.parseFloat((element as HTMLElement).style.left),
    y: Number.parseFloat((element as HTMLElement).style.top),
  }))
  const box = await sceneBox(page)
  await tapPoint(page, { x: box.x + anchor.x, y: box.y + anchor.y })
}

async function shootWide(page: Page): Promise<void> {
  const box = await sceneBox(page)
  // Below and beside the central tutorial platform, clear of the HUD controls.
  await tapPoint(page, { x: box.x + box.width * 0.9, y: box.y + box.height * 0.7 })
}

test.describe('Block Blaster gameplay', () => {
  // Leave room for real physics and scene remounts on software WebGL runners.
  test.setTimeout(60_000)

  test('the tutorial shot earns stars, unlocks the next level, and keeps progress after reload', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto('/block-blaster')
    await expect(page.getByRole('heading', { name: 'Block Blaster' })).toBeVisible()
    await expect(page.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'false')
    await page.getByTestId('level-tile-1').click()
    await expect(page.getByLabel('Balls remaining 5', { exact: true })).toBeVisible()

    const box = await sceneBox(page)
    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()
    expect(box.x).toBeGreaterThanOrEqual(-1)
    expect(box.y).toBeGreaterThanOrEqual(-1)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport!.width + 1)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport!.height + 1)
    await shootHint(page)
    await expect(page.getByLabel('Balls remaining 4', { exact: true })).toBeVisible()
    await expect(page.getByTestId('tap-hint')).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Level complete' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('level-complete-stars')).toHaveAttribute('data-stars', '3')
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), PROGRESS_KEY))
      .toMatchObject({ version: 1, unlockedLevel: 2, stars: { 1: 3 } })

    await page.getByRole('button', { name: 'Next level', exact: true }).click()
    await expect(page.getByLabel('Level 2', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Balls remaining 5', { exact: true })).toBeVisible()
    await sceneBox(page)

    await page.reload()
    await expect(page.getByTestId('level-tile-1')).toHaveAttribute('aria-label', 'Level 1, 3 stars')
    await expect(page.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'true')
    await expect(page.getByTestId('level-tile-3')).toHaveAttribute('data-unlocked', 'false')
    await page.getByTestId('level-tile-2').click()
    await expect(page.getByLabel('Level 2', { exact: true })).toBeVisible()
    await sceneBox(page)
    expect(errors).toEqual([])
  })

  test('retry restores the balls and hint, while leaving an unfinished level keeps it uncompleted', async ({ page }) => {
    await page.goto('/block-blaster')
    await page.getByTestId('level-tile-1').click()
    await expect(page.getByTestId('tap-hint')).toBeVisible()
    await shootWide(page)
    await expect(page.getByLabel('Balls remaining 4', { exact: true })).toBeVisible()
    await expect(page.getByTestId('tap-hint')).toHaveCount(0)
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(page.getByLabel('Balls remaining 5', { exact: true })).toBeVisible()
    await expect(page.getByTestId('tap-hint')).toBeVisible()

    await page.getByRole('button', { name: 'Level select', exact: true }).click()
    await expect(page.getByTestId('block-blaster-scene')).toHaveCount(0)
    await expect(page.getByTestId('level-tile-1')).toHaveAttribute('aria-label', 'Level 1, 0 stars')
    await expect(page.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'false')
    await page.reload()
    await expect(page.getByTestId('level-tile-1')).toHaveAttribute('aria-label', 'Level 1, 0 stars')
    await page.getByTestId('level-tile-1').click()
    await expect(page.getByLabel('Balls remaining 5', { exact: true })).toBeVisible()
    await expect(page.getByTestId('tap-hint')).toBeVisible()
  })

  test('missing every shot reaches the loss overlay and replay starts a fresh attempt', async ({ page }) => {
    await page.goto('/block-blaster')
    await page.getByTestId('level-tile-1').click()
    await expect(page.getByTestId('tap-hint')).toBeVisible()
    for (let remaining = 4; remaining >= 0; remaining -= 1) {
      await shootWide(page)
      await expect(page.getByLabel(`Balls remaining ${remaining}`, { exact: true })).toBeVisible()
      if (remaining > 0) {
        // Deliberate pacing: the game rejects shots within its 250ms cooldown.
        await page.waitForTimeout(300)
      }
    }
    const failure = page.getByRole('dialog', { name: 'Level failed' })
    await expect(failure).toBeVisible({ timeout: 15_000 })
    await failure.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(failure).toHaveCount(0)
    await expect(page.getByLabel('Balls remaining 5', { exact: true })).toBeVisible()
    await expect(page.getByTestId('tap-hint')).toBeVisible()
  })
})
