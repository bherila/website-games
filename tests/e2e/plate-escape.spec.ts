import { expect, type Locator, type Page, test } from '@playwright/test'

import { HARBOR_TRACES, LAB_TRACES, MILL_TRACES, VILLAGE_TRACES, WORKSHOP_TRACE } from '../../resources/js/games/plate-escape/__tests__/campaignFixtures'
import { getLevel } from '../../resources/js/games/plate-escape/level'

test.describe('Plate Escape real puzzle', () => {
  test.use({ deviceScaleFactor: 1 })

  test('rotates, reveals screws, undoes, sorts every color and remembers a clear', async ({ page, isMobile }, testInfo) => {
    test.setTimeout(360_000)
    if (!isMobile) await page.setViewportSize({ width: 1000, height: 850 })
    const errors: string[] = []
    const cloudWrites: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('request', (request) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && request.url().includes('/api/games/')) cloudWrites.push(request.url())
    })
    const activate = async (locator: Locator): Promise<void> => {
      if (isMobile) await locator.tap({ timeout: 15_000 })
      else await locator.click({ timeout: 15_000 })
    }
    await page.goto('/plate-escape')
    await expect(page.getByRole('heading', { name: 'Plate Escape', exact: true })).toBeVisible()
    await expect(page.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'false')
    await page.screenshot({ path: testInfo.outputPath('shared-level-picker.png') })
    await activate(page.getByRole('button', { name: 'Level 1, 0 stars', exact: true }))
    await expect(page.getByRole('heading', { name: 'Plate Escape.' })).toBeVisible()
    await expect(page.locator('[data-screw-id="front-1"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('screw-progress')).toHaveText('0 / 9 screws')
    await expect(page.locator('[data-screw-id^="back-"]')).toHaveCount(0)
    await expect(page.locator('[data-screw-id="right-roof-1"]')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('little-cottage.png') })
    for (let turn = 0; turn < 4; turn++) await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
    // The back gable's only screw carries the roof, so it is shown but held until the roof is off.
    await expect(page.locator('[data-bearing-screw-id="back-1"]')).toBeVisible()
    await expect(page.locator('[data-screw-id="back-1"]')).toHaveCount(0)
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
    await expect(page.getByRole('img', { name: /, cleared$/ })).toBeVisible()
    await activate(page.locator('[data-screw-id="front-1"]'))
    await expect(page.getByTestId('screw-progress')).toHaveText('1 / 9 screws')
    await activate(page.getByRole('button', { name: 'Restart', exact: true }))
    await expect(page.getByTestId('screw-progress')).toHaveText('0 / 9 screws')
    await expect(page.locator('[data-screw-id="front-1"]')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Level 1, 3 stars', exact: true })).toBeVisible()
    await expect(page.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'true')
    await activate(page.getByRole('button', { name: 'Level 1, 3 stars', exact: true }))
    await expect(page.getByRole('img', { name: /, cleared$/ })).toBeVisible()
    await expect(page.getByTestId('screw-progress')).toHaveText('0 / 9 screws')
    // The real tutorial win unlocks level two; no save or renderer state is injected.
    await activate(page.getByRole('button', { name: 'Levels', exact: false }))
    await activate(page.getByRole('button', { name: 'Level 2, 0 stars', exact: true }))
    await expect(page.getByRole('img', { name: 'Level 2: Garden Workshop', exact: true })).toBeVisible()
    await expect(page.getByTestId('screw-progress')).toHaveText('0 / 12 screws')
    await expect(page.getByLabel('Spare storage: 0 of 2', { exact: true })).toBeVisible()
    await expect(page.locator('[data-screw-id="front-brace-1"]')).toBeVisible()
    await expect(page.locator('[data-screw-id="front-1"]')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('garden-workshop.png') })
    const removeVisible = async (id: string): Promise<void> => {
      const head = page.locator(`[data-screw-id="${id}"]`)
      for (let turn = 0; turn < 9 && !await head.isVisible(); turn++) {
        await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
        await page.waitForTimeout(250)
      }
      await activate(head)
      await expect.poll(async () => await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled() || await page.getByRole('alertdialog').isVisible() || await page.getByTestId('screw-progress').textContent() === '12 / 12 screws').toBe(true)
    }
    await removeVisible('right-roof-1')
    await removeVisible('right-roof-2')
    await expect(page.getByText('Storage full · Match a tray or the next screw will overflow', { exact: true })).toBeVisible()
    // Full storage is recoverable: matching screws are still accepted.
    await removeVisible('front-brace-1')
    await expect(page.getByLabel('Coral tray: 1 of 3', { exact: true })).toBeVisible()
    await removeVisible('left-roof-2')
    await expect(page.getByRole('heading', { name: 'No room for that screw' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('workshop-overflow.png') })
    await activate(page.getByRole('button', { name: 'Undo last move', exact: true }))
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(page.getByTestId('screw-progress')).toHaveText('3 / 12 screws')
    await expect(page.getByLabel('Spare storage: 2 of 2', { exact: true })).toBeVisible()
    await removeVisible('left-roof-2')
    await activate(page.getByRole('button', { name: 'Retry level', exact: true }))
    await expect(page.getByTestId('screw-progress')).toHaveText('0 / 12 screws')
    await expect(page.getByLabel('Spare storage: 0 of 2', { exact: true })).toBeVisible()
    for (const id of WORKSHOP_TRACE.win) {
      await removeVisible(id)
      if (id !== 'front-1') continue
      // The front gable's last screw waits for the roof, and tapping it says why.
      const held = page.locator('[data-bearing-screw-id="front-2"]')
      for (let turn = 0; turn < 9 && !await held.isVisible(); turn++) {
        await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
        await page.waitForTimeout(250)
      }
      await expect(page.locator('[data-screw-id="front-2"]')).toHaveCount(0)
      await activate(held)
      await expect(page.getByTestId('plate-hint')).toHaveText('Front gable wall is holding up the left roof slope. Free the roof first.')
      await expect(page.getByTestId('screw-progress')).toHaveText('7 / 12 screws')
      await page.screenshot({ path: testInfo.outputPath('workshop-bearing-wall.png') })
    }
    await expect(page.getByRole('heading', { name: 'All plates free!' })).toBeVisible()
    await expect(page.getByTestId('plate-progress')).toHaveText('8 / 8 plates released')
    await expect(page.getByText('4 / 4 collected', { exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: '3 of 3 stars', exact: true })).toBeVisible()
    await page.reload()
    await activate(page.getByRole('button', { name: 'Level 2, 3 stars', exact: true }))
    await expect(page.getByRole('img', { name: /, cleared$/ })).toBeVisible()
    await expect(page.getByTestId('screw-progress')).toHaveText('0 / 12 screws')
    await activate(page.getByRole('button', { name: 'Levels', exact: false }))
    await expect(page.getByRole('button', { name: 'Level 1, 3 stars', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Level 2, 3 stars', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('shared-picker-cleared.png') })
    await activate(page.getByRole('button', { name: 'Level 2, 3 stars', exact: true }))
    await removeVisible('front-brace-1')
    await activate(page.getByRole('button', { name: 'Levels', exact: false }))
    await activate(page.getByRole('button', { name: 'Level 2, 3 stars', exact: true }))
    await expect(page.getByTestId('screw-progress')).toHaveText('0 / 12 screws')
    await activate(page.getByRole('button', { name: 'Levels', exact: false }))
    await activate(page.getByRole('link', { name: 'All games', exact: false }))
    await expect(page.getByTestId('game-card-plate-escape')).toBeVisible()
    expect(cloudWrites).toEqual([])
    expect(errors).toEqual([])
  })

  test('upgrades a two-level save and plays the windmill, glasshouse and café', async ({ page, isMobile }, testInfo) => {
    test.setTimeout(480_000)
    if (!isMobile) await page.setViewportSize({ width: 1000, height: 850 })
    // A historical released save exercises upgrade compatibility. New-level
    // boards and wins are reached exclusively through actual pointer/touch input.
    await page.addInitScript(() => {
      const key = 'bwh.plate-escape.progress.v1'
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, unlockedLevel: 2, stars: { 1: 3, 2: 3 } }))
    })
    const errors: string[] = []
    const cloudWrites: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('request', (request) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && request.url().includes('/api/games/')) cloudWrites.push(request.url())
    })
    const activate = async (locator: Locator): Promise<void> => {
      if (isMobile) await locator.tap({ timeout: 15_000 })
      else await locator.click({ timeout: 15_000 })
    }
    await page.goto('/plate-escape')
    await expect(page.getByRole('button', { name: 'Level 3, 0 stars', exact: true })).toBeVisible()
    await expect(page.getByTestId('level-tile-4')).toHaveAttribute('data-unlocked', 'false')
    await activate(page.getByRole('button', { name: 'Level 3, 0 stars', exact: true }))
    for (const trace of VILLAGE_TRACES) {
      await expect(page.getByRole('dialog')).toBeVisible()
      await activate(page.getByRole('button', { name: "Let's play", exact: true }))
      await expect(page.getByLabel('Upcoming trays: Blue, Amber', { exact: true })).toBeVisible()
      await expect(page.locator('[data-screw-id]:enabled').first()).toBeVisible()
      await expect(page.locator('[data-screw-id="front-1"]')).toHaveCount(0)
      await page.screenshot({ path: testInfo.outputPath(`level-${trace.level}.png`) })
      const removeVisible = async (id: string): Promise<void> => {
        const head = page.locator(`[data-screw-id="${id}"]`)
        for (let turn = 0; turn < 12 && !await head.isVisible(); turn++) {
          await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
          await page.waitForTimeout(250)
        }
        await expect(head).toBeVisible({ timeout: 10_000 })
        await activate(head)
        await expect.poll(async () => await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled() || await page.getByRole('alertdialog').isVisible() || await page.getByTestId('screw-progress').textContent() === '12 / 12 screws').toBe(true)
      }
      if (trace.level === 4) {
        for (let turn = 0; turn < 12 && !await page.locator('[data-covered-screw-id="front-1"]').isVisible(); turn++) {
          await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
          await page.waitForTimeout(250)
        }
        await expect(page.locator('[data-covered-screw-id="front-1"]')).toBeVisible()
        await expect(page.locator('[data-screw-id="front-1"]')).toHaveCount(0)
        await page.screenshot({ path: testInfo.outputPath('glass-heads-locked.png') })
      }
      for (const id of trace.lose) await removeVisible(id)
      await expect(page.getByRole('heading', { name: 'No room for that screw' })).toBeVisible()
      await activate(page.getByRole('button', { name: 'Undo last move', exact: true }))
      await expect(page.getByRole('alertdialog')).toHaveCount(0)
      await expect(page.getByTestId('screw-progress')).toHaveText(`${trace.lose.length - 1} / 12 screws`)
      await removeVisible(trace.lose.at(-1)!)
      await activate(page.getByRole('button', { name: 'Retry level', exact: true }))
      await expect(page.getByTestId('screw-progress')).toHaveText('0 / 12 screws')
      for (const id of trace.win) await removeVisible(id)
      await expect(page.getByRole('heading', { name: 'All plates free!' })).toBeVisible()
      await expect(page.getByText('4 / 4 collected', { exact: true })).toBeVisible()
      await expect(page.getByRole('img', { name: '3 of 3 stars', exact: true })).toBeVisible()
      await activate(page.getByRole('button', { name: 'Next level', exact: true }))
    }
    // The café leads on to the mill, whose first level opens with its introduction.
    await expect(page.getByRole('dialog', { name: 'Waterwheel' })).toBeVisible()
    await page.reload()
    for (const id of [1, 2, 3, 4, 5]) await expect(page.getByRole('button', { name: `Level ${id}, 3 stars`, exact: true })).toBeVisible()
    expect(cloudWrites).toEqual([])
    expect(errors).toEqual([])
  })

  test.describe('the mill', () => {
    // Turning parts hold still, so a trace taps each head where it was found.
    test.use({ reducedMotion: 'reduce' })

    test('plays shared screws, hinged doors and the windmill hill', async ({ page, isMobile }, testInfo) => {
      test.setTimeout(600_000)
      if (!isMobile) await page.setViewportSize({ width: 1000, height: 850 })
      await page.addInitScript(() => {
        const key = 'bwh.plate-escape.progress.v1'
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, unlockedLevel: 6, stars: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 } }))
      })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(String(error)))
      const activate = async (locator: Locator): Promise<void> => {
        if (isMobile) await locator.tap({ timeout: 15_000 })
        else await locator.click({ timeout: 15_000 })
      }
      const find = async (locator: Locator): Promise<void> => {
        for (let turn = 0; turn < 12 && !await locator.isVisible(); turn++) {
          await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
          await page.waitForTimeout(250)
        }
        await expect(locator).toBeVisible({ timeout: 10_000 })
      }
      const removeVisible = async (id: string): Promise<void> => {
        const head = page.locator(`[data-screw-id="${id}"]`)
        await find(head)
        await activate(head)
        await expect.poll(async () => await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled() || await page.getByRole('alertdialog').isVisible() || await page.getByTestId('screw-progress').textContent() === '12 / 12 screws').toBe(true)
      }
      await page.goto('/plate-escape')
      await expect(page.getByTestId('level-tile-7')).toHaveAttribute('data-unlocked', 'false')
      await activate(page.getByRole('button', { name: 'Level 6, 0 stars', exact: true }))
      for (const trace of MILL_TRACES) {
        const play = page.getByRole('button', { name: "Let's play", exact: true })
        if ([6, 9].includes(trace.level)) await activate(play)
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(page.getByTestId('screw-progress')).toHaveText('0 / 12 screws')
        // Under reduced motion there is nothing to pause.
        await expect(page.getByRole('button', { name: 'Pause motion', exact: true })).toHaveCount(0)
        await page.screenshot({ path: testInfo.outputPath(`level-${trace.level}.png`) })
        for (const id of trace.lose) await removeVisible(id)
        await expect(page.getByRole('heading', { name: 'No room for that screw' })).toBeVisible()
        await activate(page.getByRole('button', { name: 'Retry level', exact: true }))
        await expect(page.getByTestId('screw-progress')).toHaveText('0 / 12 screws')
        for (const id of trace.win) {
          if (trace.level === 6 && id === 'wheel-1') {
            // The axle is the gable's last screw and runs through the wheel, which still has its own.
            const axle = page.locator('[data-bearing-screw-id="wheel-axle"]')
            await find(axle)
            await activate(axle)
            await expect(page.getByTestId('plate-hint')).toHaveText('Front gable wall is holding up the waterwheel. Free the waterwheel first.')
            await page.screenshot({ path: testInfo.outputPath('waterwheel-axle-held.png') })
          }
          await removeVisible(id)
          if (trace.level === 9 && id === 'loft-door-1') await page.screenshot({ path: testInfo.outputPath('loft-door-open.png') })
        }
        await expect(page.getByRole('heading', { name: 'All plates free!' })).toBeVisible()
        await expect(page.getByText('4 / 4 collected', { exact: true })).toBeVisible()
        await activate(page.getByRole('button', { name: 'Next level', exact: true }))
      }
      // The mill leads on to the harbor, whose first level opens with its introduction.
      await expect(page.getByRole('dialog', { name: 'Rowing Boat' })).toBeVisible()
      await page.reload()
      for (const id of [6, 7, 8, 9, 10]) await expect(page.getByRole('button', { name: `Level ${id}, 3 stars`, exact: true })).toBeVisible()
      expect(errors).toEqual([])
    })
  })

  test.describe('the harbor', () => {
    test.use({ reducedMotion: 'reduce' })

    test('plays drop flaps, shutters, a hasp and a counterweight that cover what they land on', async ({ page, isMobile }, testInfo) => {
      test.setTimeout(600_000)
      if (!isMobile) await page.setViewportSize({ width: 1000, height: 850 })
      await page.addInitScript(() => {
        const key = 'bwh.plate-escape.progress.v1'
        const stars = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, 3]))
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, unlockedLevel: 11, stars }))
      })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(String(error)))
      const activate = async (locator: Locator): Promise<void> => {
        if (isMobile) await locator.tap({ timeout: 15_000 })
        else await locator.click({ timeout: 15_000 })
      }
      const find = async (locator: Locator): Promise<void> => {
        for (let turn = 0; turn < 12 && !await locator.isVisible(); turn++) {
          await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
          await page.waitForTimeout(250)
        }
        await expect(locator).toBeVisible({ timeout: 10_000 })
      }
      const removeVisible = async (id: string): Promise<void> => {
        const head = page.locator(`[data-screw-id="${id}"]`)
        await find(head)
        await activate(head)
        await expect.poll(async () => await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled() || await page.getByRole('alertdialog').isVisible() || await page.getByTestId('screw-progress').textContent() === '12 / 12 screws').toBe(true)
      }
      /** No turn of the view offers a head that a dropped cover lies over. */
      const buried = async (id: string): Promise<void> => {
        for (let turn = 0; turn < 8; turn++) {
          await expect(page.locator(`[data-screw-id="${id}"]`)).toHaveCount(0)
          await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
          await page.waitForTimeout(250)
        }
      }
      await page.goto('/plate-escape')
      await expect(page.getByTestId('level-tile-12')).toHaveAttribute('data-unlocked', 'false')
      await activate(page.getByRole('button', { name: 'Level 11, 0 stars', exact: true }))
      for (const trace of HARBOR_TRACES) {
        if (getLevel(trace.level).introduction) await activate(page.getByRole('button', { name: "Let's play", exact: true }))
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(page.getByTestId('screw-progress')).toHaveText('0 / 12 screws')
        await page.screenshot({ path: testInfo.outputPath(`level-${trace.level}.png`) })
        for (const id of trace.lose) await removeVisible(id)
        await expect(page.getByRole('heading', { name: 'No room for that screw' })).toBeVisible()
        await activate(page.getByRole('button', { name: 'Retry level', exact: true }))
        await expect(page.getByTestId('screw-progress')).toHaveText('0 / 12 screws')
        // Freed first, each captive cover drops over the screw beneath it; undo lifts it back.
        const level = getLevel(trace.level)
        for (const cover of level.plates.filter((plate) => level.screws.some((screw) => screw.coveredWhenOpen?.includes(plate.id)))) {
          const release = level.screws.find((screw) => screw.plate === cover.id)!.id
          const under = level.screws.find((screw) => screw.coveredWhenOpen?.includes(cover.id))!.id
          await find(page.locator(`[data-screw-id="${under}"]`))
          await removeVisible(release)
          await page.screenshot({ path: testInfo.outputPath(`${cover.id}-open.png`) })
          await buried(under)
          await activate(page.getByRole('button', { name: 'Undo', exact: true }))
          await find(page.locator(`[data-screw-id="${under}"]`))
        }
        for (const id of trace.win) await removeVisible(id)
        await expect(page.getByRole('heading', { name: 'All plates free!' })).toBeVisible()
        await expect(page.getByText('4 / 4 collected', { exact: true })).toBeVisible()
        if (trace.level < 15) await activate(page.getByRole('button', { name: 'Next level', exact: true }))
        else await expect(page.getByRole('button', { name: 'Next level', exact: true })).toHaveCount(0)
      }
      await page.reload()
      for (const id of [11, 12, 13, 14, 15]) await expect(page.getByRole('button', { name: `Level ${id}, 3 stars`, exact: true })).toBeVisible()
      expect(errors).toEqual([])
    })
  })

  test.describe('the dial lab', () => {
    test.use({ reducedMotion: 'reduce' })

    test('a stop pin or a head in the window holds the dial; turns show each head and undo like moves', async ({ page, isMobile }) => {
      test.setTimeout(300_000)
      if (!isMobile) await page.setViewportSize({ width: 1000, height: 850 })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(String(error)))
      const activate = async (locator: Locator): Promise<void> => {
        if (isMobile) await locator.tap({ timeout: 15_000 })
        else await locator.click({ timeout: 15_000 })
      }
      const dial = page.getByRole('slider', { name: 'Combination dial', exact: true })
      const act = async (action: string): Promise<void> => {
        const [kind, , step] = action.split(':')
        if (kind === 'turn') {
          const before = await dial.getAttribute('aria-valuenow')
          await activate(page.getByRole('button', { name: `Turn the combination dial ${step === '1' ? 'right' : 'left'}`, exact: true }))
          await expect(dial).not.toHaveAttribute('aria-valuenow', before!)
          return
        }
        const head = page.locator(`[data-screw-id="${action}"]`)
        await activate(page.getByRole('button', { name: 'Reset view', exact: true }))
        for (let turn = 0; turn < 12 && !await head.isVisible(); turn++) {
          await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
          await page.waitForTimeout(250)
        }
        const removed = await page.getByTestId('screw-progress').textContent()
        await activate(head)
        await expect(page.getByTestId('screw-progress')).not.toHaveText(removed!)
        // The dial waits while the head flies to its tray.
        await expect.poll(async () => await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled() || await page.getByRole('alertdialog').isVisible() || await page.getByRole('heading', { name: 'All plates free!' }).isVisible()).toBe(true)
      }
      for (const trace of LAB_TRACES) {
        await page.goto(`/plate-escape?lab=${trace.lab}`)
        await activate(page.getByRole('button', { name: "Let's play", exact: true }))
        await expect(dial).toHaveAttribute('aria-valuenow', '1')
        // The first turn is refused, and the hint names what holds the dial.
        await activate(page.getByRole('button', { name: 'Turn the combination dial right', exact: true }))
        await expect(page.getByTestId('plate-hint')).toHaveText(trace.lab === 'dial-pin' ? 'The stop pin holds the combination dial. Take it out first.' : 'The coral screw in the window catches the combination dial. Take it out first.')
        await expect(dial).toHaveAttribute('aria-valuenow', '1')
        for (const action of trace.lose) await act(action)
        await expect(page.getByRole('heading', { name: 'No room for that screw' })).toBeVisible()
        await activate(page.getByRole('button', { name: 'Retry level', exact: true }))
        await expect(dial).toHaveAttribute('aria-valuenow', '1')
        const firstTurn = trace.win.findIndex((action) => action.startsWith('turn:'))
        for (const [index, action] of trace.win.entries()) {
          await act(action)
          if (index !== firstTurn) continue
          // A turn is a move: undo turns the dial back, and arrow keys on the focused dial turn it again.
          const stop = await dial.getAttribute('aria-valuenow')
          await activate(page.getByRole('button', { name: 'Undo', exact: true }))
          await expect(dial).toHaveAttribute('aria-valuenow', '1')
          await dial.focus()
          await page.keyboard.press(action.endsWith(':1') ? 'ArrowRight' : 'ArrowLeft')
          await expect(dial).toHaveAttribute('aria-valuenow', stop!)
          await expect(dial).toBeFocused()
        }
        await expect(page.getByRole('heading', { name: 'All plates free!' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Next level', exact: true })).toHaveCount(0)
      }
      // Lab boards are never listed or saved.
      expect(await page.evaluate(() => localStorage.getItem('bwh.plate-escape.progress.v1'))).toBeNull()
      await page.goto('/plate-escape')
      await expect(page.getByRole('button', { name: /^Level 90[12]/ })).toHaveCount(0)
      expect(errors).toEqual([])
    })
  })

  test('windmill sails turn, stop while the player reaches for them, and stay paused when asked', async ({ page, isMobile }) => {
    test.setTimeout(120_000)
    if (!isMobile) await page.setViewportSize({ width: 1000, height: 850 })
    await page.addInitScript(() => {
      const key = 'bwh.plate-escape.progress.v1'
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, unlockedLevel: 10, stars: {} }))
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    const sail = page.locator('[data-screw-id="sail-coral-1"]')
    const where = async (): Promise<{ x: number, y: number }> => {
      const box = await sail.boundingBox()
      expect(box).not.toBeNull()
      return { x: box!.x, y: box!.y }
    }
    const travel = async (seconds: number): Promise<number> => {
      const start = await where()
      await page.waitForTimeout(seconds * 1000)
      const end = await where()
      return Math.hypot(end.x - start.x, end.y - start.y)
    }
    const scene = page.getByTestId('plate-escape-scene')
    const reach = async (): Promise<void> => {
      const box = (await scene.boundingBox())!
      if (isMobile) await page.touchscreen.tap(box.x + 12, box.y + 12)
      else await page.mouse.move(box.x + 12, box.y + 12)
    }
    await page.goto('/plate-escape')
    await page.getByRole('button', { name: 'Level 10, 0 stars', exact: true }).click()
    await expect(sail).toBeVisible({ timeout: 30_000 })
    await page.mouse.move(0, 0)
    expect(await travel(1.5)).toBeGreaterThan(4)
    // Reaching for the board stops the sails within half a second.
    await reach()
    await page.waitForTimeout(700)
    expect(await travel(1.5)).toBeLessThan(1)
    // Left alone, they pick up again.
    await page.mouse.move(0, 0)
    await page.waitForTimeout(4500)
    expect(await travel(1.5)).toBeGreaterThan(2)
    await page.getByRole('button', { name: 'Pause motion', exact: true }).click()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(5000)
    expect(await travel(1.5)).toBeLessThan(1)
    await page.reload()
    await page.getByRole('button', { name: 'Level 10, 0 stars', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Resume motion', exact: true })).toBeVisible()
    await expect(sail).toBeVisible({ timeout: 30_000 })
    await page.mouse.move(0, 0)
    expect(await travel(1.5)).toBeLessThan(1)
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
