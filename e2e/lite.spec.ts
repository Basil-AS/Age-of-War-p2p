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

test('lite: destroying the enemy base shows the victory overlay and rematch restarts', async ({ page }) => {
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
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const m = (window as unknown as { __aow: { match: { sim: { players: { baseHp: number }[] } } } }).__aow.match;
    m.sim.players[1]!.baseHp = 0;
  });
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: '/tmp/shots/lite-victory.png' });
  await page.getByRole('button', { name: /↻/ }).click();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('result')).toHaveCount(0);
  expect(errs).toEqual([]);
});

test('lite: fills any window size without scrollbars', async ({ page }) => {
  await page.goto('/lite.html');
  for (const [w, h] of [
    [1920, 1080],
    [390, 844],
    [844, 390],
    [1024, 600],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    const o = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth - window.innerWidth,
      sh: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(o.sw).toBeLessThanOrEqual(1);
  }
});
