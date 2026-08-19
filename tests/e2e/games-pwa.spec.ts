import { type BrowserContext, expect, type Page, test } from '@playwright/test'

const ALL_GAMES = [
  ['/math-horde', '#math-horde-root'],
  ['/parking-pickup', '#cars-game-root'],
  ['/marble-sort', '#marble-sort-root'],
  ['/block-blaster', '#block-blaster-root'],
  ['/hover', '#hover-game-root'],
  ['/chicks-challenge', '#chicks-game-root'],
  ['/tower-throwback', '#tower-game-root'],
  ['/2048', '#game-2048-root'],
] as const

const SHARED_STORE_GAMES = ALL_GAMES.filter(([route]) => route !== '/tower-throwback')

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
    await page.goto('/2048')
    await expect(page.locator('#game-2048-root > *').first()).toBeAttached()
    await waitForCachedShell(page, '/2048')

    const initialData = await page.locator('#app-initial-data').textContent()
    const currentUser = initialData
      ? (JSON.parse(initialData) as { currentUser?: { name?: string, email?: string } }).currentUser
      : null
    const cachedShells = await readGameCacheText(page)
    expect(cachedShells).not.toContain(currentUser?.name)
    expect(cachedShells).not.toContain(currentUser?.email)

    await page.goto('/')
    await page.evaluate(() => {
      const nativeSubmit = HTMLFormElement.prototype.submit
      HTMLFormElement.prototype.submit = function (this: HTMLFormElement): void {
        void caches.keys()
          .then((keys) => sessionStorage.setItem(
            'e2e-game-caches-at-logout',
            JSON.stringify(keys.filter((key) => key.startsWith('bwh-games-'))),
          ))
          .finally(() => nativeSubmit.call(this))
      }
    })

    const logoutResponse = page.waitForResponse((response) => (
      new URL(response.url()).pathname === '/logout'
      && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: 'Sign out' }).click()
    expect((await logoutResponse).status()).toBe(302)
    await expect(page.getByRole('link', { name: 'Sign in to sync progress' })).toBeVisible()
    const gameCachesAtLogout = await page.evaluate(() => JSON.parse(
      sessionStorage.getItem('e2e-game-caches-at-logout') ?? 'null',
    ) as string[] | null)
    expect(gameCachesAtLogout).toEqual([])
  })
})

async function seedPwa(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('#game-select-root > *').first()).toBeAttached()
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) {
      return false
    }

    const registration = await navigator.serviceWorker.ready

    return registration.active?.state === 'activated' && navigator.serviceWorker.controller !== null
  })
  await waitForCachedShell(page, '/')
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
  const authToken = process.env.E2E_AUTH_TOKEN
  expect(authToken, 'E2E_AUTH_TOKEN must be configured for signed-in PWA checks').toBeTruthy()

  const response = await page.request.post('/__e2e/login', {
    headers: { 'X-E2E-Auth-Token': authToken ?? '' },
  })
  expect(response.ok()).toBe(true)
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
