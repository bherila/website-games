import { expect, type Locator, test } from '@playwright/test'

import { CLOCKWORK_TRACES } from '../../resources/js/games/plate-escape/__tests__/campaignFixtures'
import { getLevel } from '../../resources/js/games/plate-escape/level'

// Split from plate-escape.spec.ts so the gameplay groups can balance each arc's journey on its own.
test.describe('Plate Escape real puzzle', () => {
  test.use({ deviceScaleFactor: 1 })

  test.describe('the clockworks', () => {
    test.use({ reducedMotion: 'reduce' })

    test('plays linked counterweights: a weight drops, its cord opens a part, and undo shuts it again', async ({ page, isMobile }, testInfo) => {
      test.setTimeout(900_000)
      if (!isMobile) await page.setViewportSize({ width: 1000, height: 850 })
      await page.addInitScript(() => {
        const key = 'bwh.plate-escape.progress.v1'
        const stars = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [index + 1, 3]))
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, unlockedLevel: 21, stars }))
      })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(String(error)))
      const activate = async (locator: Locator): Promise<void> => {
        if (isMobile) await locator.tap({ timeout: 15_000 })
        else await locator.click({ timeout: 15_000 })
      }
      /** Turn until the head is offered and its own button is on top, as a player turns past two overlapping heads. */
      const onTop = async (locator: Locator): Promise<boolean> => await locator.isVisible() && await locator.evaluate((button) => {
        const box = button.getBoundingClientRect()
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === button
      })
      const find = async (locator: Locator): Promise<void> => {
        for (let turn = 0; turn < 12 && !await onTop(locator); turn++) {
          await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
          await page.waitForTimeout(250)
        }
        await expect(locator).toBeVisible({ timeout: 10_000 })
      }
      /** A screw id, or a dial turn written `turn:<dial>:<1|-1>`, through real input. */
      const act = async (level: number, action: string): Promise<void> => {
        const [kind, dialId, step] = action.split(':')
        if (kind === 'turn') {
          const name = getLevel(level).plates.find((plate) => plate.id === dialId)!.name.toLowerCase()
          const dial = page.locator(`[data-dial-id="${dialId}"]`)
          const before = await dial.getAttribute('aria-valuenow')
          await activate(page.getByRole('button', { name: `Turn the ${name} ${step === '1' ? 'right' : 'left'}`, exact: true }))
          await expect(dial).not.toHaveAttribute('aria-valuenow', before!)
          return
        }
        const head = page.locator(`[data-screw-id="${action}"]`)
        const removed = await page.getByTestId('screw-progress').textContent()
        // Tap only from a view that shows the head steadily, its own button on top: one on the edge
        // of sight can flicker as the targets refresh, so turn on and try again from the next view.
        for (let turn = 0; ; turn++) {
          expect(turn, `${action} never steadily in view`).toBeLessThan(16)
          await page.waitForTimeout(300)
          if (await onTop(head)) {
            await page.waitForTimeout(300)
            if (await onTop(head) && await (isMobile ? head.tap({ timeout: 2_000 }) : head.click({ timeout: 2_000 })).then(() => true, () => false)) break
          }
          await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
        }
        await expect(page.getByTestId('screw-progress')).not.toHaveText(removed!)
        await expect.poll(async () => await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled() || await page.getByRole('alertdialog').isVisible() || await page.getByRole('heading', { name: 'All plates free!' }).isVisible()).toBe(true)
      }
      /** No turn of the view offers a head that a shut part still covers. */
      const shut = async (id: string): Promise<void> => {
        for (let turn = 0; turn < 8; turn++) {
          await expect(page.locator(`[data-screw-id="${id}"]`)).toHaveCount(0)
          await activate(page.getByRole('button', { name: 'Rotate right', exact: true }))
          await page.waitForTimeout(250)
        }
      }
      await page.goto('/plate-escape')
      await expect(page.getByTestId('level-tile-22')).toHaveAttribute('data-unlocked', 'false')
      await activate(page.getByRole('button', { name: 'Level 21, 0 stars', exact: true }))
      for (const trace of CLOCKWORK_TRACES) {
        const level = getLevel(trace.level)
        if (level.introduction) await activate(page.getByRole('button', { name: "Let's play", exact: true }))
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(page.getByTestId('screw-progress')).toHaveText('0 / 15 screws')
        await page.screenshot({ path: testInfo.outputPath(`level-${trace.level}.png`) })
        for (const action of trace.lose) await act(trace.level, action)
        await expect(page.getByRole('heading', { name: 'No room for that screw' })).toBeVisible()
        // Undo after a loss, then retry from the authored board.
        await activate(page.getByRole('button', { name: 'Undo last move', exact: true }))
        await expect(page.getByRole('alertdialog')).toHaveCount(0)
        await act(trace.level, trace.lose.at(-1)!)
        await activate(page.getByRole('button', { name: 'Retry level', exact: true }))
        await expect(page.getByTestId('screw-progress')).toHaveText('0 / 15 screws')
        // Each weight first: its part was shut over a head; dropped, the cord opens it; undone, it shuts again.
        for (const driven of level.plates.filter((plate) => plate.drivenBy)) {
          const weightScrew = level.screws.find((screw) => screw.plate === driven.drivenBy)!.id
          const under = level.screws.find((screw) => screw.blockedBy?.includes(driven.id))!.id
          await shut(under)
          await act(trace.level, weightScrew)
          await find(page.locator(`[data-screw-id="${under}"]`))
          await page.screenshot({ path: testInfo.outputPath(`${trace.level}-${driven.id}-open.png`) })
          await activate(page.getByRole('button', { name: 'Undo', exact: true }))
          await expect(page.getByTestId('screw-progress')).toHaveText('0 / 15 screws')
          await shut(under)
        }
        if (level.plates.some((plate) => plate.dial)) {
          // The collar will not turn while its stop pin is in, and says why.
          const dial = level.plates.find((plate) => plate.dial)!
          await activate(page.getByRole('button', { name: `Turn the ${dial.name.toLowerCase()} right`, exact: true }))
          await expect(page.getByTestId('plate-hint')).toHaveText(`The stop pin holds the ${dial.name.toLowerCase()}. Take it out first.`)
        }
        for (const action of trace.win) await act(trace.level, action)
        await expect(page.getByRole('heading', { name: 'All plates free!' })).toBeVisible()
        await expect(page.getByText('5 / 5 collected', { exact: true })).toBeVisible()
        if (trace.level < 25) await activate(page.getByRole('button', { name: 'Next level', exact: true }))
        else await expect(page.getByRole('button', { name: 'Next level', exact: true })).toHaveCount(0)
      }
      await page.reload()
      for (const id of [21, 22, 23, 24, 25]) await expect(page.getByRole('button', { name: `Level ${id}, 3 stars`, exact: true })).toBeVisible()
      expect(errors).toEqual([])
    })
  })
})
