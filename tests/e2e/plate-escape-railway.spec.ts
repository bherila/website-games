import { expect, type Locator, test } from '@playwright/test'

import { RAILWAY_TRACES } from '../../resources/js/games/plate-escape/__tests__/campaignFixtures'
import { getLevel } from '../../resources/js/games/plate-escape/level'

// Split from plate-escape.spec.ts so the gameplay groups can balance each arc's journey on its own.
test.describe('Plate Escape real puzzle', () => {
  test.use({ deviceScaleFactor: 1 })

  test.describe('the railway', () => {
    test.use({ reducedMotion: 'reduce' })

    test('plays stop-pinned dials, a two-window dial, two selectors and the locomotive', async ({ page, isMobile }, testInfo) => {
      test.setTimeout(900_000)
      if (!isMobile) await page.setViewportSize({ width: 1000, height: 850 })
      await page.addInitScript(() => {
        const key = 'bwh.plate-escape.progress.v1'
        const stars = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [index + 1, 3]))
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, unlockedLevel: 16, stars }))
      })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(String(error)))
      const activate = async (locator: Locator): Promise<void> => {
        if (isMobile) await locator.tap({ timeout: 15_000 })
        else await locator.click({ timeout: 15_000 })
      }
      const progress = page.getByTestId('screw-progress')
      const slider = (level: number, id: string): Locator => page.getByRole('slider', { name: getLevel(level).plates.find((plate) => plate.id === id)!.name, exact: true })
      const turnButton = (level: number, id: string, step: string): Locator => page.getByRole('button', { name: `Turn the ${getLevel(level).plates.find((plate) => plate.id === id)!.name.toLowerCase()} ${step === '1' ? 'right' : 'left'}`, exact: true })
      /** A dial turn through its own buttons, or a head found by turning the view and tapped. */
      const act = async (level: number, action: string): Promise<void> => {
        const [kind, id, step] = action.split(':')
        if (kind === 'turn') {
          const before = await slider(level, id!).getAttribute('aria-valuenow')
          await activate(turnButton(level, id!, step!))
          await expect(slider(level, id!)).not.toHaveAttribute('aria-valuenow', before!)
          return
        }
        const head = page.locator(`[data-screw-id="${action}"]`)
        const removed = await progress.textContent()
        // Tap a head only from a view that shows it steadily, and turn on when a neighbouring head's
        // button lies over it or it flickers at the edge of sight.
        for (let turn = 0; ; turn++) {
          expect(turn, `${action} never steadily in view`).toBeLessThan(16)
          await page.waitForTimeout(300)
          if (await head.isVisible()) {
            await page.waitForTimeout(300)
            if (await head.isVisible() && await (isMobile ? head.tap({ timeout: 2_000 }) : head.click({ timeout: 2_000 })).then(() => true, () => false)) break
          }
          await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
        }
        await expect(progress).not.toHaveText(removed!)
        // The dials wait while the head flies to its tray.
        await expect.poll(async () => await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled() || await page.getByRole('alertdialog').isVisible() || await page.getByRole('heading', { name: 'All plates free!' }).isVisible()).toBe(true)
      }
      await page.goto('/plate-escape')
      await expect(page.getByTestId('level-tile-17')).toHaveAttribute('data-unlocked', 'false')
      await activate(page.getByRole('button', { name: 'Level 16, 0 stars', exact: true }))
      for (const trace of RAILWAY_TRACES) {
        const level = getLevel(trace.level)
        const screws = `${level.screws.length} / ${level.screws.length} screws`
        if (level.introduction) await activate(page.getByRole('button', { name: "Let's play", exact: true }))
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(progress).toHaveText(`0 / ${level.screws.length} screws`)
        const dials = level.plates.filter((plate) => plate.dial)
        // Every dial has its own labelled control, all on screen together, and each starts held by its pin.
        for (const dial of dials) {
          await expect(slider(trace.level, dial.id)).toHaveAttribute('aria-valuenow', '1')
          await expect(slider(trace.level, dial.id)).toBeInViewport()
        }
        await page.screenshot({ path: testInfo.outputPath(`level-${trace.level}.png`) })
        const first = dials[0]!
        await activate(turnButton(trace.level, first.id, '1'))
        await expect(page.getByTestId('plate-hint')).toHaveText(`The stop pin holds the ${first.name.toLowerCase()}. Take it out first.`)
        await expect(slider(trace.level, first.id)).toHaveAttribute('aria-valuenow', '1')

        for (const action of trace.lose) await act(trace.level, action)
        await expect(page.getByRole('heading', { name: 'No room for that screw' })).toBeVisible()
        await activate(page.getByRole('button', { name: 'Retry level', exact: true }))
        await expect(progress).toHaveText(`0 / ${level.screws.length} screws`)
        for (const dial of dials) await expect(slider(trace.level, dial.id)).toHaveAttribute('aria-valuenow', '1')

        const firstTurn = trace.win.findIndex((action) => action.startsWith('turn:'))
        for (const [index, action] of trace.win.entries()) {
          await act(trace.level, action)
          if (index !== firstTurn) continue
          const [, id, step] = action.split(':')
          const turned = slider(trace.level, id!)
          const stop = await turned.getAttribute('aria-valuenow')
          // A selector's turn moves only that selector.
          for (const other of dials.filter((dial) => dial.id !== id)) await expect(slider(trace.level, other.id)).toHaveAttribute('aria-valuenow', '1')
          if (dials.length > 1) await page.screenshot({ path: testInfo.outputPath(`level-${trace.level}-selectors.png`) })
          // A turn is a move: undo turns the dial back, and arrow keys on the focused dial turn it again.
          await activate(page.getByRole('button', { name: 'Undo', exact: true }))
          await expect(turned).toHaveAttribute('aria-valuenow', '1')
          await turned.focus()
          await page.keyboard.press(step === '1' ? 'ArrowRight' : 'ArrowLeft')
          await expect(turned).toHaveAttribute('aria-valuenow', stop!)
          await expect(turned).toBeFocused()
        }
        await expect(page.getByRole('heading', { name: 'All plates free!' })).toBeVisible()
        await expect(progress).toHaveText(screws)
        await expect(page.getByText(`${level.trayColors.length} / ${level.trayColors.length} collected`, { exact: true })).toBeVisible()
        // After the locomotive, the clockworks follow.
        await activate(page.getByRole('button', { name: 'Next level', exact: true }))
      }
      // The railway leads on to the clockworks, whose first level opens with its introduction.
      await expect(page.getByRole('dialog', { name: 'Cuckoo Clock' })).toBeVisible()
      await page.reload()
      for (const id of [16, 17, 18, 19, 20]) await expect(page.getByRole('button', { name: `Level ${id}, 3 stars`, exact: true })).toBeVisible()
      expect(errors).toEqual([])
    })
  })
})
