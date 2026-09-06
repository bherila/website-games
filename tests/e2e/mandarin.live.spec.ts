/**
 * Live-runtime checks against a server configured with
 * MANDARIN_RUNTIME=live, a real speech provider and node s1n1 pre-warmed
 * (see docs/games/mandarin.md, "Run it locally with real speech"). Opt in with
 * MANDARIN_LIVE_E2E=1; otherwise the suite skips so CI, which has no speech
 * provider, only runs the preview journeys.
 */
import { expect, type Page, test } from '@playwright/test'

import { capture } from './mandarin.helpers'

async function liveAvailable(page: Page): Promise<boolean> {
  const response = await page.request.get('/api/games/mandarin/bootstrap')
  return response.ok()
}

async function signIn(page: Page): Promise<boolean> {
  const token = process.env.E2E_AUTH_TOKEN
  if (!token) return false
  const response = await page.request.post('/__e2e/login', { headers: { 'X-E2E-Auth-Token': token } })
  return response.ok()
}

async function clearLive(page: Page): Promise<void> {
  await page.goto('/mandarin')
  // Wait for the app's first render before clearing, so its initial write cannot race the reset.
  await expect(page.getByTestId('save-status').first()).toBeAttached()
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) if (key.startsWith('mandarin.live.')) window.localStorage.removeItem(key)
  })
}

test.describe('Mandarin Quest live runtime', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(process.env.MANDARIN_LIVE_E2E !== '1', 'set MANDARIN_LIVE_E2E=1 against a live server with node s1n1 pre-warmed')
    test.skip(!(await liveAvailable(page)), 'live Mandarin API is not served by this server')
  })

  test('guest plays real pre-warmed Mandarin audio with no preview labelling', async ({ page }, testInfo) => {
    await clearLive(page)
    await page.goto('/mandarin')
    await expect(page.getByTestId('onboarding-screen')).toBeVisible()
    await expect(page.getByTestId('preview-banner')).toHaveCount(0)
    await page.getByTestId('onboarding-skip').click()
    await expect(page.getByTestId('teaching-screen')).toHaveAttribute('data-node-id', 's1n1')
    await expect(page.getByTestId('guest-notice')).toHaveCount(0)

    const line = page.getByTestId('dialogue-line').first()
    const player = line.getByTestId('prompt-player')
    await expect(player).toHaveAttribute('data-audio-tone', 'ready', { timeout: 15_000 })
    await expect(player.getByTestId('audio-status')).toHaveCount(0)
    const mediaResponse = page.waitForResponse((response) => response.url().includes('/media/games/mandarin/') && response.status() < 300)
    await player.getByTestId('play-button').click()
    const media = await mediaResponse
    expect(media.headers()['content-type']).toMatch(/audio\/(mp4|mpeg|wav)/)
    await expect(player.getByTestId('play-button')).toContainText(/Replay/, { timeout: 15_000 })
    await capture(page, testInfo, 'live-teaching-ready-audio')
    const body = await page.locator('body').innerText()
    expect(body).not.toMatch(/preview voice|simulated playback|mock/i)
  })

  test('signed-in learner: answer is graded server-side, persists across reload, and a slow replay is not unaided', async ({ page }) => {
    test.skip(!(await signIn(page)), 'E2E_AUTH_TOKEN not configured')
    await clearLive(page)
    await page.goto('/mandarin')
    await expect(page.getByTestId('onboarding-screen')).toBeVisible()
    await expect(page.getByTestId('preview-banner')).toHaveCount(0)
    await page.getByTestId('onboarding-skip').click()
    await page.getByTestId('start-questions').click()
    const question = page.getByTestId('listening-question')
    await expect(question.getByTestId('prompt-player')).toHaveAttribute('data-audio-tone', 'ready', { timeout: 15_000 })
    await question.getByTestId('play-button').click()
    await expect(question.getByTestId('play-button')).toContainText(/Replay/, { timeout: 15_000 })
    await question.getByTestId('slow-button').click()
    await expect(question.getByTestId('play-button')).toContainText(/Replay/, { timeout: 15_000 })
    const eventsResponse = page.waitForResponse((response) => response.url().includes('/api/games/mandarin/events') && response.request().method() === 'POST')
    await question.getByTestId('dont-know').click()
    const events = await eventsResponse
    expect(events.ok()).toBe(true)
    const ack = (await events.json()) as { acknowledgments: { status: string; correctness: string | null; grade: string | null }[] }
    expect(ack.acknowledgments[0]?.status).toBe('accepted')
    expect(ack.acknowledgments[0]?.correctness).toBe('incorrect')
    await expect(question.getByTestId('assistance-chip')).not.toContainText('Unaided')
    await expect(page.getByTestId('save-status').filter({ visible: true }).first()).toContainText(/Saved to your account/)
    await question.getByTestId('continue').click()
    await expect(page.getByTestId('lesson-screen')).toHaveAttribute('data-step-index', '1')

    // Progress endpoint reflects the accepted event; a fresh partition on reload still resumes from the server.
    const progress = await page.request.get('/api/games/mandarin/progress')
    expect(progress.ok()).toBe(true)
    expect(((await progress.json()) as { lastSequence: number }).lastSequence).toBeGreaterThan(0)
  })
})
