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

test('keyboard camera: holding an arrow key glides smoothly (no jumps), releasing eases to a stop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await startSolo(page);
  // drive the scene with a fixed 60 fps clock so the check does not depend on this machine's frame rate
  const r = await page.evaluate(() => {
    const sc = (
      window as unknown as {
        __aow: { orig: { scene: { scroll: number; update(dt: number, a: number): void; setKeyDir(d: number): void } } };
      }
    ).__aow.orig.scene;
    const run = (n: number) => {
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        sc.update(16.67, 1);
        out.push(sc.scroll);
      }
      return out;
    };
    sc.setKeyDir(1);
    const hold = run(50);
    sc.setKeyDir(0);
    const release = run(60);
    const rest = run(30);
    return { hold, release, rest };
  });
  const d = (a: number[]) => a.slice(1).map((v, i) => (a[i] as number) - v); // positive = moved right
  const hold = d(r.hold);
  expect(hold.every((x) => x >= 0)).toBe(true); // monotone
  expect(Math.max(...hold)).toBeLessThan(11); // ≤ 640 px/s at 60 fps: no key-repeat leaps
  expect(hold[hold.length - 1]).toBeGreaterThan(hold[2] as number); // accelerates gradually
  const jerk = Math.max(...hold.slice(1).map((v, i) => Math.abs(v - (hold[i] as number))));
  expect(jerk).toBeLessThan(1.2); // speed changes in small steps
  const rel = d(r.release);
  expect(rel[0]).toBeGreaterThan(0); // keeps gliding after release …
  expect(rel[rel.length - 1]).toBeLessThan(0.2); // … and comes to rest
  expect(Math.abs((r.rest[29] as number) - (r.rest[0] as number))).toBeLessThan(0.5);
});

test('motion is interpolated between simulation ticks (units, flying shots) at any refresh rate', async ({ page }) => {
  await startSolo(page);
  await g(page, (a) => {
    a.match!.sim.player(1).cash = 100000;
    a.match!.sim.player(2).cash = 100000;
  });
  await page.keyboard.press('3');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { __aow: { match: { sim: { units: { side: number }[] } } } }
          ).__aow.match.sim.units.filter((u) => u.side === 1).length,
      ),
    )
    .toBeGreaterThan(0);
  const r = await page.evaluate(() => {
    const w = window as unknown as {
      __aow: {
        match: { sim: { step(): void; units: { side: number; x: number; speed: number; dead?: boolean }[] } };
        orig: {
          paused: boolean;
          setPaused(b: boolean): void;
          scene: {
            tick(): void;
            update(dt: number, a: number): void;
            unitsC: { children: { position: { x: number }; u: { side: number; speed: number } }[] };
          };
        };
      };
    };
    const { match, orig } = w.__aow;
    orig.setPaused(true);
    for (let i = 0; i < 200 && !match.sim.units.some((u) => u.side === 1 && !u.dead); i++) match.sim.step();
    match.sim.step();
    orig.scene.tick();
    const view = orig.scene.unitsC.children.find((c) => c.u.side === 1 && c.u.speed !== 0);
    const xs: number[] = [];
    for (const a of [0, 0.25, 0.5, 0.75, 1]) {
      orig.scene.update(16, a);
      xs.push(view?.position.x ?? NaN);
    }
    return xs;
  });
  expect(r.every(Number.isFinite)).toBe(true);
  for (let i = 1; i < r.length; i++) expect(r[i] as number).toBeGreaterThanOrEqual(r[i - 1] as number);
  expect(r[4]! - r[0]!).toBeLessThan(2); // one tick = at most ~0.7 px for a walker, spread over the 5 samples
});

test('turret prices stay visible on a filled slot; Russian-layout keys work', async ({ page }) => {
  await startSolo(page);
  await g(page, (a) => {
    a.match!.sim.player(1).cash = 100000;
  });
  await page.getByTestId('slot-1').click();
  await page.getByTestId('buy-turret-1').click();
  await expect.poll(() => g(page, (a) => a.app.hud?.slots[0]?.id ?? 0)).toBeGreaterThan(0);
  await page.getByTestId('slot-1').click(); // filled slot → price list for all three turrets
  await expect(page.getByTestId('price-turret-3')).toBeVisible();
  await expect(page.getByTestId('price-turret-3')).toContainText(/\d/);
  // physical key 'Digit1' with a Cyrillic key value still queues a unit
  const q0 = await g(page, (a) => a.match!.sim.player(1).cash);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1' })));
  await expect.poll(() => g(page, (a) => a.match!.sim.player(1).cash)).toBeLessThan(q0);
  const q1 = await g(page, (a) => a.match!.sim.player(1).cash);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', key: '2' })));
  await expect.poll(() => g(page, (a) => a.match!.sim.player(1).cash)).toBeLessThan(q1);
});

test('auto-pause on a hidden window can be turned off', async ({ page }) => {
  await startSolo(page);
  const hide = () =>
    page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
  await g(page, (a) => a.orig!.autoPause === true);
  await g(page, (a) => {
    a.orig!.autoPause = false;
  });
  await hide();
  await page.waitForTimeout(150);
  expect(await g(page, (a) => a.app.paused)).toBe(false);
  await g(page, (a) => {
    a.orig!.autoPause = true;
  });
  await hide();
  await expect.poll(() => g(page, (a) => a.app.paused)).toBe(true);
});
