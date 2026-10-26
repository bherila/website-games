import { expect, type Page, test } from '@playwright/test'

const BOARD_ROTOR = '[data-testid="chips-board-rotor"]'

/** Waits for the three.js canvas to be mounted and sized by the board rotor. */
async function waitForBoard(page: Page): Promise<void> {
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()
  await expect
    .poll(async () => (await page.locator(BOARD_ROTOR).boundingBox())?.width ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(0)
}

/**
 * The rendered board must sit entirely inside the viewport at every level size,
 * and the page itself must never gain a scrollable overflow.
 *
 * Polled rather than sampled once: mid-flip a rotated board legitimately sweeps a
 * bounding box wider than its container (the visible pixels are clipped by the
 * rotor wrapper's `overflow-hidden`, which `boundingBox()` does not model), so the
 * assertion waits for the 260ms rotation to settle. 1px of slack absorbs
 * sub-pixel layout rounding.
 */
async function expectBoardInsideViewport(page: Page): Promise<void> {
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  if (!viewport) {
    return
  }

  await expect
    .poll(
      async () => {
        const box = await page.locator(BOARD_ROTOR).boundingBox()
        if (!box) {
          return Number.POSITIVE_INFINITY
        }

        return Math.max(-box.x, -box.y, box.x + box.width - viewport.width, box.y + box.height - viewport.height)
      },
      { message: 'the board should settle inside the viewport', timeout: 5_000 },
    )
    .toBeLessThanOrEqual(1)

  const overflow = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight - window.innerHeight,
    width: document.documentElement.scrollWidth - window.innerWidth,
  }))
  expect(overflow.width).toBeLessThanOrEqual(1)
  expect(overflow.height).toBeLessThanOrEqual(1)
}

/**
 * The overlays scroll on the backdrop with `m-auto` on the dialog, so a dialog
 * taller than a very short viewport starts at the scroll origin instead of being
 * centred above it (centring on a scroll container makes the top unreachable).
 *
 * Note current Chromium already treats a scroll container's `center` alignment as
 * `safe center`, so this passes with the centred markup too — it locks in the
 * invariant (and covers the death path end to end) rather than reproducing the
 * anti-pattern, which engines without that fix still get wrong. The structural
 * guard for all three overlays lives in `__tests__/overlays.test.tsx`.
 */
async function expectDialogTopReachable(page: Page, label: string, dialogTestId: string): Promise<void> {
  const overlay = page.getByRole('dialog', { name: label })
  await expect(overlay).toBeVisible()

  const scroll = await overlay.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }))
  // Guard the guard: if the dialog fits, this assertion proves nothing.
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight)
  expect(scroll.scrollTop).toBe(0)

  const overlayBox = await overlay.boundingBox()
  const dialogBox = await page.getByTestId(dialogTestId).boundingBox()
  expect(overlayBox).not.toBeNull()
  expect(dialogBox).not.toBeNull()
  if (!overlayBox || !dialogBox) {
    return
  }

  // At scrollTop 0 the dialog's top edge must be at (or below) the overlay's.
  expect(dialogBox.y).toBeGreaterThanOrEqual(overlayBox.y - 1)
}

test.describe("Chick's Challenge board layout", () => {
  test('loads level 1 from the level select with the board inside the viewport', async ({ page }) => {
    await page.goto('/chicks-challenge')

    await expect(page.getByRole('heading', { name: "Chick's Challenge" })).toBeVisible()
    await page.getByTestId('level-tile-1').click()

    await expect(page.getByLabel('Level 1')).toBeVisible()
    await waitForBoard(page)
    await expectBoardInsideViewport(page)

    // Level 1 is a square 9x9 board, which never rotates in any viewport.
    await expect(page.locator(BOARD_ROTOR)).toHaveAttribute('data-quarter-turns', '0')

    // The HUD and toolbar are siblings of the rotated board, never inside it.
    await expect(page.locator(`${BOARD_ROTOR} [data-testid="chips-toolbar"]`)).toHaveCount(0)
    await expect(page.locator(`${BOARD_ROTOR} [aria-label="Restart level"]`)).toHaveCount(0)
  })

  test('keeps the board still when the first key is picked up', async ({ page }) => {
    // Upright, so arrow keys map straight onto the level-2 route to its key.
    await page.addInitScript(() => localStorage.setItem('bwh.chicks-challenge.board-orientation.v1', JSON.stringify('upright')))
    await page.goto('/chicks-challenge?level=2')
    await waitForBoard(page)
    // The key's slot is reserved before it is collected.
    await expect(page.getByRole('img', { name: 'yellow key: not collected' })).toBeVisible()
    const board = page.getByTestId('chips-board')
    const before = await board.boundingBox()
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowRight']) {
      await page.keyboard.press(key)
      await page.waitForTimeout(300)
    }
    await expect(page.getByRole('img', { name: 'yellow key: 1' })).toBeVisible()
    expect(await board.boundingBox()).toEqual(before)
  })

  test('keeps the largest board inside the viewport', async ({ page }) => {
    // Level 38 is the pack's biggest board (31x31) and drives the follow camera.
    await page.goto('/chicks-challenge?level=38')

    await expect(page.getByLabel('Level 38')).toBeVisible()
    await waitForBoard(page)
    await expectBoardInsideViewport(page)
    await expect(page.locator(BOARD_ROTOR)).toHaveAttribute('data-quarter-turns', '0')
  })

  test('turns a wide board a quarter turn on a portrait phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile-375', 'Rotation depends on the phone-sized viewport')

    // Level 29 is 12x5: upright it is ~31 px/tile on a 375px-wide phone, ~48 turned.
    await page.goto('/chicks-challenge?level=29')

    await expect(page.getByLabel('Level 29')).toBeVisible()
    await waitForBoard(page)
    await expect(page.locator(BOARD_ROTOR)).toHaveAttribute('data-quarter-turns', '1')
    await expectBoardInsideViewport(page)

    // The rotation toggle can force the board back upright, and the choice sticks.
    await page.getByTestId('orientation-toggle').click()
    await expect(page.getByTestId('orientation-toggle')).toHaveAttribute('data-orientation-preference', 'rotated')
    await page.getByTestId('orientation-toggle').click()
    await expect(page.locator(BOARD_ROTOR)).toHaveAttribute('data-quarter-turns', '0')
    await expect(page.getByTestId('orientation-toggle')).toHaveAttribute('data-orientation-preference', 'upright')
    await expectBoardInsideViewport(page)

    await page.reload()
    await waitForBoard(page)
    await expect(page.getByTestId('orientation-toggle')).toHaveAttribute('data-orientation-preference', 'upright')
    await expect(page.locator(BOARD_ROTOR)).toHaveAttribute('data-quarter-turns', '0')
    await expectBoardInsideViewport(page)
  })

  test('shows the touch D-pad and accepts a step on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile-375', 'The D-pad only renders on touch devices')

    await page.goto('/chicks-challenge?level=1')
    await waitForBoard(page)

    await expect(page.getByLabel('0 of 16 moves')).toBeVisible()
    const dpad = page.getByTestId('touch-dpad')
    await expect(dpad).toBeVisible()

    // Every pad button clears the 44px minimum touch target.
    for (const intent of ['up', 'down', 'left', 'right', 'wait'] as const) {
      const box = await page.getByTestId(`touch-dpad-${intent}`).boundingBox()
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    }

    // Level 1's hint tile sits directly below the start, so a down step is accepted.
    await page.getByTestId('touch-dpad-down').tap()
    await expect(page.getByLabel('1 of 16 moves')).toBeVisible()
    await expect(page.getByTestId('hint-banner')).toBeVisible()

    // Undo sits by the thumb, clears the 44px minimum, and takes the step back.
    const undo = page.getByTestId('undo-button')
    const undoBox = await undo.boundingBox()
    expect(undoBox?.width ?? 0).toBeGreaterThanOrEqual(44)
    await undo.tap()
    await expect(page.getByLabel('0 of 16 moves')).toBeVisible()
    await expect(undo).toBeDisabled()
  })

  test('turns one natural swipe or D-pad press into exactly one step on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile-375', 'Touch input needs the phone-sized touch project')

    // Level 16's start has open floor to its right, so every right step is accepted.
    await page.addInitScript(() => localStorage.setItem('bwh.chicks-challenge.board-orientation.v1', JSON.stringify('upright')))
    await page.goto('/chicks-challenge?level=16')
    await waitForBoard(page)
    await expect(page.getByLabel('0 of 15 moves')).toBeVisible()

    // A 100px swipe over 250ms crosses the 24px threshold early and keeps moving
    // for ~190ms. Repeats used to start 150ms after the threshold, so this one
    // gesture stepped twice. Synthetic touches give exact timing.
    await page.getByTestId('chips-board').evaluate(async (board) => {
      const rect = board.getBoundingClientRect()
      const x0 = rect.left + rect.width / 2
      const y0 = rect.top + rect.height * 0.8
      const touchAt = (x: number): Touch => new Touch({ identifier: 7, target: board, clientX: x, clientY: y0 })
      const fire = (type: string, touch: Touch, active: Touch[]): void => {
        board.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: active, targetTouches: active, changedTouches: [touch] }))
      }
      let touch = touchAt(x0)
      fire('touchstart', touch, [touch])
      const start = performance.now()
      while (performance.now() - start < 250) {
        await new Promise((resolve) => setTimeout(resolve, 16))
        touch = touchAt(x0 + 100 * Math.min(1, (performance.now() - start) / 250))
        fire('touchmove', touch, [touch])
      }
      fire('touchend', touch, [])
    })
    await page.waitForTimeout(600)
    await expect(page.getByLabel('1 of 15 moves')).toBeVisible()

    // A deliberate ~250ms thumb press on the D-pad is also one step.
    const cdp = await page.context().newCDPSession(page)
    const pad = await page.getByTestId('touch-dpad-right').boundingBox()
    expect(pad).not.toBeNull()
    const point = { x: (pad?.x ?? 0) + (pad?.width ?? 0) / 2, y: (pad?.y ?? 0) + (pad?.height ?? 0) / 2, id: 1 }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
    await page.waitForTimeout(250)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(600)
    await expect(page.getByLabel('2 of 15 moves')).toBeVisible()
  })

  test('keeps an overlay dialog reachable on a viewport shorter than the dialog', async ({ page }) => {
    // Level 11 is a square 11x11 board (it never rotates) whose start sits three
    // steps above a water band: one sidestep, then three downs, drowns the chick.
    await page.goto('/chicks-challenge?level=11')
    await waitForBoard(page)
    await expect(page.getByLabel('0 of 20 moves')).toBeVisible()

    // One key at a time: the intent queue applies one move per animation step.
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByLabel('1 of 20 moves')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByLabel('2 of 20 moves')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByLabel('3 of 20 moves')).toBeVisible()
    await page.keyboard.press('ArrowDown')

    await expect(page.getByRole('dialog', { name: 'You died' })).toBeVisible()

    // Shrink to well under the dialog's own height (~160px) after it is showing,
    // so the game itself never has to load at an absurd size.
    await page.setViewportSize({ width: 375, height: 130 })
    await expectDialogTopReachable(page, 'You died', 'death-dialog')
  })
})
