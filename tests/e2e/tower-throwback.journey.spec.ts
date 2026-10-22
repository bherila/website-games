import { type CDPSession, expect, type Locator, type Page, test } from '@playwright/test'

import { encodeChallengeCode } from '../../resources/js/games/tower-throwback/challengeCode'

interface TowerTile {
  floor: number
  x: number
}

test.describe('Tower Throwback real player journey', () => {
  // Functional input coverage uses the phone's CSS layout without high-DPI render cost.
  test.use({ deviceScaleFactor: 1 })

  test('starts, builds, saves locally, reloads, and resumes the same tower', async ({ page }, testInfo) => {
    test.setTimeout(360_000)
    const mobile = testInfo.project.name === 'chromium-mobile-375'
    if (!mobile) {
      await page.setViewportSize({ width: 1280, height: 720 })
    }
    const touch = mobile ? await page.context().newCDPSession(page) : null
    const activate = async (locator: Locator): Promise<void> => {
      if (mobile) {
        await locator.tap({ timeout: 30_000 })
      } else {
        await locator.click()
      }
    }

    const cloudWrites: string[] = []
    page.on('request', (request) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && request.url().includes('/api/games/')) {
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
    await activate(page.getByTestId('map-city-tower'))
    await activate(page.getByTestId('lobby-1'))
    await page.getByTestId('challenge-code').fill(challengeCode)
    await expect(page.getByTestId('challenge-code-status')).toContainText('New York')
    await activate(page.getByTestId('start'))

    await expect(page.locator('[data-map-id="city-tower"]')).toBeVisible()
    await activate(page.getByTestId('speed-0'))
    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible()
    await activate(page.getByRole('button', { name: 'Dismiss getting started' }))
    if (mobile) {
      await activate(page.getByTestId('zoom-out'))
    }
    await activate(page.getByRole('button', { name: 'Build' }))

    await activate(page.getByTestId('family-lobbies'))
    await activate(page.getByTestId('tool-lobby'))
    if (touch) {
      // Keep gestures inside the phone's exposed playfield beside its build palette.
      await touchPlacement(touch, canvas, { floor: 0, x: 194 }, { floor: 0, x: 201 })
      await expect(page.getByTestId('funds')).toHaveText('$1,997,600')
      await activate(page.getByRole('button', { name: 'Done' }))
      await activate(page.getByTestId('zoom-in'))
      await activate(page.getByTestId('zoom-in'))
      await touchPanLeft(touch)
      await activate(page.getByRole('button', { name: 'Build' }))
      await activate(page.getByTestId('tool-slab'))
      await touchPlacement(touch, canvas, { floor: 1, x: 196 }, { floor: 1, x: 201 })
      await expect(page.getByTestId('funds')).toHaveText('$1,997,300')
      await activate(page.getByTestId('family-offices'))
      await activate(page.getByTestId('tool-officeS'))
      await touchPlacement(touch, canvas, { floor: 1, x: 196 }, { floor: 1, x: 196 })
      await expect(page.getByTestId('funds')).toHaveText('$1,977,300')
      await activate(page.getByRole('button', { name: 'Done' }))
      await activate(page.getByTestId('zoom-in'))
      await touchPanLeft(touch)
      await activate(page.getByRole('button', { name: 'Build' }))
      await activate(page.getByTestId('family-elevators'))
      await activate(page.getByTestId('tool-standard'))
      await touchPlacement(touch, canvas, { floor: 0, x: 194 }, { floor: 1, x: 194 })
      await expect(page.getByTestId('funds')).toHaveText('$1,922,300')
    } else {
      await dragPlacement(page, canvas, { floor: 0, x: 200 }, { floor: 0, x: 220 })
      await expect(page.getByTestId('funds')).toHaveText('$1,993,700')
      await activate(page.getByTestId('tool-slab'))
      await dragPlacement(page, canvas, { floor: 1, x: 205 }, { floor: 1, x: 219 })
      await expect(page.getByTestId('funds')).toHaveText('$1,992,950')
      await activate(page.getByTestId('family-elevators'))
      await activate(page.getByTestId('tool-standard'))
      await dragPlacement(page, canvas, { floor: 0, x: 218 }, { floor: 1, x: 218 })
      await expect(page.getByTestId('funds')).toHaveText('$1,937,950')
      await activate(page.getByTestId('family-offices'))
      await activate(page.getByTestId('tool-officeS'))
      await clickPlacement(page, canvas, { floor: 1, x: 211 })
      await expect(page.getByTestId('funds')).toHaveText('$1,917,950')
    }

    if (mobile) {
      await activate(page.getByRole('button', { name: 'Done' }))
    }
    await assertBuiltStructure(page, activate)
    await activate(page.getByRole('button', { name: 'Close tower inventory' }))
    if (!mobile) {
      await activate(page.getByRole('button', { name: 'Done' }))
    }

    await activate(page.getByRole('button', { name: 'Saves' }))
    await activate(page.getByTestId('save-slot-a'))
    await expect(page.getByTestId('save-message')).toContainText('Saved to Slot A.')
    await expect(page.getByTestId('slot-summary-slot-a')).not.toHaveText('Empty')
    await activate(page.getByRole('button', { name: 'Close save overlay' }))

    await page.reload()
    await expect(page.getByTestId('title-slot-summary-slot-a')).not.toHaveText('Empty')
    await activate(page.getByTestId('resume-slot-a'))

    await expect(page.locator('[data-map-id="city-tower"]')).toBeVisible()
    await expect(page.getByTestId('funds')).toHaveText(mobile ? '$1,922,300' : '$1,917,950')
    await assertBuiltStructure(page, activate)
    expect(cloudWrites).toEqual([])
  })
})

async function assertBuiltStructure(page: Page, activate: (locator: Locator) => Promise<void>): Promise<void> {
  await activate(page.getByRole('button', { name: 'Inventory' }))
  const floorOne = page.getByRole('list', { name: 'Items on 1' })
  await expect(floorOne.getByText('Floor', { exact: true })).toBeVisible()
  await expect(floorOne.getByText('Office (S)', { exact: true })).toBeVisible()

  await activate(page.getByRole('button', { name: /0 2 items/ }))
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

interface ScreenPoint {
  x: number
  y: number
}

async function touchAt(touch: CDPSession, point: ScreenPoint, type: 'touchStart' | 'touchMove'): Promise<void> {
  await touch.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: [{ id: 1, ...point, radiusX: 1, radiusY: 1 }],
  })
}

async function touchPanLeft(touch: CDPSession): Promise<void> {
  await touchAt(touch, { x: 245, y: 450 }, 'touchStart')
  await touchAt(touch, { x: 365, y: 450 }, 'touchMove')
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

async function touchTilePoint(touch: CDPSession, canvas: Locator, target: TowerTile): Promise<ScreenPoint> {
  // Native cancelled contacts observe the public placement target without building anything.
  const visible = async (point: ScreenPoint): Promise<boolean> => canvas.evaluate(
    (element, position) => document.elementFromPoint(position.x, position.y) === element,
    point,
  )
  const probe = async (point: ScreenPoint): Promise<TowerTile> => {
    expect(await visible(point), `Native contact reaches visible canvas at ${point.x}:${point.y}`).toBe(true)
    await touchAt(touch, point, 'touchStart')
    const tile = await readTarget(canvas)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    return tile
  }
  const origin = { x: 270, y: 450 }
  const originTile = await probe(origin)
  const horizontal = await probe({ x: origin.x + 40, y: origin.y })
  const vertical = await probe({ x: origin.x, y: origin.y + 120 })
  const pixelsPerTile = 40 / (horizontal.x - originTile.x)
  const pixelsPerFloor = 120 / (vertical.floor - originTile.floor)
  let point = {
    x: origin.x + (target.x - originTile.x) * pixelsPerTile,
    y: origin.y + (target.floor - originTile.floor) * pixelsPerFloor,
  }
  const attempts: Array<{ point: ScreenPoint, actual: TowerTile }> = []
  for (let attempt = 0; attempt < 8; attempt += 1) {
    expect(point.x, 'Construction stays beside the phone build palette').toBeGreaterThan(233)
    expect(point.x, 'Construction stays inside the phone viewport').toBeLessThan(374)
    // Quantized calibration can land on a HUD edge; try nearby canvas before contacting it.
    if (!await visible(point)) {
      let unobstructed = false
      for (const [dx, dy] of [[0, 10], [0, -10], [0, 20], [0, -20], [-10, 0], [10, 0], [-20, 0], [20, 0]] as const) {
        const candidate = { x: point.x + dx, y: point.y + dy }
        if (candidate.x > 233 && candidate.x < 374 && await visible(candidate)) {
          point = candidate
          unobstructed = true
          break
        }
      }
      expect(unobstructed, 'Placement target has exposed canvas beside the HUD').toBe(true)
    }
    const actual = await probe(point)
    attempts.push({ point, actual })
    if (actual.x === target.x && actual.floor === target.floor) {
      return point
    }
    point = {
      x: point.x + (target.x - actual.x) * pixelsPerTile / 2,
      y: point.y + (target.floor - actual.floor) * pixelsPerFloor / 2,
    }
  }
  throw new Error(`Could not locate touch placement ${target.floor}:${target.x}; ${JSON.stringify({ originTile, horizontal, vertical, pixelsPerTile, pixelsPerFloor, attempts })}`)
}

async function touchPlacement(touch: CDPSession, canvas: Locator, start: TowerTile, end: TowerTile): Promise<void> {
  const startPoint = await touchTilePoint(touch, canvas, start)
  const endPoint = await touchTilePoint(touch, canvas, end)
  await touchAt(touch, startPoint, 'touchStart')
  await touchAt(touch, endPoint, 'touchMove')
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
