import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, type Page, type TestInfo } from '@playwright/test'

export const SCREENSHOT_DIR = path.join('test-results', 'mandarin')

export async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const screenshot = await page.screenshot({ fullPage: false })
  const filename = `${name}-${testInfo.project.name}.png`
  await testInfo.attach(filename, { body: screenshot, contentType: 'image/png' })
  await mkdir(SCREENSHOT_DIR, { recursive: true })
  await writeFile(path.join(SCREENSHOT_DIR, filename), screenshot)
}

/** Opens the preview in a given scenario with a clean partition and optional stored settings/progress. */
export async function openPreview(page: Page, scenario: string | null, options: { settings?: Record<string, unknown>; progress?: Record<string, unknown> } = {}): Promise<void> {
  const url = scenario ? `/mandarin/preview?scenario=${scenario}` : '/mandarin/preview'
  await page.goto(url)
  // Wait for the app's own initial write before seeding, otherwise the async
  // bootstrap of the first load can overwrite the seeded partition. The write
  // happens in an effect after first paint, so re-seed until it sticks.
  await expect(page.getByTestId('preview-banner').first()).toBeVisible()
  const seed = { settings: options.settings ?? {}, progress: options.progress ?? null }
  await expect(async () => {
    const stable = await page.evaluate(async ({ settings, progress }) => {
      const progressJson = progress ? JSON.stringify({ version: 1, courseId: 'mandarin-foundations', contentVersion: '1.0.1', ...progress }) : null
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('mandarin.preview.')) window.localStorage.removeItem(key)
      }
      window.localStorage.setItem('mandarin.preview.settings.v1', JSON.stringify({ twoDMode: false, lowMotion: true, ...settings }))
      if (progressJson) window.localStorage.setItem('mandarin.preview.progress.v1', progressJson)
      await new Promise((resolve) => setTimeout(resolve, 150))
      return window.localStorage.getItem('mandarin.preview.progress.v1') === progressJson
    }, seed)
    expect(stable).toBe(true)
  }).toPass({ timeout: 10_000 })
  await page.goto(url)
  await expect(page.getByTestId('preview-banner').first()).toBeVisible()
}

export async function skipOnboarding(page: Page): Promise<void> {
  await expect(page.getByTestId('onboarding-screen')).toBeVisible()
  await page.getByTestId('onboarding-skip').click()
  await expect(page.getByTestId('teaching-screen')).toBeVisible()
}

export const ONBOARDED = { onboardingComplete: true, currentNodeId: 's1n1' }
