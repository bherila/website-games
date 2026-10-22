import { expect, type Locator, type Page, test } from '@playwright/test'

test.describe('Plate Escape real puzzle', () => {
  test.use({ deviceScaleFactor: 1 })

  test('rotates, reveals screws, undoes, sorts every color and remembers a clear', async ({ page, isMobile }, testInfo) => {
    test.setTimeout(180_000)
    if (!isMobile) await page.setViewportSize({ width: 1000, height: 850 })
    const errors: string[] = []
    const cloudWrites: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('request', (request) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && request.url().includes('/api/games/')) cloudWrites.push(request.url())
    })
    const activate = async (locator: Locator): Promise<void> => {
      if (isMobile) await locator.tap()
      else await locator.click()
    }
    await page.goto('/plate-escape')
    await expect(page.getByRole('heading', { name: 'Plate Escape.' })).toBeVisible()
    await expect(page.locator('[data-screw-id="front-1"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('screw-progress')).toHaveText('0 / 9 screws')
    await expect(page.locator('[data-screw-id^="back-"]')).toHaveCount(0)
    await expect(page.locator('[data-screw-id="right-roof-1"]')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('little-cottage.png') })
    for (let turn = 0; turn < 4; turn++) await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
    await expect(page.locator('[data-screw-id="back-1"]')).toBeVisible()
    await expect(page.locator('[data-screw-id="front-1"]')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('cottage-back.png') })
    await activate(page.getByRole('button', { name: 'Reset view', exact: true }))
    await expect(page.locator('[data-screw-id="front-1"]')).toBeVisible()

    // A drag that begins on a screw must not become an accidental unscrew.
    const target = page.locator('[data-screw-id="front-1"]')
    const bounds = await target.boundingBox()
    expect(bounds).not.toBeNull()
    await drag(page, isMobile, bounds!.x + 22, bounds!.y + 22, bounds!.x + 60, bounds!.y + 40)
    await expect(page.getByTestId('screw-progress')).toHaveText('0 / 9 screws')

    // Real drag over empty canvas turns the view; native touch never uses mouse emulation.
    const scene = await page.getByTestId('plate-escape-scene').boundingBox()
    expect(scene).not.toBeNull()
    await drag(page, isMobile, scene!.x + scene!.width * 0.15, scene!.y + scene!.height * 0.3, scene!.x + scene!.width * 0.8, scene!.y + scene!.height * 0.35)
    await expect(page.getByTestId('screw-progress')).toHaveText('0 / 9 screws')
    await activate(page.getByRole('button', { name: 'Reset view', exact: true }))
    await activate(page.locator('[data-screw-id="right-roof-1"]'))
    await expect(page.getByLabel('Spare storage: 1 of 4', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Undo', exact: false })).toBeEnabled()
    await activate(page.getByRole('button', { name: 'Undo', exact: false }))
    await expect(page.getByTestId('screw-progress')).toHaveText('0 / 9 screws')
    await expect(page.getByLabel('Spare storage: 0 of 4', { exact: true })).toBeVisible()

    let removed = 0
    // Only tap visible, raycast-confirmed screw heads. Turn the assembly when
    // the remaining heads face away; no renderer hooks or board/storage injection.
    for (let attempt = 0; attempt < 45 && removed < 9; attempt++) {
      const visible = page.locator('[data-screw-id]:enabled')
      if (await visible.count() === 0) {
        await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
        await page.waitForTimeout(250)
        continue
      }
      await activate(visible.first())
      removed++
      await expect(page.getByTestId('screw-progress')).toHaveText(`${removed} / 9 screws`)
      if (removed < 9) await expect(page.getByRole('button', { name: 'Undo', exact: false })).toBeEnabled()
    }
    expect(removed).toBe(9)
    await expect(page.getByRole('heading', { name: 'All plates free!' })).toBeVisible()
    await expect(page.getByRole('img', { name: '3 of 3 stars', exact: true })).toBeVisible()
    await expect(page.getByTestId('plate-progress')).toHaveText('6 / 6 plates released')
    await expect(page.getByText('3 / 3 collected', { exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('all-plates-free.png') })
    await activate(page.getByRole('button', { name: 'Play again', exact: true }))
    await expect(page.getByTestId('screw-progress')).toHaveText('0 / 9 screws')
    await expect(page.getByText('Cleared', { exact: true })).toBeVisible()
    await activate(page.locator('[data-screw-id="front-1"]'))
    await expect(page.getByTestId('screw-progress')).toHaveText('1 / 9 screws')
    await activate(page.getByRole('button', { name: 'Restart', exact: true }))
    await expect(page.getByTestId('screw-progress')).toHaveText('0 / 9 screws')
    await expect(page.locator('[data-screw-id="front-1"]')).toBeVisible()
    await page.reload()
    await expect(page.getByText('Cleared', { exact: true })).toBeVisible()
    await expect(page.getByTestId('screw-progress')).toHaveText('0 / 9 screws')
    await activate(page.getByRole('link', { name: 'All games', exact: false }))
    await expect(page.getByTestId('game-card-plate-escape')).toBeVisible()
    expect(cloudWrites).toEqual([])
    expect(errors).toEqual([])
  })
})

async function drag(page: Page, mobile: boolean, x: number, y: number, endX: number, endY: number): Promise<void> {
  if (mobile) {
    const touch = await page.context().newCDPSession(page)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let step = 1; step <= 8; step++) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (endX - x) * step / 8, y: y + (endY - y) * step / 8 }] })
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await touch.detach()
  } else {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(endX, endY, { steps: 8 })
    await page.mouse.up()
  }
}
