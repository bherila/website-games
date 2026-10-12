import { expect, test } from '@playwright/test'

import course from '../../resources/data/mandarin/foundations.v1.json' with { type: 'json' }
import recalls from '../../resources/data/mandarin/recall-exercises.v2.json' with { type: 'json' }
import { capture } from './mandarin.helpers'

// Network fixtures must remain visible to Playwright after reload; a service
// worker would issue its own requests outside page.route interception.
test.use({ serviceWorkers: 'block' })

// A short silent WAV exercises actual media completion, not Mandarin pronunciation.
function fixtureWav(): Buffer {
  const samples = 2400
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40)
  return wav
}

test('spoken recall hides the answer, completes model playback, and records a self-check', async ({ page }, testInfo) => {
  const events: Record<string, unknown>[] = []
  await page.route('**/api/games/mandarin/bootstrap', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    await route.fulfill({ json: { ...body, course: { ...course, schemaVersion: 2, contentVersion: '1.2.0', recallExercises: recalls },
      account: { signedIn: true, accountPartitionId: 'recall-e2e' }, capabilities: { ...body.capabilities, canSaveToAccount: true, practiceEventSchemas: [1, 2] } } })
  })
  await page.route('**/api/games/mandarin/progress', (route) => route.fulfill({ json: {
    courseId: course.courseId, contentVersion: '1.2.0', lastSequence: 0, completedNodeIds: ['s1n1', 's1n2'], completedSceneIds: ['s1'], currentNodeId: 's2n1',
    dueTargetIds: [], checkpointExposedIds: [], schedulerVersion: 'ts-fsrs-5.4.2+steps-none', schedulerConfigHash: 'fixture',
    listeningCards: { kind: 'graded-review-log', windowMinutes: 10, reviews: [] },
  } }))
  await page.route('**/api/games/mandarin/audio/resolve', (route) => {
    const request = route.request().postDataJSON()
    return route.fulfill({ json: { courseId: course.courseId, contentVersion: '1.2.0', results: request.sources.map((source: unknown) => ({
      state: 'ready', source, assetId: 'fixture', url: '/__recall_fixture.wav', expiresAt: null, contentHash: 'fixture', contentType: 'audio/wav', durationMs: 300, provenance: 'synthesized_speech',
    })) } })
  })
  await page.route('**/__recall_fixture.wav', (route) => route.fulfill({ contentType: 'audio/wav', body: fixtureWav() }))
  await page.route('**/api/games/mandarin/events', (route) => {
    const batch = route.request().postDataJSON().events as Record<string, unknown>[]
    events.push(...batch)
    return route.fulfill({ json: { lastSequence: events.length, acknowledgments: batch.map((event) => ({
      clientEventId: event.clientEventId, status: 'accepted', reasonCode: null, correctness: null, grade: null, canonicalSequence: events.length, serverAcceptedAt: new Date().toISOString(),
    })) } })
  })
  await page.goto('/mandarin')
  await expect(page.getByTestId('review-button')).toBeVisible()
  await page.evaluate(() => {
    localStorage.setItem('mandarin.live.recall-e2e.progress.v1', JSON.stringify({ version: 1, courseId: 'mandarin-foundations', contentVersion: '1.2.0', onboardingComplete: true, currentNodeId: 's2n1', completedNodeIds: ['s1n1', 's1n2'], completedSceneIds: ['s1'] }))
    localStorage.setItem('mandarin.live.recall-e2e.settings.v1', JSON.stringify({ twoDMode: true, lowMotion: true }))
  })
  await page.reload()
  await page.getByTestId('review-button').click()
  const question = page.getByTestId('recall-question')
  await expect(question).toBeVisible()
  await expect(question).toContainText('He is my friend.')
  await expect(question).not.toContainText('他是我的朋友')
  await expect(page.getByTestId('play-button')).toHaveCount(0)
  await capture(page, testInfo, 'recall-before-reveal')
  await question.getByRole('button', { name: 'Show answer' }).click()
  await expect(page.getByTestId('recall-answer')).toContainText('他是我的朋友')
  const rating = question.getByRole('button', { name: 'Said it', exact: true })
  const play = question.getByTestId('play-button')
  await expect(play).toBeEnabled()
  await play.click()
  await expect(play).toHaveAttribute('aria-label', 'Replay the Mandarin prompt')
  await expect(rating).toBeEnabled()
  await rating.click()
  await expect(question).toContainText('Attempt recorded')
  await expect.poll(() => events.filter((event) => event.responseAction === 'self_check').length).toBe(1)
  const event = events.find((entry) => entry.responseAction === 'self_check')!
  expect(event).toMatchObject({ schemaVersion: 2, attemptIndex: 0, selfRating: 'said_it', sessionKind: 'scheduled', audioEvidence: { status: 'completed' } })
  await capture(page, testInfo, 'recall-after-rating')
  await question.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByTestId('review-complete')).toBeVisible()
})
