import { expect, test } from '@playwright/test';

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

type Aow = {
  toPage(x: number, y: number): { x: number; y: number };
  match: { sim: { frame: number; player(s: number): { cash: number; tray: number[] }; units: unknown[] } } | null;
  app: { phase: string };
};
const aow = (page: import('@playwright/test').Page, js: string) => page.evaluate(js);

test('title → difficulty → solo game with the original UI', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(
    () => (window as unknown as { __aow?: { app: { phase: string } } }).__aow?.app.phase === 'title',
    null,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/shots/app-title.png' });
  const click = async (x: number, y: number) => {
    const p = (await page.evaluate(
      ([a, b]) => (window as unknown as { __aow: Aow }).__aow.toPage(a as number, b as number),
      [x, y],
    )) as { x: number; y: number };
    await page.mouse.click(p.x, p.y);
  };
  await click(325, 218); // "Play"
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/shots/app-diff.png' });
  await click(325, 172); // "Normal"
  await page.waitForFunction(
    () => (window as unknown as { __aow: { app: { phase: string } } }).__aow.app.phase === 'game',
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(800);
  // buy clubmen through the real HUD: Units button → first unit
  await click(449, 40); // "Train units" (first button of the menu panel)
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/shots/app-units.png' });
  await click(458, 40); // first unit button of the units menu
  await page.waitForTimeout(6000);
  await page.screenshot({ path: '/tmp/shots/app-game.png' });
  const cash = await page.evaluate(() => (window as unknown as { __aow: Aow }).__aow.match?.sim.player(1).cash);
  expect(cash).toBeLessThan(175);
  expect(errs).toEqual([]);
});
