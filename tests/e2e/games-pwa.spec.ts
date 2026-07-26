import { type BrowserContext, expect, type Page, test } from '@playwright/test'

const ALL_GAMES = [
  ['/games/math-horde', '#math-horde-root'],
  ['/games/parking-pickup', '#cars-game-root'],
  ['/games/marble-sort', '#marble-sort-root'],
  ['/games/block-blaster', '#block-blaster-root'],
  ['/games/hover', '#hover-game-root'],
  ['/games/chicks-challenge', '#chicks-game-root'],
  ['/games/tower-throwback', '#tower-game-root'],
  ['/games/2048', '#game-2048-root'],
] as const

const SHARED_STORE_GAMES = ALL_GAMES.filter(([route]) => route !== '/games/tower-throwback')

test.describe('BWH Games PWA offline reload', () => {
  test('registers one installable app and reloads every visited game while signed out', async ({ context, page }) => {
    await seedPwa(page)

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
    const manifest = await page.request.get('/manifest.webmanifest')
    expect(manifest.ok()).toBe(true)
    await expectOfflineReloads(context, page, ALL_GAMES)
  })

  test('reloads shared-store games while signed in and keeps account-backed state playable', async ({ context, page }) => {
    await signInLocally(page)
    await seedPwa(page)

    await expectOfflineReloads(context, page, SHARED_STORE_GAMES)
  })

  test('stores only sanitized shells and removes game caches before logout', async ({ page }) => {
    await signInLocally(page)
    await seedPwa(page)
    await page.goto('/games/2048')
    await expect(page.locator('#game-2048-root > *').first()).toBeAttached()
    await waitForCachedShell(page, '/games/2048')

    const initialData = await page.locator('#app-initial-data').textContent()
    const currentUser = initialData
      ? (JSON.parse(initialData) as { currentUser?: { name?: string, email?: string } }).currentUser
      : null
    const cachedShells = await readGameCacheText(page)
    expect(cachedShells).not.toContain(currentUser?.name)
    expect(cachedShells).not.toContain(currentUser?.email)

    await page.getByRole('button', { name: /Test User|My Account/ }).click()
    await Promise.all([
      page.waitForURL('/'),
      page.getByRole('menuitem', { name: 'Sign out' }).click(),
    ])

    const remainingGameCaches = await page.evaluate(async () => (
      (await caches.keys()).filter((key) => key.startsWith('bwh-games-'))
    ))
    expect(remainingGameCaches).toEqual([])
  })
})

async function seedPwa(page: Page): Promise<void> {
  await page.goto('/games')
  await expect(page.locator('#game-select-root > *').first()).toBeAttached()
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) {
      return false
    }

    const registration = await navigator.serviceWorker.ready

    return registration.active?.state === 'activated' && navigator.serviceWorker.controller !== null
  })
  await waitForCachedShell(page, '/games')
}

async function expectOfflineReloads(
  context: BrowserContext,
  page: Page,
  games: ReadonlyArray<readonly [string, string]>,
): Promise<void> {
  for (const [route, root] of games) {
    await page.goto(route)
    await expect(page.locator(`${root} > *`).first()).toBeAttached()
    await waitForCachedShell(page, route)

    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator(`${root} > *`).first()).toBeAttached()
    await expect(page.getByText('Saved game data could not be loaded.')).toHaveCount(0)
    await context.setOffline(false)
  }
}

async function waitForCachedShell(page: Page, route: string): Promise<void> {
  await page.waitForFunction(async (expectedRoute) => {
    const shellCacheName = (await caches.keys()).find((key) => key.startsWith('bwh-games-shells-'))
    if (!shellCacheName) {
      return false
    }

    return Boolean(await (await caches.open(shellCacheName)).match(expectedRoute))
  }, route)
}

async function signInLocally(page: Page): Promise<void> {
  await page.goto('/login')
  await Promise.all([
    page.waitForURL('/'),
    page.getByRole('button', { name: 'Dev Login as UID=1' }).click(),
  ])
}

async function readGameCacheText(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const chunks: string[] = []
    for (const cacheName of await caches.keys()) {
      if (!cacheName.startsWith('bwh-games-')) {
        continue
      }
      const cache = await caches.open(cacheName)
      for (const request of await cache.keys()) {
        const response = await cache.match(request)
        if (response?.headers.get('Content-Type')?.includes('text/html')) {
          chunks.push(await response.text())
        }
      }
    }

    return chunks.join('\n')
  })
}
