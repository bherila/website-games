import { expect, test } from '@playwright/test'

import course from '../../resources/data/mandarin/foundations.v1.json' with { type: 'json' }
import { capture, ONBOARDED, openPreview } from './mandarin.helpers'

for (const sceneId of ['s6', 's8', 's10']) {
  test(`${sceneId}: story setup and independent Chinese reveal`, async ({ page }, testInfo) => {
    const scene = course.scenes.find((entry) => entry.id === sceneId)!
    const node = course.nodes.find((entry) => entry.id === scene.nodeIds[0])!
    const preceding = course.nodes.filter((entry) => entry.order < node.order).map((entry) => entry.id)
    await openPreview(page, null, { settings: { twoDMode: true }, progress: {
      ...ONBOARDED, currentNodeId: node.id, completedNodeIds: preceding, introducedNodeIds: preceding,
      completedSceneIds: course.scenes.filter((entry) => entry.order < scene.order).map((entry) => entry.id),
    } })
    await page.getByTestId('continue-button').click()
    const teaching = page.getByTestId('teaching-screen')
    await expect(teaching).toHaveAttribute('data-node-id', node.id)
    await expect(teaching).toContainText(node.storyBeat)
    const line = page.getByTestId('dialogue-line').first()
    await expect(line.getByTestId('dialogue-characters')).toHaveCount(0)
    await expect(line.getByTestId('dialogue-meaning')).toHaveCount(0)
    await line.getByRole('button', { name: 'Show Chinese' }).click()
    await expect(line.getByTestId('dialogue-characters')).toBeVisible()
    await expect(line.getByTestId('dialogue-meaning')).toHaveCount(0)
    await capture(page, testInfo, `story-${sceneId}-teaching`)
    await page.getByTestId('start-questions').click()
    await expect(page.getByTestId('listening-question')).toBeVisible()
    await expect(page.getByText(node.storyBeat, { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('character-practice')).toHaveCount(0)
  })
}
