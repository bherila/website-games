import { expect, type Page, test } from '@playwright/test'

const BOARD = '[data-testid="marble-works-board"]'
const MARGIN_CELLS = 0.45

/** Centre of a grid cell in page coordinates, mirroring board/layout.ts's contain fit. */
async function cellPoint(page: Page, cols: number, rows: number, col: number, row: number): Promise<{ x: number; y: number }> {
  const box = await page.locator(BOARD).boundingBox()
  if (!box) {
    throw new Error('board not mounted')
  }
  const cell = Math.min(box.width / (cols + (MARGIN_CELLS * 2)), box.height / (rows + (MARGIN_CELLS * 2)))
  const left = (box.width - (cols * cell)) / 2
  const top = (box.height - (rows * cell)) / 2

  return { x: box.x + left + ((col + 0.5) * cell), y: box.y + top + ((row + 0.5) * cell) }
}

test.describe('Marble Works', () => {
  test('the tutorial level can be built, run and won, unlocking level 2', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))

    await page.goto('/marble-works')
    await page.getByTestId('level-tile-1').click()
    await expect(page.getByTestId('marble-works-canvas')).toBeVisible()
    await expect(page.getByTestId('tutorial-message')).toContainText('Tap the ramp')

    await page.getByTestId('tray-ramp-steep').click()
    await expect(page.getByTestId('tutorial-message')).toContainText('glowing spot')
    const target = await cellPoint(page, 5, 6, 1, 3)
    await page.mouse.click(target.x, target.y)
    await expect(page.getByTestId('tutorial-message')).toContainText('Press Go')

    await page.getByRole('button', { name: 'Go' }).click()
    await expect(page.getByRole('dialog', { name: 'Level complete' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('level-complete-stars')).toHaveAttribute('data-stars', '3')

    const saved = await page.evaluate(() => window.localStorage.getItem('bwh.marble-works.progress.v1'))
    expect(JSON.parse(saved ?? '{}')).toMatchObject({ unlockedLevel: 2, stars: { 1: 3 } })
    expect(errors).toEqual([])
  })

  test('the board stays inside the viewport without page overflow', async ({ page }) => {
    await page.goto('/marble-works?level=12')
    await expect(page.getByTestId('marble-works-canvas')).toBeVisible()
    const viewport = page.viewportSize()
    const box = await page.locator(BOARD).boundingBox()
    expect(viewport && box).toBeTruthy()
    if (!viewport || !box) {
      return
    }
    expect(box.x).toBeGreaterThanOrEqual(-1)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
