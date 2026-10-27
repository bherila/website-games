import { expect, type Locator, test } from '@playwright/test'

import { HARBOR_TRACES } from '../../resources/js/games/plate-escape/__tests__/campaignFixtures'
import { getLevel } from '../../resources/js/games/plate-escape/level'

// Split from plate-escape.spec.ts so the gameplay groups can balance each arc's journey on its own.
test.describe('Plate Escape real puzzle', () => {
  test.use({ deviceScaleFactor: 1 })

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
        await activate(page.getByRole('button', { name: 'Next level', exact: true }))
      }
      // The harbor leads on to the railway, whose first level opens with its introduction.
      await expect(page.getByRole('dialog', { name: 'Toy Steam Engine' })).toBeVisible()
      await page.reload()
      for (const id of [11, 12, 13, 14, 15]) await expect(page.getByRole('button', { name: `Level ${id}, 3 stars`, exact: true })).toBeVisible()
      expect(errors).toEqual([])
    })
  })
})
