import { type CDPSession, expect, type Page, test } from '@playwright/test'

import type { HoverVisualState } from '../../resources/js/games/hover/visualTestMode'

const SETTINGS_KEY = 'bwh.hover-game.settings.v1'
const PROGRESS_KEY = 'bwh.hover-game.progress.v1'

async function drive(page: Page, isMobile: boolean): Promise<void> {
  if (!isMobile) {
    await page.keyboard.down('w')
    try {
      await expect.poll(async () => Number(await page.getByTestId('speed-value').textContent()), { timeout: 15_000 }).toBeGreaterThan(0)
    } finally {
      await page.keyboard.up('w')
    }
    return
  }

  const stick = await page.getByTestId('touch-stick').boundingBox()
  if (!stick) {
    throw new Error('The touch joystick is not mounted')
  }
  // CDP sends native touch input, including pointer capture and release.
  const session = await page.context().newCDPSession(page)
  const center = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 }
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] })
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: center.x, y: center.y - 36 }],
    })
    await expect.poll(async () => Number(await page.getByTestId('speed-value').textContent()), { timeout: 15_000 }).toBeGreaterThan(0)
  } finally {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await session.detach()
  }
  await expect(page.getByTestId('touch-stick-knob')).toHaveCSS('top', '36px')
}

interface MinimapReading {
  points: Array<{ x: number; y: number }>
  width: number
  height: number
  speed: number
  collected: number
  cleared: boolean
  lost: boolean
}

async function readMinimap(page: Page): Promise<MinimapReading> {
  return page.getByRole('img', { name: 'Minimap', exact: true }).evaluate(async (element, progressKey) => {
    // Observe real rendered frames without advancing or replacing game time.
    for (let frame = 0; frame < 2; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
    const canvas = element as HTMLCanvasElement
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    const points: Array<{ x: number; y: number }> = []
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4
        if (pixels[i]! > 235 && pixels[i + 1]! > 235 && pixels[i + 2]! > 235) {
          points.push({ x: x + 0.5, y: y + 0.5 })
        }
      }
    }
    return {
      points, width: canvas.width, height: canvas.height,
      speed: Number(document.querySelector('[data-testid="speed-value"]')?.textContent ?? 0) / 3.6,
      collected: document.querySelectorAll('[data-testid="flag-dot-blue"][data-filled="true"]').length,
      // A slow rendered frame can outlast the three-second clear banner.
      cleared: JSON.parse(localStorage.getItem(progressKey) ?? 'null')?.mapsCleared?.castle === 1,
      lost: document.body.textContent?.includes('THE DRONE BEAT YOU!') ?? false,
    }
  }, PROGRESS_KEY)
}

async function collectCastleFlags(page: Page, isMobile: boolean): Promise<void> {
  // Seed 1177 puts blue flags at (1,5), (5,2), (13,3). These waypoints avoid
  // arrow pads, traps and powerups; all three pickups still require real driving.
  // The third column requires actual HUD pickups at flag positions; pixel
  // proximity alone cannot prove the craft entered the 1.6-unit pickup radius.
  const route = [[9, 33, 1], [15, 15, 0], [33, 15, 2], [45, 15, 0], [45, 9, 0], [81, 9, 0], [81, 21, 3]] as const
  const initial = await readMinimap(page)
  const scale = initial.width / 174
  const offsetY = (initial.height - 126 * scale) / 2
  let previous = { x: 9, z: 9 }
  let correction = { x: 0, z: 0 }
  const position = (reading: MinimapReading): { x: number; z: number } => {
    // The white player triangle stays near its last visible position; the
    // drone's distant white outline must not enter the centroid calculation.
    const points = reading.points.filter((point) =>
      Math.hypot(point.x - previous.x * scale, point.y - offsetY - previous.z * scale) < 10)
    expect(points.length, 'visible player marker on the minimap').toBeGreaterThan(0)
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length / scale - correction.x,
      z: (points.reduce((sum, point) => sum + point.y, 0) / points.length - offsetY) / scale - correction.z,
    }
  }
  const origin = position(initial)
  correction = { x: origin.x - 9, z: origin.z - 9 }
  // Castle starts facing its center. We strafe without rotating, keeping the
  // marker's subpixel centroid offset constant throughout this short route.
  const length = Math.hypot(78, 54)
  const forward = { x: 78 / length, z: 54 / length }
  const left = { x: forward.z, z: -forward.x }
  let held = new Set<string>()
  let session: CDPSession | undefined
  let stick: { x: number; y: number } | undefined
  if (isMobile) {
    const bounds = await page.getByTestId('touch-stick').boundingBox()
    expect(bounds).not.toBeNull()
    stick = { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 }
    session = await page.context().newCDPSession(page)
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick] })
  }

  const updateInput = async (thrust: number, strafe: number): Promise<void> => {
    if (session && stick) {
      // Exercise the real radial clamp/deadzone with native diagonal
      // movement and pointer capture, just as a player uses the stick.
      const axis = (value: number): number => Math.abs(value) < 8 ? 0 : Math.sign(value)
      const a = axis(strafe)
      const b = axis(thrust)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: stick.x - a * 36, y: stick.y - b * 36 }],
      })
    } else {
      const keys = new Set([
        ...(thrust > 8 ? ['w'] : thrust < -8 ? ['s'] : []),
        ...(strafe > 8 ? ['a'] : strafe < -8 ? ['d'] : []),
      ])
      await Promise.all([
        ...[...held].filter((key) => !keys.has(key)).map((key) => page.keyboard.up(key)),
        ...[...keys].filter((key) => !held.has(key)).map((key) => page.keyboard.down(key)),
      ])
      held = keys
    }
  }
  try {
    for (const [x, z, requiredFlags] of route) {
      if (process.env.HOVER_DRIVE_DEBUG) console.log('Castle waypoint', x, z)
      let arrived = false
      for (let attempt = 0; attempt < 200; attempt++) {
        const reading = await readMinimap(page)
        expect(reading.lost, 'finish the Castle route before the drone').toBe(false)
        if (reading.cleared) {
          return
        }
        const current = position(reading)
        // CDP input itself can span rendered frames on software WebGL. The
        // visible speed gives magnitude without assuming a wall/frame interval.
        const travelX = current.x - previous.x
        const travelZ = current.z - previous.z
        const travel = Math.hypot(travelX, travelZ)
        const vx = travel > 0.1 ? travelX / travel * reading.speed : 0
        const vz = travel > 0.1 ? travelZ / travel * reading.speed : 0
        previous = current
        if (process.env.HOVER_DRIVE_DEBUG && attempt % 10 === 0) {
          console.log('Castle position', { current, speed: reading.speed, vx, vz, collected: reading.collected })
        }
        const dx = x! - current.x
        const dz = z! - current.z
        const distance = Math.hypot(dx, dz)
        const checkpointReached = requiredFlags > 0
          ? requiredFlags < 3 && reading.collected >= requiredFlags
          : distance < 1.5 && reading.speed < 6
        if (checkpointReached) {
          await updateInput(0, 0)
          arrived = true
          break
        }
        const speed = Math.min(14, distance * 3) / Math.max(distance, 0.001)
        const ax = (dx * speed - vx) * 4
        const az = (dz * speed - vz) * 4
        const thrust = ax * forward.x + az * forward.z
        const strafe = ax * left.x + az * left.z
        await updateInput(thrust, strafe)
      }
      expect(arrived, `drive to Castle waypoint (${x}, ${z})`).toBe(true)
    }
    throw new Error('Castle driving ended without a saved victory')
  } finally {
    for (const key of held) await page.keyboard.up(key)
    if (session) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await session.detach()
    }
  }
}

test.describe('Hover gameplay', () => {
  // Layout and native touch are the contract here; avoid rendering four
  // physical pixels per CSS pixel on software WebGL mobile runners.
  test.use({ deviceScaleFactor: 1 })
  test.setTimeout(120_000)

  test('driving, pause and resume work with keyboard and native touch input', async ({ page, isMobile }) => {
    if (!isMobile) {
      await page.setViewportSize({ width: 1280, height: 720 })
    }
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto('/hover')
    await expect(page.getByRole('heading', { name: 'HOVER', exact: true })).toBeVisible()
    await expect(page.getByTestId('level-select-0')).toBeEnabled()
    await expect(page.getByTestId('level-select-1')).toBeDisabled()
    await page.getByRole('button', { name: 'Start Engine', exact: true }).click()
    await expect(page.getByText('Collect 3 blue flags — beat the drone!', { exact: true })).toBeHidden()
    await expect(page.getByLabel('Rear-view mirror')).toBeVisible()
    await expect(page.getByTestId('flag-dot-blue')).toHaveCount(3)
    await expect(page.getByTestId('flag-dot-red')).toHaveCount(3)
    await expect(page.getByTestId('speed-value')).toHaveText('0')
    await drive(page, isMobile)

    if (isMobile) {
      await page.getByRole('button', { name: 'Pause', exact: true }).tap()
    } else {
      await page.keyboard.press('Escape')
    }
    await expect(page.getByRole('heading', { name: 'PAUSED', exact: true })).toBeVisible()
    // Allow the last throttled HUD snapshot to settle, then prove no physics
    // progresses while paused, even if movement keys are pressed.
    await page.waitForTimeout(250)
    const speed = await page.getByTestId('speed-value').textContent()
    const flagValue = page.getByText(/^flags worth \d+$/)
    const pausedFlagValue = await flagValue.textContent()
    await page.keyboard.press('w')
    await page.waitForTimeout(350)
    await expect(page.getByTestId('speed-value')).toHaveText(speed!)
    await expect(flagValue).toHaveText(pausedFlagValue!)
    await page.getByRole('button', { name: 'Resume', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'PAUSED', exact: true })).toBeHidden()
    await expect(flagValue).not.toHaveText(pausedFlagValue!, { timeout: 15_000 })
    await drive(page, isMobile)

    if (!isMobile) {
      await page.getByRole('button', { name: 'Mute sound', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toBeVisible()
      await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), SETTINGS_KEY))
        .toMatchObject({ muted: true })
    }
    await page.reload()
    await expect(page.getByRole('heading', { name: 'HOVER', exact: true })).toBeVisible()
    await expect(page.getByTestId('level-select-1')).toBeDisabled()
    await page.getByTestId('level-select-0').click()
    await expect(page.getByTestId('score-value')).toHaveText('0')
    await expect(page.getByTestId('speed-value')).toHaveText('0')
    if (!isMobile) {
      await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toBeVisible()
    }
    expect(errors).toEqual([])
  })

  test('a real Castle victory saves the score and unlocks City after reload', async ({ page, isMobile }) => {
    test.setTimeout(300_000)
    if (!isMobile) {
      await page.setViewportSize({ width: 1280, height: 720 })
    }
    // Fix only Date.now for reproducible normal-game spawns. Timers, RAF and
    // performance.now remain real, and visualTest is deliberately disabled:
    // preview sessions suppress progress writes.
    await page.clock.setFixedTime(new Date(420 * 2 ** 32 + 1177))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto('/hover')
    expect(await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY)).toBeNull()
    await expect(page.getByTestId('level-select-1')).toBeDisabled()
    await page.getByRole('button', { name: 'Start Engine', exact: true }).click()
    await expect(page.getByText('Collect 3 blue flags — beat the drone!', { exact: true })).toBeHidden()
    if (!isMobile) {
      // Existing journeys cover the full desktop layout. Bound the repeated
      // real WebGL frames needed for this longer progression journey.
      await page.setViewportSize({ width: 640, height: 480 })
    }
    await collectCastleFlags(page, isMobile)
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), PROGRESS_KEY))
      .toMatchObject({ bestRoundIndex: 1, mapsCleared: { castle: 1, city: 0 } })
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PROGRESS_KEY) as { bestScore: number }
    expect(saved.bestScore).toBeGreaterThan(1000)
    // The automatic next arena starts with fresh flags and carries the score.
    await expect(page.locator('[data-testid="flag-dot-blue"][data-filled="true"]')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByTestId('score-value')).toHaveText(saved.bestScore.toLocaleString())

    if (!isMobile) await page.setViewportSize({ width: 1280, height: 720 })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'HOVER', exact: true })).toBeVisible()
    await expect(page.getByText(`Best score: ${saved.bestScore.toLocaleString()}`, { exact: true })).toBeVisible()
    await expect(page.getByTestId('level-select-1')).toBeEnabled()
    await expect(page.getByTestId('level-select-2')).toBeDisabled()
    if (isMobile) await page.getByTestId('level-select-1').tap()
    else await page.getByTestId('level-select-1').click()
    await expect(page.getByText('Future City', { exact: true })).toBeVisible()
    await expect(page.getByTestId('score-value')).toHaveText('0')
    await expect(page.getByTestId('speed-value')).toHaveText('0')
    await expect(page.locator('[data-testid="flag-dot-blue"][data-filled="true"]')).toHaveCount(0)
    // An unfinished unlocked-map attempt does not award another clear or erase
    // the completed Castle record when the player returns to level select.
    await page.reload()
    await expect(page.getByTestId('level-select-1')).toBeEnabled()
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PROGRESS_KEY))
      .toMatchObject({ bestScore: saved.bestScore, bestRoundIndex: 1, mapsCleared: { castle: 1, city: 0 } })
    await page.getByTestId('level-select-0').click()
    await expect(page.getByTestId('score-value')).toHaveText('0')
    await expect(page.locator('[data-testid="flag-dot-blue"][data-filled="true"]')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('the seeded map preview renders another arena without unlocking it', async ({ page, isMobile }) => {
    if (!isMobile) {
      await page.setViewportSize({ width: 1280, height: 720 })
    }
    await page.goto('/hover?visualTest=1&autoStart=1&seed=42&round=3')
    await expect.poll(() => page.evaluate(() => window.__HOVER_VISUAL_READY__ === true), { timeout: 30_000 }).toBe(true)
    const rendered: HoverVisualState | undefined = await page.evaluate(() => window.__HOVER_VISUAL_STATE__)
    // The readiness hook reports the URL seed; the engine offsets it by the
    // round index when generating this arena's spawns.
    expect(rendered).toMatchObject({ mapId: 'neon', seed: 42 })
    await expect(page.getByLabel('Rear-view mirror')).toBeVisible()
    expect(await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY)).toBeNull()
    await page.goto('/hover')
    await expect(page.getByTestId('level-select-0')).toBeEnabled()
    await expect(page.getByTestId('level-select-3')).toBeDisabled()
  })
})
