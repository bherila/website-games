import { expect, test } from '@playwright/test'

const PROGRESS_KEY = 'bwh.math-horde.progress.v1'
const TUTORIAL_KEY = 'bwh.math-horde.tutorial.v1'

test.describe('Math Horde gameplay', () => {
  test.use({ deviceScaleFactor: 1 })
  // A complete sector advances through the real render loop; software
  // WebGL runners can need substantially longer than its 22s game time.
  test.setTimeout(180_000)

  test('the tutorial leads to a real sector clear, replay, and persisted unlock', async ({ page, isMobile }) => {
    if (!isMobile) {
      await page.setViewportSize({ width: 1280, height: 720 })
    }
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto('/math-horde')
    await expect(page.getByRole('heading', { name: 'Math Horde', exact: true })).toBeVisible()
    await expect(page.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'false')
    await page.getByTestId('level-tile-1').click()
    const canvas = page.getByTestId('math-horde-scene').locator('canvas')
    await expect(canvas).toBeVisible()
    const tutorial = page.getByRole('dialog', { name: 'How to play', exact: true })
    await expect(tutorial).toContainText('Drag, swipe, or use the ←/→ keys to steer')
    await expect(page.getByTestId('army-size')).toHaveText('5')
    await tutorial.getByRole('button', { name: 'START FIRING', exact: true }).click()
    await expect(tutorial).toBeHidden()
    expect(await page.evaluate((key) => localStorage.getItem(key), TUTORIAL_KEY)).toBe('seen')

    const box = await canvas.boundingBox()
    if (!box) {
      throw new Error('Math Horde canvas is not mounted')
    }
    if (isMobile) {
      await page.touchscreen.tap(box.x + box.width * 0.75, box.y + box.height * 0.65)
    } else {
      // Steer from the centre into the right gate lane using real keys.
      await canvas.click({ position: { x: box.width / 2, y: box.height * 0.65 } })
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
    }

    // These are native keyboard activations of toolbar buttons. Space must
    // reach the focused button without also triggering the global shortcut.
    const mute = page.getByRole('button', { name: 'Mute sound', exact: true })
    await mute.focus()
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Game paused', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Pause', exact: true }).focus()
    await page.keyboard.press('Space')
    const paused = page.getByRole('dialog', { name: 'Game paused', exact: true })
    await expect(paused).toBeVisible()
    await page.waitForTimeout(200)
    const progressIndicator = page.locator('section div[style^="width:"]').first()
    const pausedProgress = await progressIndicator.getAttribute('style')
    const army = await page.getByTestId('army-size').textContent()
    await page.waitForTimeout(350)
    await expect(progressIndicator).toHaveAttribute('style', pausedProgress!)
    await expect(page.getByTestId('army-size')).toHaveText(army!)
    await paused.getByRole('button', { name: 'Resume', exact: true }).focus()
    await page.keyboard.press('Space')
    await expect(paused).toBeHidden()

    // The first right-hand multiplier upgrades to x3. Reaching 15 proves
    // steering took effect; staying in the default centre lane earns 18 from
    // the left-hand addition gate instead.
    await expect(page.getByTestId('army-size')).toHaveText('15', { timeout: 30_000 })
    const complete = page.getByRole('dialog', { name: 'Level complete', exact: true })
    await expect(complete).toBeVisible({ timeout: 120_000 })
    await expect(complete).toContainText('SECTOR CLEAR')
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), PROGRESS_KEY))
      .toMatchObject({ version: 1, unlockedLevel: 2, results: { 1: { stars: expect.any(Number), survivors: expect.any(Number) } } })
    const progress = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PROGRESS_KEY)
    expect(progress.results[1].stars).toBeGreaterThanOrEqual(1)
    expect(progress.results[1].survivors).toBeGreaterThan(0)

    await complete.getByRole('button', { name: 'Replay', exact: true }).click()
    await expect(complete).toBeHidden()
    await expect(tutorial).toHaveCount(0)
    await expect(page.getByTestId('army-size')).toHaveText('5')
    await page.getByRole('button', { name: 'Level select', exact: true }).click()
    await expect(page.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'true')
    await page.reload()
    await expect(page.getByTestId('level-tile-1')).toHaveAttribute('aria-label', `Level 1, ${progress.results[1].stars} stars`)
    await expect(page.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'true')
    await expect(page.getByTestId('level-tile-3')).toHaveAttribute('data-unlocked', 'false')
    await page.getByTestId('level-tile-2').click()
    await expect(page.getByText(/^SECTOR 2 ·/)).toBeVisible()
    await expect(tutorial).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })
})
