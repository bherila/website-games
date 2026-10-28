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

/** A first visit: an empty site with the tutorial, or the example block loaded from its card. */
async function open(page: Page, start: 'example' | 'tutorial' = 'example'): Promise<void> {
  await page.goto('/tower-2')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect.poll(() => page.evaluate(() => window.__tower2 !== undefined)).toBe(true)
  if (start === 'example') await press(page, 'Load the example block')
}

/** Click a toolbar control by its accessible name; some sit in a scrolling bar on phones. */
async function press(page: Page, name: string | RegExp): Promise<void> {
  const button = page.getByRole('button', { name }).first()
  await button.scrollIntoViewIfNeeded()
  await button.click()
}

test.describe('Tower 2 prototype', () => {
  test('loads the example block with visitors moving', async ({ page }) => {
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
    await expect(page.getByText(/door wall \(south\) needs a corridor, a core or the outside/).first()).toBeVisible()
    await expect(page.getByTestId('tower2-room-count')).toHaveText('4')
  })

  test('opens a shop straight onto the street, then drags the café to a new spot', async ({ page }) => {
    await open(page)
    await press(page, /^Shop/)
    // On the street edge of the starter block, facing south, the door opens onto the street.
    const edge = await tile(page, 0, 15, 38)
    await page.mouse.move(edge.x, edge.y)
    await expect(page.getByTestId('tower2-hint')).toHaveText('Storefront: its door opens onto the street')
    await page.mouse.click(edge.x, edge.y)
    await expect(page.getByTestId('tower2-room-count')).toHaveText('5')
    await press(page, /^Select/)
    await click(page, 0, 15, 38)
    await expect(page.getByRole('region', { name: 'Selection' })).toContainText('storefront onto the street')

    // The starter café spans rows 34–37; drag it one row toward the street.
    await click(page, 0, 18, 38)
    await expect(page.getByRole('region', { name: 'Selection' })).toHaveCount(0)
    await drag(page, 0, [18, 35], [18, 36])
    await expect(page.getByRole('region', { name: 'Selection' })).toContainText('Café')
    await click(page, 0, 0, 0)
    await click(page, 0, 18, 38)
    await expect(page.getByRole('region', { name: 'Selection' })).toContainText('Café')
    await expect(page.getByTestId('tower2-room-count')).toHaveText('5')
  })

  test('a first visit starts on an empty site and the tutorial walks through the first rooms', async ({ page }) => {
    await open(page, 'tutorial')
    const card = page.getByRole('region', { name: 'Tutorial' })
    await expect(card).toContainText('Step 1 of 9')
    await expect(page.getByTestId('tower2-room-count')).toHaveText('0')
    const top = 28
    // Each step picks its own tool, so the player only drags and taps.
    await drag(page, 0, [12, top], [27, 39])
    await expect(card).toContainText('Run a corridor in from the street')
    // A reload after the first autosave resumes the tutorial where it was.
    await page.waitForTimeout(800)
    await page.reload()
    await expect(page.getByRole('region', { name: 'Tutorial' })).toContainText('Run a corridor in from the street')
    await drag(page, 0, [20, top + 2], [20, 39])
    await expect(card).toContainText('Place a core beside the corridor')
    await click(page, 0, 21, top + 4)
    await expect(card).toContainText('Open a shop onto the street')
    await click(page, 0, 14, 38)
    await expect(card).toContainText('Add a café off the corridor')
    await expect(card).toContainText('Step 5 of 9')
    // Undo steps the tutorial back with the building.
    await page.keyboard.press('Control+z')
    await expect(card).toContainText('Open a shop onto the street')
    await press(page, 'Skip')
    await expect(card).toHaveCount(0)
    await page.waitForTimeout(800)
    await page.reload()
    await expect(page.getByTestId('tower2-room-count')).toHaveText('0')
    await expect(page.getByRole('region', { name: 'Tutorial' })).toHaveCount(0)
  })

  test('adds a floor on top and a basement below from the floor stepper', async ({ page }) => {
    await open(page)
    // The example block has floors G and 1; the stepper offers an empty 2 above and B1 below.
    await expect(page.getByRole('button', { name: /^Floor 2, empty/ })).toBeVisible()
    await press(page, /^Floor 2, empty/)
    await press(page, /Copy the floor below/)
    await expect(page.getByTestId('tower2-floor-area')).toHaveText('1,728 m²')
    await expect(page.getByRole('button', { name: /^Floor 3, empty/ })).toBeVisible()
    await press(page, /^Basement B1, empty/)
    await press(page, /^Floor \(2\)/)
    await drag(page, -1, [12, 28], [27, 39])
    await expect(page.getByTestId('tower2-floor-area')).toHaveText('1,728 m²')
    await expect(page.getByRole('button', { name: /^Basement B2, empty/ })).toBeVisible()
  })

  test('turns the example core into a two-car bank whose cars carry visitors upstairs', async ({ page }) => {
    await open(page)
    await press(page, /^Select/)
    await click(page, 0, 19, 31)
    const panel = page.getByRole('region', { name: 'Selection' })
    await expect(panel).toContainText('Core')
    await press(page, 'Add a car')
    await expect(page.getByTestId('tower2-core-cars')).toHaveText('2')
    await expect(panel).toContainText('Elevator bank of 2')
    // Someone rides up to the office or studio and the bank reports a wait.
    await expect(page.getByTestId('tower2-core-wait')).toHaveText(/^\d+ s$/, { timeout: 20_000 })
  })

  test('signed out, the tower saves in this browser, and Reset erases it back to a first visit', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('tower2-save-place')).toHaveAttribute('href', '/login?next=/tower-2')
    await expect(page.getByTestId('tower2-room-count')).toHaveText('4')
    await page.waitForTimeout(800)
    await page.reload()
    await expect(page.getByTestId('tower2-room-count')).toHaveText('4')
    await press(page, 'Reset')
    await press(page, 'Erase and restart')
    await expect(page.getByRole('region', { name: 'Tutorial' })).toContainText('Step 1 of 9')
    await expect(page.getByTestId('tower2-room-count')).toHaveText('0')
  })
})
