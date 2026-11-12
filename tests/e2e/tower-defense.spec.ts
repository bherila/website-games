import { expect, type Page, test } from '@playwright/test'

import { CAMERA_TILT, frameBoard } from '../../resources/js/games/tower-defense/scene/boardCamera'

const TUTORIAL_KEY = 'bwh.tower-defense.tutorial.v1'
const COLS = 13
const ROWS = 21

async function canvasCenter(page: Page, shiftX = 0, shiftY = 0): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('tower-defense-canvas').boundingBox()
  if (!box) {
    throw new Error('battlefield not mounted')
  }

  return { x: box.x + (box.width / 2) + (box.width * shiftX), y: box.y + (box.height / 2) + (box.height * shiftY) }
}

/** Centre of a board cell in page coordinates, using the game's own camera framing. */
async function cellPoint(page: Page, col: number, row: number): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('tower-defense-canvas').boundingBox()
  if (!box) {
    throw new Error('battlefield not mounted')
  }
  const frame = frameBoard(box.width, box.height)
  const across = frame.sideways ? -((row + 0.5) - (ROWS / 2)) : (col + 0.5) - (COLS / 2)
  const deep = frame.sideways ? (col + 0.5) - (COLS / 2) : (row + 0.5) - (ROWS / 2)

  return {
    x: box.x + (box.width / 2) + (across / frame.unitsPerPixel),
    y: box.y + (box.height / 2) + (((deep * Math.cos(CAMERA_TILT)) + frame.liftUnits) / frame.unitsPerPixel),
  }
}

async function gold(page: Page): Promise<number> {
  return Number(await page.getByTestId('gold').textContent())
}

test.describe('Tower Defense', () => {
  test.use({ deviceScaleFactor: 1 })
  test.setTimeout(240_000)

  test('a hero builds a tower, a wave comes, the tower kills, and coins buy more', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))

    await page.goto('/tower-defense')
    await expect(page.getByRole('heading', { name: 'Tower Defense', exact: true })).toBeVisible()
    await page.getByTestId('level-tile-1').click()

    const tutorial = page.getByRole('dialog', { name: 'How to play' })
    await expect(tutorial).toContainText('Your hero runs over and builds it')
    await tutorial.getByRole('button', { name: 'Start building' }).click()
    await expect(tutorial).toBeHidden()
    expect(await page.evaluate((key) => localStorage.getItem(key), TUTORIAL_KEY)).toBe('seen')

    await expect(page.getByTestId('gold')).toHaveText('100')
    const play = page.getByTestId('tower-defense-play')

    // The tray's art really loaded; a bad path would still leave a working, blank button.
    await expect.poll(() => page.getByTestId('tray-arrow').locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)

    // Three arrow towers around the middle of the board, beside the walkers' route.
    await page.getByTestId('tray-arrow').click()
    for (const [x, y] of [[0.2, 0], [-0.2, 0.08], [0.2, 0.16]] as const) {
      const spot = await canvasCenter(page, x, y)
      await page.mouse.click(spot.x, spot.y)
    }
    await expect(page.getByTestId('gold')).toHaveText('10')
    await page.getByTestId('tray-arrow').click()
    await expect(play).toHaveAttribute('data-buildings', '3', { timeout: 60_000 })

    await page.getByRole('button', { name: 'Double speed' }).click()
    await page.getByRole('button', { name: 'Send next wave' }).click()
    await expect(page.getByTestId('wave')).toHaveText('1/8')
    await expect.poll(async () => Number(await play.getAttribute('data-enemies')), { timeout: 60_000 }).toBeGreaterThan(0)

    // Coins only count once collected: walking through the kill zone must raise the gold.
    const startGold = await gold(page)
    const middle = await canvasCenter(page)
    await expect.poll(async () => {
      await page.mouse.click(middle.x, middle.y)

      return gold(page)
    }, { timeout: 150_000, intervals: [1_500] }).toBeGreaterThan(startGold)

    expect(errors).toEqual([])
  })

  test('reload resumes the saved wave, tower and hero paused before continuing', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.addInitScript((key) => localStorage.setItem(key, 'seen'), TUTORIAL_KEY)
    await page.goto('/tower-defense')
    await page.getByTestId('level-tile-1').click()
    await page.getByTestId('tray-arrow').click()
    const spot = await cellPoint(page, 6, 16)
    await page.mouse.click(spot.x, spot.y)
    await page.getByTestId('tray-arrow').click()
    await expect(page.getByTestId('tower-defense-play')).toHaveAttribute('data-buildings', '1')
    await page.getByRole('button', { name: 'Send next wave' }).click()
    await expect(page.getByTestId('wave')).toHaveText('1/8')
    await expect.poll(async () => Number(await page.getByTestId('tower-defense-play').getAttribute('data-enemies'))).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    const stored = await page.evaluate(() => localStorage.getItem('bwh.tower-defense.run.v1'))
    expect(stored).not.toBeNull()
    const saved = JSON.parse(stored!) as { gold: number; clock: number; buildings: unknown[]; enemies: unknown[] }
    expect(saved.clock).toBeGreaterThan(0)
    expect(saved.buildings).toHaveLength(1)
    expect(saved.enemies.length).toBeGreaterThan(0)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Tower Defense', exact: true })).toBeVisible()
    await page.getByTestId('resume-run').click()
    const paused = page.getByRole('dialog', { name: 'Game paused' })
    await expect(paused).toBeVisible()
    await expect(page.getByTestId('gold')).toHaveText(String(saved.gold))
    await expect(page.getByTestId('wave')).toHaveText('1/8')
    await expect(page.getByTestId('tower-defense-play')).toHaveAttribute('data-buildings', '1')
    await expect(page.getByTestId('tower-defense-play')).toHaveAttribute('data-enemies', String(saved.enemies.length))
    await paused.getByRole('button', { name: 'Resume', exact: true }).click()
    await expect(paused).toBeHidden()
    await page.getByRole('button', { name: 'Level select', exact: true }).click()
    await page.getByTestId('level-tile-1').click()
    const replace = page.getByRole('dialog', { name: 'Replace saved run' })
    await expect(replace).toBeVisible()
    const keep = replace.getByRole('button', { name: 'Keep saved run' })
    const start = replace.getByRole('button', { name: 'Start new run' })
    await expect(keep).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(start).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(keep).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(replace).toBeHidden()
    await expect(page.getByTestId('level-tile-1')).toBeFocused()
    await expect(page.getByTestId('resume-run')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('graphics failure retries the saved run paused and safely returns to level select', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.addInitScript((key) => localStorage.setItem(key, 'seen'), TUTORIAL_KEY)
    await page.goto('/tower-defense')
    await page.getByTestId('level-tile-1').click()
    await page.getByTestId('tray-arrow').click()
    const spot = await cellPoint(page, 6, 16)
    await page.mouse.click(spot.x, spot.y)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    const stored = await page.evaluate(() => localStorage.getItem('bwh.tower-defense.run.v1'))
    expect(stored).not.toBeNull()
    await page.addInitScript(() => {
      const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')?.value as typeof HTMLCanvasElement.prototype.getContext
      if (!original) throw new Error('Missing canvas getContext')
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        if (kind.startsWith('webgl')) return null
        return Reflect.apply(original, this, [kind, ...args])
      } as typeof original
      window.addEventListener('restore-test-graphics', () => { HTMLCanvasElement.prototype.getContext = original }, { once: true })
    })
    await page.reload()
    await page.getByTestId('resume-run').click()
    const dialog = page.getByRole('alertdialog', { name: 'Graphics unavailable' })
    const retry = dialog.getByRole('button', { name: 'Retry graphics' })
    const exit = dialog.getByRole('button', { name: 'Level select' })
    await expect(retry).toBeFocused()
    await expect(page.getByTestId('tower-defense-canvas')).toHaveCount(0)
    await page.keyboard.press('n')
    await page.keyboard.press('ArrowLeft')
    await retry.press('Enter')
    await expect(retry).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(exit).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(retry).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('bwh.tower-defense.run.v1'))).toBe(stored)
    await exit.click()
    await expect(page.getByTestId('resume-run')).toBeFocused()
    expect(await page.evaluate(() => localStorage.getItem('bwh.tower-defense.run.v1'))).toBe(stored)
    await page.getByTestId('resume-run').click()
    await expect(retry).toBeFocused()
    await page.evaluate(() => window.dispatchEvent(new Event('restore-test-graphics')))
    await retry.click()
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('tower-defense-canvas')).toBeVisible()
    const paused = page.getByRole('dialog', { name: 'Game paused' })
    await expect(paused.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
    await expect(page.getByTestId('gold')).toHaveText('70')
    // The loop is live while paused; leaving again must checkpoint the identical simulation.
    await paused.getByRole('button', { name: 'Level select', exact: true }).click()
    expect(await page.evaluate(() => localStorage.getItem('bwh.tower-defense.run.v1'))).toBe(stored)
    expect(errors).toEqual([])
  })

  test('walls dragged across the field seal the route, and enemies smash through them', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'seen'), TUTORIAL_KEY)
    await page.goto('/tower-defense')
    await page.getByTestId('level-tile-1').click()
    await expect(page.getByTestId('tower-defense-canvas')).toBeVisible()
    const play = page.getByTestId('tower-defense-play')
    await expect(page.getByTestId('path-blocked')).toHaveCount(0)

    // One stroke along a clear row of Meadow Pass.
    await page.getByTestId('tray-wall').click()
    const start = await cellPoint(page, 0, 14)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    for (let col = 1; col < COLS; col += 1) {
      const next = await cellPoint(page, col, 14)
      await page.mouse.move(next.x, next.y, { steps: 2 })
    }
    await page.mouse.up()
    await expect(page.getByTestId('gold')).toHaveText(String(100 - (COLS * 4)))
    await page.getByTestId('tray-wall').click()

    await expect(play).toHaveAttribute('data-buildings', String(COLS), { timeout: 90_000 })
    await expect(page.getByTestId('path-blocked')).toBeVisible()

    await page.getByRole('button', { name: 'Double speed' }).click()
    await page.getByRole('button', { name: 'Send next wave' }).click()
    // Enemies break a wall, the warning clears, and with no towers they reach the keep.
    await expect.poll(async () => Number(await play.getAttribute('data-buildings')), { timeout: 120_000 }).toBeLessThan(COLS)
    await expect(page.getByTestId('path-blocked')).toHaveCount(0)
    await expect.poll(async () => Number(await page.getByTestId('lives').textContent()), { timeout: 120_000 }).toBeLessThan(20)
  })

  test('the field fits the viewport, and the hero panel and pause open', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'seen'), TUTORIAL_KEY)
    await page.goto('/tower-defense')
    await page.getByTestId('level-tile-1').click()
    await expect(page.getByTestId('tower-defense-canvas')).toBeVisible()

    const viewport = page.viewportSize()
    const box = await page.getByTestId('tower-defense-canvas').boundingBox()
    expect(viewport && box).toBeTruthy()
    if (viewport && box) {
      expect(box.x).toBeGreaterThanOrEqual(-1)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
    }

    await page.getByTestId('tray-hero').click()
    await expect(page.getByTestId('hero-panel')).toContainText('Swift Boots')
    await page.getByTestId('tray-hero').click()
    await expect(page.getByTestId('hero-panel')).toBeHidden()

    await page.getByRole('button', { name: 'Pause' }).click()
    await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
  })

  test.describe('on an iPad', () => {
    test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true })

    test('turns the board sideways and keeps the tray clear of the screen edge', async ({ page }) => {
      await page.addInitScript((key) => localStorage.setItem(key, 'seen'), TUTORIAL_KEY)
      await page.goto('/tower-defense')
      await page.getByTestId('level-tile-1').click()
      await expect(page.getByTestId('tower-defense-canvas')).toBeVisible()
      for (const card of await page.getByTestId('build-tray').getByRole('button').all()) {
        const box = await card.boundingBox()
        expect(box?.x).toBeGreaterThanOrEqual(16)
        expect(box?.width).toBeGreaterThanOrEqual(88)
      }
      const canvas = await page.getByTestId('tower-defense-canvas').boundingBox()
      expect(canvas?.width).toBeGreaterThan(canvas?.height ?? Infinity)

      const spot = await canvasCenter(page, 0.1, 0.2)
      await page.getByTestId('tray-arrow').tap()
      await page.touchscreen.tap(spot.x, spot.y)
      await expect(page.getByTestId('gold')).toHaveText('70')
    })
  })
})
