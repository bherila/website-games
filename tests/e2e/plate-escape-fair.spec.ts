import { expect, type Locator,test } from '@playwright/test'

import { FAIR_TRACES } from '../../resources/js/games/plate-escape/__tests__/campaignFixtures'
import { createPuzzle, rackOpen, removeScrew, turnDial } from '../../resources/js/games/plate-escape/engine'
import { getLevel } from '../../resources/js/games/plate-escape/level'

// The fair's journey has its own file so the gameplay groups can balance it (see scripts/select-gameplay-tests.mjs).
test.describe('Plate Escape real puzzle', () => {
  test.use({ deviceScaleFactor: 1 })

  test.describe('the fair', () => {
    test.use({ reducedMotion: 'reduce' })

    test('the staging rack opens a third slot, undo and retry shut it, and each fair level loses and wins', async ({ page, isMobile }, testInfo) => {
      test.setTimeout(900_000)
      if (!isMobile) await page.setViewportSize({ width: 1000, height: 850 })
      await page.addInitScript(() => {
        const key = 'bwh.plate-escape.progress.v1'
        const stars = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [index + 1, 3]))
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, unlockedLevel: 26, stars }))
      })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(String(error)))
      const activate = async (locator: Locator): Promise<void> => {
        if (isMobile) await locator.tap({ timeout: 15_000 })
        else await locator.click({ timeout: 15_000 })
      }
      const progress = page.getByTestId('screw-progress')
      const locked = page.getByRole('img', { name: 'Spare slot 3 locked: free the staging rack to open it', exact: true })
      let level = FAIR_TRACES[0].level as number
      /** A removal, tapped from a view that shows the head steadily, or a turn of the level's dial. */
      const act = async (action: string): Promise<void> => {
        const [kind, id, step] = action.split(':')
        if (kind === 'turn') {
          const name = getLevel(level).plates.find((plate) => plate.id === id)!.name
          const dial = page.getByRole('slider', { name, exact: true })
          const before = await dial.getAttribute('aria-valuenow')
          await activate(page.getByRole('button', { name: `Turn the ${name.toLowerCase()} ${step === '1' ? 'right' : 'left'}`, exact: true }))
          await expect(dial).not.toHaveAttribute('aria-valuenow', before!)
          return
        }
        const head = page.locator(`[data-screw-id="${action}"]`)
        const removed = await progress.textContent()
        await activate(page.getByRole('button', { name: 'Reset view', exact: true }))
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
        await expect.poll(async () => await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled() || await page.getByRole('alertdialog').isVisible() || await page.getByRole('heading', { name: 'All plates free!' }).isVisible()).toBe(true)
      }
      await page.goto('/plate-escape')
      await activate(page.getByRole('button', { name: 'Level 26, 0 stars', exact: true }))
      for (const trace of FAIR_TRACES) {
        level = trace.level
        if (getLevel(level).introduction) await activate(page.getByRole('button', { name: "Let's play", exact: true }))
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(progress).toHaveText('0 / 15 screws')
        // The rack's slot shows from the start, locked under its mark.
        await expect(locked).toBeVisible()
        await expect(page.getByText('2 spare slots · Free the staging rack for one more', { exact: true })).toBeVisible()
        await page.screenshot({ path: testInfo.outputPath(`level-${level}.png`) })
        for (const action of trace.lose) await act(action)
        await expect(page.getByRole('heading', { name: 'No room for that screw' })).toBeVisible()
        await expect(page.locator('#storage-full-help')).toContainText('All 2 open spare slots are full, the staging rack is still shut, and this')
        await activate(page.getByRole('button', { name: 'Retry level', exact: true }))
        await expect(progress).toHaveText('0 / 15 screws')
        await expect(locked).toBeVisible()
        if (level === 30) {
          // The float's counterweight: dropped, its cord lifts the hatch off the screw behind it; undone, the hatch shuts again.
          await expect(page.locator('[data-screw-id="arch-back-2"]')).toHaveCount(0)
          await act('weight-1')
          await act('arch-back-2')
          await activate(page.getByRole('button', { name: 'Undo', exact: true }))
          await activate(page.getByRole('button', { name: 'Undo', exact: true }))
          await expect(progress).toHaveText('0 / 15 screws')
        }
        if (level === 28) {
          // The stop pin holds the collar until it is out, and the hint says so.
          await activate(page.getByRole('button', { name: 'Turn the collar right', exact: true }))
          await expect(page.getByTestId('plate-hint')).toHaveText('The stop pin holds the collar. Take it out first.')
        }
        // The move that frees the rack, found by replaying the trace through the engine.
        let board = createPuzzle(level)
        const opens = trace.win.findIndex((action) => {
          const [kind, dial, step] = action.split(':')
          board = kind === 'turn' ? turnDial(board, dial!, Number(step) as 1 | -1) : removeScrew(board, action)
          return rackOpen(board)
        })
        for (const [index, action] of trace.win.entries()) {
          await act(action)
          if (index !== opens) continue
          // Freeing the rack opens its slot for this attempt; undo shuts it again with the screw back in place.
          await expect(locked).toHaveCount(0)
          await expect(page.locator('[data-rack-slot="open"]')).toBeVisible()
          await expect(page.getByTestId('plate-hint')).toHaveText('The staging rack is open: one more spare slot for this attempt.')
          await expect(page.getByText(/^3 spare slots · |^Storage full · Match a tray or the next/)).toBeVisible()
          await page.screenshot({ path: testInfo.outputPath(`level-${level}-rack-open.png`) })
          await activate(page.getByRole('button', { name: 'Undo', exact: true }))
          await expect(locked).toBeVisible()
          await expect(page.getByTestId('plate-hint')).toHaveText('Last screw restored. The staging rack is shut again, and its slot with it.')
          await act(action)
          await expect(locked).toHaveCount(0)
        }
        await expect(page.getByRole('heading', { name: 'All plates free!' })).toBeVisible()
        await expect(page.getByText('5 / 5 collected', { exact: true })).toBeVisible()
        if (level < 30) await activate(page.getByRole('button', { name: 'Next level', exact: true }))
        else await expect(page.getByRole('button', { name: 'Next level', exact: true })).toHaveCount(0)
      }
      await page.reload()
      for (const id of [26, 27, 28, 29, 30]) await expect(page.getByRole('button', { name: `Level ${id}, 3 stars`, exact: true })).toBeVisible()
      expect(errors).toEqual([])
    })
  })
})
