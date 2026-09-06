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
  const url = scenario ? `/mandarin?scenario=${scenario}` : '/mandarin'
  await page.goto(url)
  // Wait for the app's own initial write before seeding, otherwise the async
  // bootstrap of the first load can overwrite the seeded partition.
  await expect(page.getByTestId('preview-banner').first()).toBeVisible()
  await page.evaluate(({ settings, progress }) => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('mandarin.preview.')) window.localStorage.removeItem(key)
    }
    window.localStorage.setItem('mandarin.preview.settings.v1', JSON.stringify({ twoDMode: false, lowMotion: true, ...settings }))
    if (progress) {
      window.localStorage.setItem('mandarin.preview.progress.v1', JSON.stringify({ version: 1, courseId: 'mandarin-foundations', contentVersion: '1.0.0', ...progress }))
    }
  }, { settings: options.settings ?? {}, progress: options.progress ?? null })
  await page.goto(url)
  await expect(page.getByTestId('preview-banner').first()).toBeVisible()
}

export async function skipOnboarding(page: Page): Promise<void> {
  await expect(page.getByTestId('onboarding-screen')).toBeVisible()
  await page.getByTestId('onboarding-skip').click()
  await expect(page.getByTestId('teaching-screen')).toBeVisible()
}

export const ONBOARDED = { onboardingComplete: true, currentNodeId: 's1n1' }
