import { expect, test } from '@playwright/test';
import { stageClick, startSolo } from './util';

test.use({ viewport: { width: 1920, height: 1080 } });
test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

test('1080p: game renders sharp, no errors', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await startSolo(page);
  await page.screenshot({ path: '/tmp/shots/hd-title.png' });
  await stageClick(page, 449, 40);
  await page.waitForTimeout(300);
  await stageClick(page, 458, 40);
  await page.waitForTimeout(9000);
  await page.screenshot({ path: '/tmp/shots/hd-game.png' });
  expect(errs).toEqual([]);
});

test('sd tier loads (phones / low memory)', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('/original.html?q=sd');
  await page.waitForFunction(
    () => (window as unknown as { __aow?: { app: { phase: string } } }).__aow?.app.phase === 'title',
    null,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(500);
  expect(errs).toEqual([]);
});
