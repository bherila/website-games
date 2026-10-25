import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

// The accessibility statement promises these pages are checked against WCAG 2.1 AA on every change.
const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function expectNoViolations(page: Page, path: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze()
  const summary = results.violations.map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)
  expect(summary, `${path} WCAG 2.1 AA violations`).toEqual([])
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`site pages meet WCAG 2.1 AA (${scheme})`, () => {
    test.use({ colorScheme: scheme })

    for (const path of ['/', '/login', '/privacy', '/accessibility']) {
      test(path, async ({ page }) => {
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        // One main landmark per page: components inside the layout must not add their own.
        await expect(page.getByRole('main')).toHaveCount(1)
        await expectNoViolations(page, path)
      })
    }

    test('/account', async ({ page }) => {
      const authToken = process.env.E2E_AUTH_TOKEN
      expect(authToken, 'E2E_AUTH_TOKEN must be configured for the signed-in check').toBeTruthy()
      expect((await page.request.post('/__e2e/login', { headers: { 'X-E2E-Auth-Token': authToken ?? '' } })).ok()).toBe(true)
      await page.goto('/account')
      await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible()
      await expectNoViolations(page, '/account')
    })
  })
}

test('a game page keeps a single main landmark around its playfield', async ({ page }) => {
  await page.goto('/plate-escape')
  await page.getByRole('button', { name: /Level 1/ }).click()
  await expect(page.getByRole('region', { name: 'Plate puzzle' })).toBeVisible()
  await expect(page.getByRole('main')).toHaveCount(1)
})

test('the privacy request form can be completed with a keyboard and reports errors on the field', async ({ page }) => {
  await page.goto('/privacy#request')
  const form = page.locator('#request')
  if (await form.getByRole('button', { name: 'Send request' }).count() === 0) {
    // Mail is not configured in this environment; the section must say how else to make requests.
    await expect(form.getByRole('link', { name: 'Account page' })).toBeVisible()
    return
  }
  await form.getByLabel('Your email address').fill('not-an-address')
  await form.getByRole('button', { name: 'Send request' }).press('Enter')
  const email = page.getByLabel('Your email address')
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator(`#${await email.getAttribute('aria-describedby')}`)).toBeVisible()
})
