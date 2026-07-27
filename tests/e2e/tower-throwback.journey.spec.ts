import { expect, type Locator, type Page, test } from '@playwright/test'

import { encodeChallengeCode } from '../../resources/js/games/tower-throwback/challengeCode'

interface TowerTile {
  floor: number
  x: number
}

test.describe('Tower Throwback real player journey', () => {
  test('starts, builds, saves locally, reloads, and resumes the same tower', async ({ page }, testInfo) => {
    test.setTimeout(360_000)
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The full construction journey is pinned on desktop.')

    const cloudWrites: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PUT' && request.url().includes('/api/games/data')) {
        cloudWrites.push(request.url())
      }
    })

    await page.goto('/tower-throwback')
    await page.evaluate(async () => {
      window.localStorage.clear()
      window.sessionStorage.clear()
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    })
    await page.reload()

    const challengeCode = encodeChallengeCode({ seed: 20_260_727, lobbyHeight: 1, mapId: 'city-tower' })
    await page.getByTestId('map-city-tower').click()
    await page.getByTestId('lobby-1').click()
    await page.getByTestId('challenge-code').fill(challengeCode)
    await expect(page.getByTestId('challenge-code-status')).toContainText('New York')
    await page.getByTestId('start').click()

    await expect(page.locator('[data-map-id="city-tower"]')).toBeVisible()
    await page.getByTestId('speed-0').click()
    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible()
    await page.getByRole('button', { name: 'Build' }).click()

    await page.getByTestId('family-lobbies').click()
    await page.getByTestId('tool-lobby').click()
    await dragPlacement(page, canvas, { floor: 0, x: 200 }, { floor: 0, x: 220 })
    await expect(page.getByTestId('funds')).toHaveText('$1,993,700')

    await page.getByTestId('tool-slab').click()
    await dragPlacement(page, canvas, { floor: 1, x: 205 }, { floor: 1, x: 219 })
    await expect(page.getByTestId('funds')).toHaveText('$1,992,950')

    await page.getByTestId('family-elevators').click()
    await page.getByTestId('tool-standard').click()
    await dragPlacement(page, canvas, { floor: 0, x: 218 }, { floor: 1, x: 218 })
    await expect(page.getByTestId('funds')).toHaveText('$1,937,950')

    await page.getByTestId('family-offices').click()
    await page.getByTestId('tool-officeS').click()
    await clickPlacement(page, canvas, { floor: 1, x: 211 })
    await expect(page.getByTestId('funds')).toHaveText('$1,917,950')

    await assertBuiltStructure(page)
    await page.getByRole('button', { name: 'Close tower inventory' }).click()
    await page.getByRole('button', { name: 'Done' }).click()

    await page.getByRole('button', { name: 'Saves' }).click()
    await page.getByTestId('save-slot-a').click()
    await expect(page.getByTestId('save-message')).toContainText('Saved to Slot A.')
    await expect(page.getByTestId('slot-summary-slot-a')).not.toHaveText('Empty')
    await page.getByRole('button', { name: 'Close save overlay' }).click()

    await page.reload()
    await expect(page.getByTestId('title-slot-summary-slot-a')).not.toHaveText('Empty')
    await page.getByTestId('resume-slot-a').click()

    await expect(page.locator('[data-map-id="city-tower"]')).toBeVisible()
    await expect(page.getByTestId('funds')).toHaveText('$1,917,950')
    await assertBuiltStructure(page)
    expect(cloudWrites).toEqual([])
  })
})

async function assertBuiltStructure(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Inventory' }).click()
  const floorOne = page.getByRole('list', { name: 'Items on 1' })
  await expect(floorOne.getByText('Floor', { exact: true })).toBeVisible()
  await expect(floorOne.getByText('Office (S)', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /0 2 items/ }).click()
  const groundFloor = page.getByRole('list', { name: 'Items on 0' })
  await expect(groundFloor.getByText('Lobby', { exact: true })).toBeVisible()
  await expect(groundFloor.getByText('Elevator', { exact: true })).toBeVisible()
}

async function readTarget(canvas: Locator): Promise<TowerTile> {
  const target = await canvas.evaluate((element) => ({
    floor: element.getAttribute('data-tower-target-floor'),
    x: element.getAttribute('data-tower-target-x'),
  }))
  if (target.floor === null || target.x === null) {
    throw new Error('Tower canvas did not resolve the current pointer to a placement target')
  }
  return {
    floor: Number(target.floor),
    x: Number(target.x),
  }
}

async function moveToTile(page: Page, canvas: Locator, target: TowerTile): Promise<void> {
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('Tower canvas has no layout box')
  }

  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(center.x, center.y)
  const centerTile = await readTarget(canvas)

  await page.mouse.move(center.x + 120, center.y)
  const horizontalProbe = await readTarget(canvas)
  const horizontalDelta = horizontalProbe.x - centerTile.x
  if (horizontalDelta === 0) {
    throw new Error('Tower canvas horizontal placement locator did not move')
  }
  const pixelsPerTileX = 120 / horizontalDelta

  await page.mouse.move(center.x, center.y + 120)
  const verticalProbe = await readTarget(canvas)
  const verticalDelta = verticalProbe.floor - centerTile.floor
  if (verticalDelta === 0) {
    throw new Error('Tower canvas vertical placement locator did not move')
  }
  const pixelsPerFloor = 120 / verticalDelta

  let point = {
    x: center.x + (target.x - centerTile.x) * pixelsPerTileX,
    y: center.y + (target.floor - centerTile.floor) * pixelsPerFloor,
  }
  const attempts: Array<{ point: typeof point, actual: TowerTile }> = []
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.mouse.move(point.x, point.y)
    const actual = await readTarget(canvas)
    attempts.push({ point, actual })
    if (actual.x === target.x && actual.floor === target.floor) {
      return
    }
    point = {
      x: point.x + (target.x - actual.x) * pixelsPerTileX / 2,
      y: point.y + (target.floor - actual.floor) * pixelsPerFloor / 2,
    }
  }

  const actual = await readTarget(canvas)
  throw new Error(
    `Could not locate Tower tile ${target.floor}:${target.x}; reached ${actual.floor}:${actual.x}; `
    + `calibration=${JSON.stringify({ centerTile, horizontalProbe, verticalProbe, pixelsPerTileX, pixelsPerFloor, attempts })}`,
  )
}

async function dragPlacement(page: Page, canvas: Locator, start: TowerTile, end: TowerTile): Promise<void> {
  await moveToTile(page, canvas, start)
  await page.mouse.down()
  await moveToTile(page, canvas, end)
  await page.mouse.up()
}

async function clickPlacement(page: Page, canvas: Locator, target: TowerTile): Promise<void> {
  await moveToTile(page, canvas, target)
  await page.mouse.down()
  await page.mouse.up()
}
