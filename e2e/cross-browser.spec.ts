import { expect, test } from '@playwright/test';
import { startSolo } from './util';

// Runs on Firefox and WebKit in CI (CROSS_BROWSER=1): the pages must boot, load every JSON/atlas
// (the "JSON.parse: unexpected character" class of bugs) and start a game without page errors.
test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

test('launcher lists both versions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a.card')).toHaveCount(2);
});

test('original: boots, loads assets, starts a solo game', async ({ page }) => {
  const errs: string[] = [];
  const bad: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('response', (r) => {
    if (r.url().includes('/orig/') && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
  });
  await startSolo(page);
  await page.waitForTimeout(2000);
  expect(bad).toEqual([]);
  expect(errs).toEqual([]);
});

test('lite: boots and starts a solo game', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('/lite.html');
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

test('versions can be switched back and forth', async ({ page }) => {
  await page.goto('/lite.html');
  await page.getByTestId('switch-version').click({ timeout: 60_000 });
  await page.waitForURL(/original\.html/);
});
