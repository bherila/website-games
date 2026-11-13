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
  test('blocked graphics restore editing after retry', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.addInitScript(() => {
      // Preserve the native receiver with Reflect.apply below.
      // oxlint-disable-next-line typescript/unbound-method
      const original = HTMLCanvasElement.prototype.getContext
      const state = window as Window & { blockMarbleGraphics?: boolean }
      state.blockMarbleGraphics = true
      HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
        if (state.blockMarbleGraphics && String(args[0]).startsWith('webgl')) return null
        return Reflect.apply(original, this, args)
      } as typeof original
    })
    await page.goto('/marble-works')
    await page.getByTestId('level-tile-1').click()
    await expect(page.getByRole('alert')).toContainText('Your pieces are kept')
    await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeDisabled()
    await expect(page.getByTestId('tray-ramp-steep')).toBeDisabled()
    await page.evaluate(() => { (window as Window & { blockMarbleGraphics?: boolean }).blockMarbleGraphics = false })
    await page.getByRole('button', { name: 'Retry graphics' }).click()
    await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeEnabled()
    await page.getByTestId('tray-ramp-steep').click()
    const target = await cellPoint(page, 5, 6, 1, 3)
    await page.mouse.click(target.x, target.y)
    await expect(page.getByTestId('tutorial-message')).toContainText('Press Go')
    expect(errors).toEqual([])
  })

  test('context loss keeps placements through graphics retry and the level menu', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto('/marble-works')
    await page.getByTestId('level-tile-1').click()
    await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeEnabled()
    await page.getByTestId('tray-ramp-steep').click()
    const target = await cellPoint(page, 5, 6, 1, 3)
    await page.mouse.click(target.x, target.y)
    await page.getByTestId('marble-works-canvas').dispatchEvent('webglcontextlost', { cancelable: true })
    await expect(page.getByRole('alert')).toBeVisible()
    await page.getByRole('button', { name: 'Retry graphics' }).click()
    await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeEnabled()
    await expect(page.getByTestId('tray-ramp-steep')).toHaveAccessibleName('Steep Ramp, 0 left')
    await page.getByRole('button', { name: 'Level select', exact: true }).click()
    await page.getByTestId('level-tile-1').click()
    await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeEnabled()
    await expect(page.getByTestId('tutorial-message')).toContainText('Press Go')
    await expect(page.getByTestId('tray-ramp-steep')).toHaveAccessibleName('Steep Ramp, 0 left')
    expect(errors).toEqual([])
  })

  test('focused controls respect Clear confirmation and toolbar shortcuts', async ({ page }) => {
    await page.goto('/marble-works?level=1')
    await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeEnabled()
    await page.getByTestId('tray-ramp-steep').click()
    const target = await cellPoint(page, 5, 6, 1, 3)
    await page.mouse.click(target.x, target.y)
    await page.getByRole('button', { name: 'Clear board' }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).focus()
    await page.keyboard.press('f')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('tutorial-message')).toContainText('Press Go')
    await page.getByRole('button', { name: 'Flip piece' }).focus()
    await page.keyboard.press('f')
    await expect(page.getByTestId('tutorial-message')).toContainText('use Flip')
    await page.keyboard.press('f')
    await expect(page.getByTestId('tutorial-message')).toContainText('Press Go')
  })

  test('held Space starts one run and native Stop keeps the board', async ({ page }) => {
    await page.goto('/marble-works?level=1')
    await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeEnabled()
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur() })
    await page.keyboard.down('Space')
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
    await page.keyboard.down('Space')
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
    await page.keyboard.up('Space')
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeEnabled()
  })

  test('the tutorial win unlocks level 2 and keeps progress after reload', async ({ page }) => {
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

    const saved = await page.evaluate(() => window.localStorage.getItem('bwh.marble-works.progress.v2'))
    expect(JSON.parse(saved ?? '{}')).toMatchObject({ unlockedLevel: 2, stars: { 1: 3 } })

    await page.reload()
    await expect(page.getByTestId('level-tile-1')).toHaveAttribute('aria-label', 'Level 1, 3 stars')
    await expect(page.getByTestId('level-tile-2')).toBeEnabled()
    await page.getByTestId('level-tile-2').click()
    await expect(page.getByTestId('marble-works-canvas')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('the board stays inside the viewport without page overflow', async ({ page }) => {
    await page.goto('/marble-works?level=19')
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

  test.describe('on an iPad', () => {
    test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true })

    test('the tray cards are big, clear of the screen edge, and all fit in landscape', async ({ page }) => {
      await page.goto('/marble-works?level=19')
      await expect(page.getByTestId('marble-works-canvas')).toBeVisible()
      const tray = page.getByTestId('piece-tray')
      expect(await tray.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(0)
      const cards = tray.getByRole('button')
      expect(await cards.count()).toBeGreaterThan(0)
      for (const card of await cards.all()) {
        const box = await card.boundingBox()
        expect(box?.x).toBeGreaterThanOrEqual(16)
        expect(box?.width).toBeGreaterThanOrEqual(88)
        expect(box?.height).toBeGreaterThanOrEqual(96)
      }
    })
  })
})
