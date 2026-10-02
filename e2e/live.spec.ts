import { expect, test } from '@playwright/test';
import { startSolo } from './util';

// Post-deploy smoke test against the REAL GitHub Pages site (LIVE_URL), run from GitHub's network after each deploy.
test.skip(!process.env.LIVE_URL, 'LIVE_URL not set');
test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

test('live: launcher, both versions and every asset respond', async ({ page }) => {
  const bad: string[] = [];
  const errs: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
  });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('./');
  await expect(page.locator('a.card')).toHaveCount(2);
  await page.locator('#lite').click();
  await page.waitForURL(/lite\.html/);
  await page.getByTestId('switch-version').click({ timeout: 60_000 });
  await page.waitForURL(/original\.html/);
  expect(bad).toEqual([]);
  expect(errs).toEqual([]);
});

test('live: the original starts a solo game with the hi-res art, no failed requests', async ({ page }) => {
  const bad: string[] = [];
  const errs: string[] = [];
  const arts: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
    if (/\/orig\/(hd|sd)\/.*\.webp/.test(r.url())) arts.push(r.url());
  });
  page.on('pageerror', (e) => errs.push(String(e)));
  await startSolo(page, 'original.html');
  await page.waitForTimeout(2500);
  expect(arts.length).toBeGreaterThan(2);
  expect(bad).toEqual([]);
  expect(errs).toEqual([]);
});
