import { expect, type Page, test } from '@playwright/test';
import { startSolo } from './util';

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

type W = {
  __aow: {
    app: {
      phase: string;
      result: { winner: number; me: number; online: boolean };
      net: { desync: boolean; stalled: boolean };
    };
    match: { sim: { frame: number; winner: number; bases: Record<number, { health: number }> } } | null;
    orig: { assets: { quality: string } } | null;
    hostRoom(): void;
    joinRoom(c: string): void;
    toPage(x: number, y: number): { x: number; y: number };
  };
};
const ready = (p: Page) =>
  p.waitForFunction(() => (window as unknown as W).__aow?.app.phase === 'title', null, { timeout: 90_000 });
test('solo: destroying the enemy base shows the victory flow and the title is reachable again', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await startSolo(page);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    (window as unknown as W).__aow.match!.sim.bases[2]!.health = -5;
  });
  await page.waitForFunction(() => (window as unknown as W).__aow.app.phase === 'result', null, { timeout: 20_000 });
  expect(await page.evaluate(() => (window as unknown as W).__aow.app.result.winner)).toBe(1);
  await page.screenshot({ path: '/tmp/shots/flow-victory.png' });
  expect(errs).toEqual([]);
});

test('solo: losing shows the defeat flow', async ({ page }) => {
  await startSolo(page);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    (window as unknown as W).__aow.match!.sim.bases[1]!.health = -5;
  });
  await page.waitForFunction(() => (window as unknown as W).__aow.app.phase === 'result', null, { timeout: 20_000 });
  expect(await page.evaluate(() => (window as unknown as W).__aow.app.result.winner)).toBe(2);
  await page.screenshot({ path: '/tmp/shots/flow-defeat.png' });
});

test('the stage stays letterboxed and fills the window across resizes', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('/original.html');
  await ready(page);
  for (const [w, h] of [
    [1920, 1080],
    [800, 600],
    [640, 360],
    [2560, 1080],
    [1024, 768],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await expect
      .poll(async () => Math.round((await page.locator('#stage').boundingBox())?.width ?? 0), { timeout: 15_000 })
      .toBe(w);
    const box = await page.locator('#stage').boundingBox();
    expect(Math.round(box?.height ?? 0)).toBe(h);
    await page.waitForTimeout(300);
    // the 650×450 stage is centred and never cropped
    const a = await page.evaluate(() => (window as unknown as W).__aow.toPage(0, 0));
    const b = await page.evaluate(() => (window as unknown as W).__aow.toPage(650, 450));
    expect(a.x).toBeGreaterThanOrEqual(-1);
    expect(a.y).toBeGreaterThanOrEqual(-1);
    expect(b.x).toBeLessThanOrEqual(w + 1);
    expect(b.y).toBeLessThanOrEqual(h + 1);
    expect(Math.abs(a.x + (b.x - a.x) / 2 - w / 2)).toBeLessThan(2);
  }
  expect(errs).toEqual([]);
});

test.describe('phone', () => {
  test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2.6, viewport: { width: 915, height: 412 } });
  test('uses the light (sd) art and fits the landscape screen', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto('/original.html');
    await ready(page);
    expect(await page.evaluate(() => (window as unknown as W).__aow.orig?.assets.quality)).toBe('sd');
    const a = await page.evaluate(() => (window as unknown as W).__aow.toPage(0, 0));
    const b = await page.evaluate(() => (window as unknown as W).__aow.toPage(650, 450));
    expect(b.y - a.y).toBeLessThanOrEqual(413);
    expect(await page.locator('.rotate-hint').isVisible()).toBe(false);
    expect(errs).toEqual([]);
  });
  test('portrait shows the rotate hint', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto('/original.html');
    await ready(page);
    expect(await page.locator('.rotate-hint').isVisible()).toBe(true);
  });
});

test('online: both screens agree on the winner when a base falls', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  const errs: string[] = [];
  for (const p of [a, b]) p.on('pageerror', (e) => errs.push(String(e)));
  await Promise.all([a.goto('/original.html?net=local'), b.goto('/original.html?net=local')]);
  await Promise.all([ready(a), ready(b)]);
  await a.evaluate(() => (window as unknown as W).__aow.hostRoom());
  const code = await a.evaluate(
    () => (window as unknown as { __aow: { app: { lobby: { code: string } } } }).__aow.app.lobby.code,
  );
  await b.evaluate((c) => (window as unknown as W).__aow.joinRoom(c), code);
  for (const p of [a, b])
    await p.waitForFunction(() => (window as unknown as W).__aow.app.phase === 'game', null, { timeout: 60_000 });
  await a.waitForTimeout(1500);
  // the host's base falls on both screens (it is the same deterministic state)
  await a.evaluate(() => {
    (window as unknown as W).__aow.match!.sim.bases[2]!.health = -5;
  });
  await b.evaluate(() => {
    (window as unknown as W).__aow.match!.sim.bases[2]!.health = -5;
  });
  for (const p of [a, b])
    await p.waitForFunction(() => (window as unknown as W).__aow.app.phase === 'result', null, { timeout: 30_000 });
  expect(await a.evaluate(() => (window as unknown as W).__aow.app.result.winner)).toBe(1);
  expect(await b.evaluate(() => (window as unknown as W).__aow.app.result.winner)).toBe(1);
  await a.screenshot({ path: '/tmp/shots/flow-online-result.png' });
  expect(errs).toEqual([]);
});

test('network check panel: probes run, a verdict and a copyable report appear', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.goto('/original.html');
  await page.waitForFunction(() => (window as unknown as W).__aow?.app.phase === 'title', null, { timeout: 90_000 });
  await page.evaluate(() => {
    (window as unknown as { __aow: { app: { overlay: string } } }).__aow.app.overlay = 'friend';
  });
  await page.getByTestId('netcheck-run').click();
  await expect(page.getByTestId('netcheck-results')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /📋/ })).toBeVisible({ timeout: 20_000 });
  const rows = await page.getByTestId('netcheck-results').locator('div.flex').count();
  expect(rows).toBeGreaterThan(8); // 5 STUN + TURN + 6 Nostr + 3 MQTT
});
