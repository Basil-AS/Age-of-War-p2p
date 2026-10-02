import { expect, test } from '@playwright/test';
import { startSolo, waitTitle } from './util';

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

type G = {
  __aow: {
    app: {
      phase: string;
      paused: boolean;
      menu: string;
      hud: { cash: number; xp: number; tech: number; tray: number[]; slots: { id: number }[] } | null;
    };
    match: {
      sim: { frame: number; player(s: number): { cash: number; xp: number; tech: number; special: number } };
    } | null;
    orig: { viewW: number; scene: { scroll: number; viewW: number } | null; assets: { quality: string } };
  };
};
const g = <T>(page: import('@playwright/test').Page, f: (a: G['__aow']) => T) =>
  page.evaluate((src) => new Function('a', `return (${src})(a)`)((window as unknown as G).__aow), f.toString());

test('main menu: modern layout, no ads/banners, every panel opens', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('/original.html');
  await waitTitle(page);
  const body = (await page.locator('body').innerText()).toLowerCase();
  expect(body).not.toContain('maxgames');
  expect(body).not.toContain('play more games');
  expect(body).not.toContain('extras');
  for (const [open, expectSel] of [
    ['menu-howto', 'text=/hotkeys|клавиши/i'],
    ['menu-settings', 'text=/language|язык/i'],
    ['menu-about', 'text=/Louissi/'],
    ['menu-friend', '[data-testid=host-room]'],
    ['menu-play', '[data-testid=lvl-3]'],
  ] as const) {
    await page.getByTestId(open).click();
    await expect(page.locator(expectSel).first()).toBeVisible();
    await page.getByRole('button', { name: /←/ }).click();
  }
  expect(errs).toEqual([]);
});

test('HUD: buy units with mouse and keys, build and sell a turret, evolve, special', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await startSolo(page);
  await g(page, (a) => {
    a.match!.sim.player(1).cash = 100000;
    a.match!.sim.player(1).xp = 5000;
  });
  const cash = () => g(page, (a) => a.match!.sim.player(1).cash);
  const c0 = await cash();
  await page.getByTestId('unit-1').click();
  await expect.poll(cash).toBeLessThan(c0);
  const c1 = await cash();
  await page.keyboard.press('2');
  await expect.poll(cash).toBeLessThan(c1);
  // turret: choose a slot, pick the cheapest turret
  await page.getByTestId('slot-1').click();
  await page.getByTestId('buy-turret-1').click();
  await expect.poll(() => g(page, (a) => a.app.hud?.slots[0]?.id ?? 0)).toBeGreaterThan(0);
  await page.getByTestId('slot-1').click();
  await page.getByTestId('sell').click();
  await expect.poll(() => g(page, (a) => a.app.hud?.slots[0]?.id ?? 0)).toBe(0);
  // evolve through the button
  await expect(page.getByTestId('evolve')).toBeEnabled();
  await page.getByTestId('evolve').click();
  await expect.poll(() => g(page, (a) => a.match!.sim.player(1).tech)).toBe(2);
  // special
  await expect(page.getByTestId('special')).toBeEnabled();
  await page.getByTestId('special').click();
  await expect.poll(() => g(page, (a) => a.match!.sim.player(1).special)).toBeLessThan(500);
  expect(errs).toEqual([]);
});

test('pause menu freezes a solo game; resume continues; leave returns to the menu', async ({ page }) => {
  await startSolo(page);
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  const f0 = await g(page, (a) => a.match!.sim.frame);
  await page.waitForTimeout(1500);
  expect((await g(page, (a) => a.match!.sim.frame)) - f0).toBeLessThan(3);
  await page.getByTestId('resume').click();
  await expect.poll(() => g(page, (a) => a.match!.sim.frame)).toBeGreaterThan(f0 + 10);
  await page.keyboard.press('Escape');
  await page.getByTestId('leave').click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
});

test('original proportions are kept: ~650 world px across on 16:9, the map still scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await startSolo(page);
  const wide = await g(page, (a) => ({ v: a.orig.viewW, s: a.orig.scene!.scroll }));
  expect(wide.v).toBeLessThan(700); // not the whole 1000 px map squeezed in: units stay big, the map stays wide
  await page.mouse.move(900, 400);
  await page.mouse.wheel(400, 0);
  await expect.poll(() => g(page, (a) => a.orig.scene!.scroll)).toBeLessThan(wide.s - 100);
  // ultra-wide shows a bit more, still scrollable
  await page.setViewportSize({ width: 2560, height: 1080 });
  await expect.poll(() => g(page, (a) => a.orig.viewW)).toBeGreaterThan(wide.v);
  expect(await g(page, (a) => a.orig.viewW)).toBeLessThan(1000);
});

test('full-window battlefield: canvas fills the window and the bar sits under the world', async ({ page }) => {
  for (const [w, h] of [
    [1920, 1080],
    [1366, 768],
    [915, 412],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await startSolo(page);
    const canvas = await page.locator('#stage').boundingBox();
    expect(Math.round(canvas?.width ?? 0)).toBe(w);
    expect(Math.round(canvas?.height ?? 0)).toBe(h);
    const bar = await page.getByTestId('control-bar').boundingBox();
    expect(bar!.y + bar!.height).toBeGreaterThan(h - 2);
    expect(bar!.height).toBeLessThan(h * 0.4);
    // the world uses the full width (no 4:3 box): visible width is at least the screen aspect
    const v = await g(page, (a) => a.orig.viewW);
    expect(v).toBeGreaterThanOrEqual(650);
    await page.goto('about:blank');
  }
});

test('result screen: victory and defeat with Play again / Menu', async ({ page }) => {
  await startSolo(page);
  await g(page, (a) => {
    (a.match as unknown as { sim: { bases: Record<number, { health: number }> } }).sim.bases[2]!.health = -5;
  });
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('again').click();
  await expect(page.getByTestId('result')).toHaveCount(0);
  await expect(page.getByTestId('hud')).toBeVisible();
  await g(page, (a) => {
    (a.match as unknown as { sim: { bases: Record<number, { health: number }> } }).sim.bases[1]!.health = -5;
  });
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('to-menu').click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
});
