import { expect, type Page, test } from '@playwright/test'

import type { GameState } from '../../resources/js/games/marble-sort/gameTypes'

const SNAPSHOT_KEY = 'bwh.marble-sort.snapshot.v4'

/** Read the game's own autosave; all changes to the board come from player input. */
async function savedState(page: Page): Promise<GameState> {
  return page.evaluate((key) => {
    const snapshot = window.localStorage.getItem(key)
    if (!snapshot) {
      throw new Error('Marble Sort has not saved the active level')
    }

    return JSON.parse(snapshot).state
  }, SNAPSHOT_KEY)
}

async function tapHintedBox(page: Page, isMobile: boolean): Promise<void> {
  const hint = page.getByTestId('tap-hint')
  await expect(hint).toBeVisible()
  // The hint's anchor points at the box. Its emoji and animated ring extend
  // beyond that anchor, so the bounding-box centre is not the tap target.
  const point = await hint.evaluate((element: HTMLElement) => {
    const parent = element.offsetParent
    if (!parent) {
      throw new Error('The tap hint has no positioned parent')
    }
    const bounds = parent.getBoundingClientRect()

    return {
      x: bounds.x + Number.parseFloat(element.style.left),
      y: bounds.y + Number.parseFloat(element.style.top),
    }
  })
  if (isMobile) {
    await page.touchscreen.tap(point.x, point.y)
  } else {
    await page.mouse.click(point.x, point.y)
  }
}

test.describe('Marble Sort', () => {
  // Functional input/layout checks keep software WebGL fill cost bounded.
  test.use({ deviceScaleFactor: 1 })
  test.beforeEach(async ({ page, isMobile }) => {
    if (!isMobile) {
      await page.setViewportSize({ width: 1280, height: 720 })
    }
  })
  // Software WebGL on the browser runners can take time to mount the scene.
  test.setTimeout(180_000)

  test('a real box pop survives reload, and Reset restores the board', async ({ page, isMobile }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))

    await page.goto('/marble-sort')
    await expect(page.getByTestId('level-tile-1')).toBeEnabled()
    await expect(page.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'false')
    await page.getByTestId('level-tile-1').click()
    await expect(page.locator('canvas')).toBeVisible()
    const initial = await savedState(page)
    expect(initial.moves).toBe(0)

    await tapHintedBox(page, isMobile)
    await expect(page.getByTestId('tap-hint')).toBeHidden()
    await expect.poll(async () => (await savedState(page)).moves).toBe(1)
    const popped = await savedState(page)
    // Refill dispensers may replace a popped box; count their queued boxes too.
    const remainingBoxes = (state: GameState): number => state.boxes.length
      + state.chutes.reduce((total, chute) => total + chute.remaining, 0)
    expect(remainingBoxes(popped)).toBe(remainingBoxes(initial) - 1)
    expect(popped.nextMarbleSequence).toBe(initial.nextMarbleSequence + 9)

    // Exercise the extra scene remount on desktop. Mobile focuses on native
    // touch and reload/resume within the software WebGL time budget.
    if (!isMobile) {
      await page.getByRole('button', { exact: true, name: 'Level select' }).click()
      await expect(page.getByTestId('level-tile-1')).toBeVisible()
      await expect(page.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'false')
      await page.getByTestId('level-tile-1').click()
      await expect(page.locator('canvas')).toBeVisible()
      await expect(page.getByTestId('tap-hint')).toHaveCount(0)
      expect((await savedState(page)).moves).toBe(1)
    }

    await page.reload()
    await expect(page.locator('canvas')).toBeVisible()
    await expect(page.getByTestId('tap-hint')).toHaveCount(0)
    const resumed = await savedState(page)
    expect(resumed).toMatchObject({ level: 1, seed: initial.seed, moves: 1 })
    expect(resumed.boxes.map((box) => box.id)).toEqual(popped.boxes.map((box) => box.id))

    await page.getByRole('button', { exact: true, name: 'Reset' }).click()
    await expect(page.getByTestId('tap-hint')).toBeVisible()
    await expect.poll(async () => (await savedState(page)).moves).toBe(0)
    const reset = await savedState(page)
    expect(reset).toMatchObject({ level: 1, seed: initial.seed, moves: 0, fallingMarbles: [], conveyor: [] })
    expect(reset.boxes).toEqual(initial.boxes)
    expect(reset.chutes).toEqual(initial.chutes)
    expect(errors).toEqual([])
  })

  test('the tutorial can be navigated and reopened without changing the board', async ({ page, isMobile }) => {
    await page.goto('/marble-sort')
    await page.getByTestId('level-tile-1').click()
    await expect(page.locator('canvas')).toBeVisible()

    await page.getByRole('button', { exact: true, name: 'Tutorial' }).click()
    const tutorial = page.getByRole('dialog', { name: 'Marble Sort' })
    await expect(tutorial).toContainText('Pop exposed tiles')
    await tutorial.getByRole('button', { name: 'Got it' }).press('Enter')
    await expect(tutorial).toContainText('Mystery ? tiles')
    if (isMobile) {
      // Check dismissal and reopening on the phone; desktop covers completion
      // of every step, keeping each software-rendered mobile journey bounded.
      await page.keyboard.press('Escape')
    } else {
      await tutorial.getByRole('button', { name: 'Next' }).press('Enter')
      await expect(tutorial).toContainText('Plain solid color tiles')
      await tutorial.getByRole('button', { name: 'Next' }).press('Enter')
      await expect(tutorial).toContainText('nine marbles')
      await tutorial.getByRole('button', { name: 'Next' }).press('Enter')
      await expect(tutorial).toContainText('Dispensers refill')
      await tutorial.getByRole('button', { name: 'Start playing' }).press('Enter')
    }
    await expect(tutorial).toBeHidden({ timeout: 15_000 })
    await expect(page.getByTestId('tap-hint')).toBeVisible()
    expect((await savedState(page)).moves).toBe(0)

    await page.getByRole('button', { exact: true, name: 'Tutorial' }).click()
    await expect(tutorial).toContainText('Pop exposed tiles')
    await expect(tutorial.getByRole('button', { name: 'Got it' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
