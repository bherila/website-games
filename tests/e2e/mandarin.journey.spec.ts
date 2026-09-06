import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { ONBOARDED, openPreview, skipOnboarding } from './mandarin.helpers'

interface CourseJson {
  exercises: { id: string; correctOptionId: string }[]
  constructionExercises: { id: string; correctTileIds: string[] }[]
  utterances: { id: string; zh: string; usage: string }[]
}
const course = JSON.parse(readFileSync(path.join(process.cwd(), 'resources/data/mandarin/foundations.v1.json'), 'utf8')) as CourseJson
const reservedZh = course.utterances.filter((u) => u.usage === 'checkpoint_reserved').map((u) => u.zh)

test.describe('Mandarin Quest preview journey', () => {
  test('fresh learner: onboarding, teaching, a scored-honestly question, preview-only storage', async ({ page }) => {
    await openPreview(page, null)
    await expect(page.getByTestId('preview-banner').first()).toContainText('Cloud persistence and provider audio are not connected')
    await skipOnboarding(page)
    await expect(page.getByTestId('teaching-screen')).toHaveAttribute('data-node-id', 's1n1')
    await expect(page.getByTestId('target-card')).toHaveCount(4)
    await expect(page.getByTestId('diorama')).toHaveAttribute('data-diorama-status', /ready|fallback|loading|poster/)

    await page.getByTestId('start-questions').click()
    const question = page.getByTestId('listening-question')
    await expect(question).toBeVisible()
    await expect(question.getByTestId('transcript')).toHaveCount(0)
    await expect(question.getByTestId('answer-option')).toHaveCount(3)
    for (const option of await question.getByTestId('answer-option').all()) {
      expect(await option.getAttribute('aria-label')).toBeNull()
    }
    const play = question.getByTestId('play-button')
    await expect(play).toBeEnabled()
    await play.click()
    await expect(question.getByTestId('audio-status')).toContainText(/Preview voice|Simulated playback/)
    await expect(play).toContainText(/Replay|Playing/)

    await question.getByTestId('dont-know').click()
    await expect(question.getByTestId('feedback')).toContainText('No problem')
    await expect(question.getByTestId('transcript')).toBeVisible()
    await question.getByTestId('continue').click()
    await expect(page.getByTestId('lesson-screen')).toHaveAttribute('data-step-index', '1')

    const keys = await page.evaluate(() => Object.keys(window.localStorage).filter((key) => /mandarin|game-data|tower|save/i.test(key)))
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) expect(key.startsWith('mandarin.preview.')).toBe(true)
    const body = await page.locator('body').innerText()
    expect(body).not.toMatch(/mastered|certified/i)
    for (const zh of reservedZh) expect(body).not.toContain(zh)
  })

  test('hint persists across retry and the retry is labelled assisted', async ({ page }) => {
    await openPreview(page, null, { progress: ONBOARDED })
    await page.getByTestId('continue-button').click()
    await page.getByTestId('start-questions').click()
    const question = page.getByTestId('listening-question')
    const exerciseId = await question.getAttribute('data-exercise-id')
    const exercise = course.exercises.find((item) => item.id === exerciseId)!
    await question.getByTestId('help-toggle').click()
    await question.getByRole('button', { name: 'Show pinyin' }).click()
    await expect(question.getByTestId('pinyin-help')).toBeVisible()
    const wrong = question.locator(`[data-testid="answer-option"]:not([data-option-id="${exercise.correctOptionId}"])`).first()
    await wrong.click()
    await question.getByTestId('check-answer').click()
    await expect(question.getByTestId('feedback')).toContainText('Not this time')
    await question.getByTestId('retry-question').click()
    await expect(question.getByTestId('pinyin-help')).toBeVisible()
    await question.locator(`[data-option-id="${exercise.correctOptionId}"]`).click()
    await question.getByTestId('check-answer').click()
    await expect(question.getByTestId('feedback')).toContainText('practice, not a fresh attempt')
    await expect(question.getByTestId('assistance-chip')).not.toContainText('Unaided')
  })

  test('sentence construction: tap-to-place with undo and reset', async ({ page }) => {
    await openPreview(page, null, { progress: { ...ONBOARDED, completedNodeIds: ['s1n1'], introducedNodeIds: ['s1n1', 's1n2'], currentNodeId: 's1n2' } })
    await page.getByTestId('node-button').nth(1).click()
    await expect(page.getByTestId('lesson-screen')).toHaveAttribute('data-node-id', 's1n2')
    for (let i = 0; i < 5; i += 1) {
      await page.getByTestId('dont-know').click()
      await page.getByTestId('continue').click()
    }
    const construction = page.getByTestId('construction')
    await expect(construction).toBeVisible()
    const exercise = course.constructionExercises.find((item) => item.id === 'g01')!
    const [a, b, c] = exercise.correctTileIds
    await construction.locator(`[data-tile-id="${b}"]`).click()
    await construction.getByRole('button', { name: 'Undo' }).click()
    await expect(construction.getByTestId('construction-answer')).toContainText('Your sentence appears here')
    for (const id of [a, b, c]) await construction.locator(`[data-tile-id="${id}"]`).click()
    await construction.getByTestId('construction-check').click()
    await expect(construction.getByTestId('construction-feedback')).toContainText('That’s the sentence')
    await construction.getByTestId('continue').click()
    await expect(page.getByTestId('scene-complete-screen')).toHaveAttribute('data-scene-id', 's1')
    const body = await page.locator('body').innerText()
    expect(body).not.toMatch(/master/i)
  })

  test('scenario selector drives the honest audio states', async ({ page }) => {
    const cases: { scenario: string; expect: RegExp }[] = [
      { scenario: 'queuedAudio', expect: /Preparing audio/ },
      { scenario: 'generatingAudio', expect: /Preparing audio/ },
      { scenario: 'providerUnavailable', expect: /not configured/ },
      { scenario: 'retryableError', expect: /did not respond/ },
      { scenario: 'offline', expect: /Could not reach|Failed to fetch/ },
      { scenario: 'guest', expect: /Sign in to generate/ },
      { scenario: 'noDeviceVoice', expect: /Simulated playback/ },
    ]
    for (const item of cases) {
      await openPreview(page, item.scenario, { progress: ONBOARDED })
      await page.getByTestId('continue-button').click()
      await page.getByTestId('start-questions').click()
      const player = page.getByTestId('listening-question').getByTestId('prompt-player')
      await expect(player.getByTestId('audio-status')).toContainText(item.expect, { timeout: 15_000 })
      if (item.scenario === 'retryableError') {
        await player.getByTestId('retry-audio').click()
        await expect(player.getByTestId('audio-status')).toContainText(/Retry succeeded|Preview voice|Simulated/)
      }
      if (item.scenario === 'queuedAudio') {
        await expect(player.getByTestId('audio-status')).toContainText(/Still preparing/, { timeout: 30_000 })
        await expect(player.getByTestId('retry-audio')).toBeVisible()
      }
    }
  })

  test('save-state chips for guest, saving, sign-in-required and offline scenarios', async ({ page }) => {
    for (const [scenario, text] of [['guest', 'Guest'], ['saving', 'mock account'], ['signInRequired', 'Sign-in required'], ['offline', 'Offline']] as const) {
      await openPreview(page, scenario, { progress: ONBOARDED })
      const chip = page.getByTestId('save-status').filter({ visible: true }).first()
      await expect(chip).toContainText(new RegExp(text, 'i'))
      await expect(chip).not.toContainText(/saved to your account/i)
    }
  })

  test('returning learner: backlogged review, extra practice distinct, checkpoint locked', async ({ page }) => {
    await openPreview(page, 'returning')
    await expect(page.getByTestId('review-button')).toContainText('12 due')
    await expect(page.getByTestId('listening-check-button')).toBeDisabled()
    await page.getByTestId('review-button').click()
    await expect(page.getByTestId('review-screen')).toHaveAttribute('data-review-state', 'backlogged')
    await expect(page.getByTestId('review-backlog')).toContainText('2 more due')
    await page.getByLabel('Home').click()
    await page.getByTestId('practice-button').click()
    await expect(page.getByTestId('review-screen')).toHaveAttribute('data-review-kind', 'extra')
    await expect(page.getByTestId('review-screen')).toContainText('does not change your review plan')
  })

  test('settings: 2D fallback, reset with confirmation, no microphone option', async ({ page }) => {
    await openPreview(page, null, { progress: ONBOARDED })
    await page.getByLabel('Settings').click()
    const settings = page.getByTestId('settings-screen')
    await expect(settings).toContainText('There is no microphone option')
    await expect(settings.getByRole('checkbox', { name: /microphone|record/i })).toHaveCount(0)
    await expect(settings).toContainText('mandarin.preview.')
    await page.getByLabel('Use 2D scenery').check()
    await page.getByRole('button', { name: 'Back to journey' }).click()
    await expect(page.getByTestId('diorama')).toHaveAttribute('data-diorama-status', 'poster')
    await page.getByLabel('Settings').click()
    await page.getByTestId('reset-preview').click()
    await expect(page.getByTestId('reset-confirm')).toBeVisible()
    await page.getByTestId('reset-confirm-button').click()
    await expect(page.getByTestId('onboarding-screen')).toBeVisible()
  })

  test('keyboard: answer a question with Tab/Enter and reach 44px targets', async ({ page }) => {
    await openPreview(page, null, { progress: ONBOARDED })
    await page.getByTestId('continue-button').click()
    await page.getByTestId('start-questions').click()
    const option = page.getByTestId('answer-option').first()
    const box = await option.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    await option.focus()
    await page.keyboard.press('Enter')
    await expect(option).toHaveAttribute('aria-checked', 'true')
    await page.getByTestId('check-answer').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('feedback')).toBeVisible()
    const hasScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(hasScroll).toBe(false)
  })
})
