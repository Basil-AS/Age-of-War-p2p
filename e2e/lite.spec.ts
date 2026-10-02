import { expect, test } from '@playwright/test';

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

test('launcher offers both versions; lite starts a solo game', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('/');
  await expect(page.locator('a.card')).toHaveCount(2);
  await page.locator('#lite').click();
  await page.waitForURL(/lite\.html/);
  await page
    .getByText(/AI|ИИ|бот|Bot/i)
    .first()
    .click({ timeout: 60_000 });
  await page.getByRole('button', { name: /▶/ }).click();
  await page.waitForFunction(() => (window as unknown as { __aow: { match: unknown } }).__aow.match !== null, null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(1500);
  expect(errs).toEqual([]);
});

test('switch between versions from both menus', async ({ page }) => {
  await page.goto('/lite.html');
  await page.getByTestId('switch-version').click({ timeout: 60_000 });
  await page.waitForURL(/original\.html/);
  await page.getByTestId('switch-version').click({ timeout: 90_000 });
  await page.waitForURL(/lite\.html/);
});
