import { expect, type Page, test } from '@playwright/test'

declare global {
  interface Window {
    /** Read-only test hook installed by the Tower 2 scene. */
    __tower2?: {
      tileToClient(floor: number, x: number, y: number): { x: number, y: number }
      drawCalls(): number
      visitors(): number
      frames(): number
    }
  }
}

/** Screen point of a tile's centre on a floor, from the scene's read-only test hook. */
async function tile(page: Page, floor: number, x: number, y: number): Promise<{ x: number, y: number }> {
  return page.evaluate(([f, tx, ty]) => window.__tower2!.tileToClient(f!, tx!, ty!), [floor, x, y])
}

async function drag(page: Page, floor: number, from: [number, number], to: [number, number]): Promise<void> {
  const a = await tile(page, floor, ...from)
  const b = await tile(page, floor, ...to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 })
  await page.mouse.move(b.x, b.y, { steps: 4 })
  await page.mouse.up()
}

async function click(page: Page, floor: number, x: number, y: number): Promise<void> {
  const point = await tile(page, floor, x, y)
  await page.mouse.click(point.x, point.y)
}

async function open(page: Page): Promise<void> {
  await page.goto('/tower-2')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect.poll(() => page.evaluate(() => window.__tower2 !== undefined)).toBe(true)
}

/** Click a toolbar control by its accessible name; some sit in a scrolling bar on phones. */
async function press(page: Page, name: string | RegExp): Promise<void> {
  const button = page.getByRole('button', { name }).first()
  await button.scrollIntoViewIfNeeded()
  await button.click()
}

test.describe('Tower 2 prototype', () => {
  test('starts on a lived-in starter block with visitors moving', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await open(page)
    await expect(page.getByTestId('tower2-room-count')).toHaveText('4')
    await expect.poll(() => page.evaluate(() => window.__tower2!.visitors()), { timeout: 10_000 }).toBeGreaterThan(0)
    // One floor and its glass per visible floor, the lot, grid and visitors: a handful of draw calls.
    await expect.poll(() => page.evaluate(() => window.__tower2!.drawCalls())).toBeLessThan(20)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })

  test('idles at about 30 frames a second instead of every display frame', async ({ page }) => {
    await open(page)
    await expect.poll(() => page.evaluate(() => window.__tower2!.visitors()), { timeout: 10_000 }).toBeGreaterThan(0)
    // Leave the pointer off the canvas so nothing counts as input, then sample two idle seconds,
    // counting the browser's own animation frames over the same window.
    await page.mouse.move(0, 0)
    await page.waitForTimeout(600)
    const { rendered, offered } = await page.evaluate(async () => {
      const before = window.__tower2!.frames()
      const start = performance.now()
      let offered = 0
      await new Promise<void>((done) => {
        const tick = () => {
          offered++
          if (performance.now() - start < 2000) requestAnimationFrame(tick)
          else done()
        }
        requestAnimationFrame(tick)
      })
      return { rendered: window.__tower2!.frames() - before, offered }
    })
    expect(rendered).toBeGreaterThan(20)
    // Pacing is only observable when the browser offers frames faster than 30 a second.
    if (offered >= 80) expect(rendered).toBeLessThan(offered * 0.7)
    else expect(rendered).toBeLessThanOrEqual(offered + 2)
  })

  test('copies a floor, draws a corridor, stretches the core, places a room, and keeps it across undo and reload', async ({ page }) => {
    await open(page)
    const top = 28
    await press(page, /^Floor 2/)
    await press(page, /Copy the floor below/)
    await expect(page.getByTestId('tower2-floor-area')).toHaveText('1,728 m²')

    await press(page, /^Corridor/)
    await drag(page, 2, [13, top + 5], [26, top + 5])

    // The starter core stops at floor 1; stretch it to floor 2 from its inspect panel.
    await press(page, /^Floor 1/)
    await press(page, /^Select/)
    await click(page, 1, 19, top + 3)
    await expect(page.getByRole('region', { name: 'Selection' })).toContainText('Core')
    await press(page, 'Raise the top')
    await expect(page.getByRole('region', { name: 'Selection' })).toContainText('2')

    await press(page, /^Floor 2/)
    await press(page, /^Startup office/)
    await click(page, 2, 23, top + 2)
    await expect(page.getByTestId('tower2-room-count')).toHaveText('5')
    await expect(page.getByText(/no route from the street/)).toHaveCount(0)

    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('tower2-room-count')).toHaveText('4')
    await page.keyboard.press('Control+Shift+z')
    await expect(page.getByTestId('tower2-room-count')).toHaveText('5')

    // Autosave runs shortly after the last edit.
    await page.waitForTimeout(800)
    await page.reload()
    await expect(page.getByTestId('tower2-room-count')).toHaveText('5')
  })

  test('refuses a room with no corridor beside it and says why', async ({ page }) => {
    await open(page)
    await press(page, /^Shop/)
    await click(page, 0, 14, 29)
    await expect(page.getByText('A room needs a corridor or core along one side').first()).toBeVisible()
    await expect(page.getByTestId('tower2-room-count')).toHaveText('4')
  })
})
