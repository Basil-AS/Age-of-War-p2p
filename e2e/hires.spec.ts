import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1920, height: 1080 } });
test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

test('1080p: game renders sharp, no errors', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('/original.html');
  await page.waitForFunction(
    () => (window as unknown as { __aow?: { app: { phase: string } } }).__aow?.app.phase === 'title',
    null,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/shots/hd-title.png' });
  await page.evaluate(() => (window as unknown as { __aow: { app: { phase: string } } }).__aow.app.phase);
  const click = async (x: number, y: number) => {
    const p = await page.evaluate(
      ([a, b]) =>
        (window as unknown as { __aow: { toPage(x: number, y: number): { x: number; y: number } } }).__aow.toPage(
          a as number,
          b as number,
        ),
      [x, y],
    );
    await page.mouse.click(p.x, p.y);
  };
  await click(325, 218);
  await page.waitForTimeout(400);
  await click(325, 172);
  await page.waitForFunction(
    () => (window as unknown as { __aow: { app: { phase: string } } }).__aow.app.phase === 'game',
  );
  await click(449, 40);
  await page.waitForTimeout(300);
  await click(458, 40);
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
