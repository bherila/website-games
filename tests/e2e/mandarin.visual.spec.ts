import { expect, test } from '@playwright/test'

import course from '../../resources/data/mandarin/foundations.v1.json' with { type: 'json' }
import { capture, ONBOARDED, openPreview } from './mandarin.helpers'

test.describe('Mandarin Quest visual harness', () => {
  test('captures onboarding and home', async ({ page }, testInfo) => {
    await openPreview(page, null)
    await expect(page.getByTestId('onboarding-screen')).toBeVisible()
    await capture(page, testInfo, 'onboarding')
    await page.getByTestId('onboarding-skip').click()
    await expect(page.getByTestId('teaching-screen')).toBeVisible()
    await page.waitForTimeout(1200)
    await capture(page, testInfo, 'teaching-s1n1')
    await page.getByLabel('Home').click()
    await expect(page.getByTestId('home-screen')).toBeVisible()
    await capture(page, testInfo, 'home-fresh')
  })

  test('captures listening question, help, and feedback', async ({ page }, testInfo) => {
    await openPreview(page, null, { progress: ONBOARDED })
    await page.getByTestId('continue-button').click()
    await page.getByTestId('start-questions').click()
    await expect(page.getByTestId('listening-question')).toBeVisible()
    await capture(page, testInfo, 'question-listening')
    await page.getByTestId('help-toggle').click()
    await capture(page, testInfo, 'question-help')
    await page.getByTestId('dont-know').click()
    await expect(page.getByTestId('feedback')).toBeVisible()
    await capture(page, testInfo, 'question-feedback')
  })

  test('captures the returning learner home, review, and each scene diorama', async ({ page }, testInfo) => {
    await openPreview(page, 'returning')
    await expect(page.getByTestId('home-screen')).toBeVisible()
    await capture(page, testInfo, 'home-returning')
    await page.getByTestId('review-button').click()
    await expect(page.getByTestId('review-screen')).toBeVisible()
    await capture(page, testInfo, 'review-backlogged')
    await page.getByLabel('Home').click()
    for (const [index, sceneId] of ['s1', 's2', 's3'].entries()) {
      await page.locator(`[data-scene-id="${sceneId}"] [data-testid="node-button"]`).first().click()
      await expect(page.getByTestId('teaching-screen')).toBeVisible()
      await page.waitForTimeout(1200)
      await capture(page, testInfo, `diorama-scene-${index + 1}`)
      await page.getByLabel('Home').click()
    }
  })

  test('captures scenes 4 and 5 plus the scene-complete beat', async ({ page }, testInfo) => {
    const allButLast = ['s1n1', 's1n2', 's2n1', 's2n2', 's3n1', 's3n2', 's4n1', 's4n2', 's5n1']
    await openPreview(page, null, { progress: { ...ONBOARDED, completedNodeIds: allButLast, introducedNodeIds: allButLast, completedSceneIds: ['s1', 's2', 's3', 's4'], currentNodeId: 's5n2' } })
    await page.locator('[data-scene-id="s4"] [data-testid="node-button"]').first().click()
    await page.waitForTimeout(1200)
    await capture(page, testInfo, 'diorama-scene-4')
    await page.getByLabel('Home').click()
    await page.getByTestId('continue-button').click()
    await expect(page.getByTestId('teaching-screen')).toHaveAttribute('data-node-id', 's5n2')
    await page.waitForTimeout(1200)
    await capture(page, testInfo, 'diorama-scene-5')
    await page.getByTestId('start-questions').click()
    for (let i = 0; i < 5; i += 1) {
      await page.getByTestId('dont-know').click()
      await page.getByTestId('continue').click()
    }
    const construction = page.getByTestId('construction')
    await expect(construction).toBeVisible()
    await capture(page, testInfo, 'construction')
    for (const id of ['g05-c1', 'g05-c2', 'g05-c3', 'g05-c4', 'g05-c5', 'g05-c6', 'g05-c7', 'g05-c8']) {
      const tile = construction.locator(`[data-tile-id="${id}"]`)
      if (await tile.count()) await tile.click()
    }
    await construction.getByTestId('construction-check').click()
    await construction.getByTestId('continue').click()
    await expect(page.getByTestId('scene-complete-screen')).toBeVisible()
    await page.waitForTimeout(1500)
    await capture(page, testInfo, 'scene-complete-reunion')
    await expect(page.getByTestId('open-listening-check')).toHaveCount(0)
    await page.getByTestId('next-scene').click()
    await expect(page.getByTestId('teaching-screen')).toHaveAttribute('data-node-id', 's6n1')
    // The reunion is now the midpoint. Only the expanded finale opens the check.
    await openPreview(page, null, { progress: { ...ONBOARDED,
      completedNodeIds: course.nodes.map((node) => node.id),
      introducedNodeIds: course.nodes.map((node) => node.id),
      completedSceneIds: course.scenes.map((scene) => scene.id), currentNodeId: 's10n2',
    } })
    await page.getByTestId('listening-check-button').click()
    await expect(page.getByTestId('listening-check-screen')).toBeVisible()
    await capture(page, testInfo, 'listening-check-intro')
  })

  test('captures the collapsed scenery, its expansion, and a construction diagnosis', async ({ page }, testInfo) => {
    // s1n2 is the first node with a construction exercise.
    await openPreview(page, null, { progress: { ...ONBOARDED, completedNodeIds: ['s1n1'], introducedNodeIds: ['s1n1'], currentNodeId: 's1n2' } })
    await page.getByTestId('continue-button').click()

    // The teaching stage shows the line that is playing.
    await expect(page.getByTestId('teaching-screen')).toBeVisible()
    await page.waitForTimeout(1200)
    await page.getByTestId('dialogue-line').first().getByTestId('play-button').click()
    await expect(page.getByTestId('dialogue-stage')).toBeVisible()
    await capture(page, testInfo, 'teaching-dialogue-stage')

    // Questions collapse the scenery so the whole question fits.
    await page.getByTestId('start-questions').click()
    await expect(page.getByTestId('listening-question')).toBeVisible()
    await capture(page, testInfo, 'question-scenery-collapsed')
    // The strip is a phone control: from `lg` the diorama is a side column and
    // never competed with the question for height in the first place.
    const narrow = (page.viewportSize()?.width ?? 0) < 1024
    if (narrow) {
      await page.getByTestId('scenery-toggle').click()
      await capture(page, testInfo, 'question-scenery-expanded')
      await page.getByTestId('scenery-toggle').click()
    } else {
      await expect(page.getByTestId('scenery-toggle')).toBeHidden()
    }

    // A wrong construction attempt: marked tray, a hint about the actual error.
    for (let i = 0; i < 8 && (await page.getByTestId('construction').count()) === 0; i += 1) {
      await page.getByTestId('dont-know').click()
      await page.getByTestId('continue').click()
    }
    const construction = page.getByTestId('construction')
    await expect(construction).toBeVisible()
    const wrong = await construction.locator('[data-tile-id]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-tile-id')!).reverse())
    for (const id of wrong) await construction.locator(`[data-tile-id="${id}"]`).click()
    await construction.getByTestId('construction-check').click()
    await expect(construction.getByTestId('construction-hint')).toBeVisible()
    await capture(page, testInfo, 'construction-diagnosis')
  })

  test('captures settings and the 2D fallback', async ({ page }, testInfo) => {
    await openPreview(page, null, { progress: ONBOARDED })
    await page.getByLabel('Settings').click()
    await expect(page.getByTestId('settings-screen')).toBeVisible()
    await capture(page, testInfo, 'settings')

    // Deliberately captured on both projects: WebKit reports no Element
    // Fullscreen API, exactly as iPhone Safari does, so this panel shows the
    // Add to Home Screen route there and a working toggle on Chromium.
    const fullscreenNote = page.getByTestId('fullscreen-note')
    await fullscreenNote.scrollIntoViewIfNeeded()
    await expect(fullscreenNote).toBeVisible()
    await capture(page, testInfo, 'settings-fullscreen')

    await page.getByLabel('Use 2D scenery').check()
    await page.getByRole('button', { name: 'Back to journey' }).click()
    await expect(page.getByTestId('diorama')).toHaveAttribute('data-diorama-status', 'poster')
    await capture(page, testInfo, 'home-2d-fallback')
  })
})
