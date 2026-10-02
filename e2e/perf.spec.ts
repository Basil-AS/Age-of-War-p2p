import { expect, test } from '@playwright/test';
import { startSolo } from './util';

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

// CPU budget of the game logic in a real browser (no GPU involved): one simulated tick including the
// animation/scene update must stay far below the 25 ms tick length even in a busy mid-game.
test('per-tick CPU budget (sim + scene) in a populated battle', async ({ page }) => {
  await startSolo(page, '/original.html?q=sd');
  const r = await page.evaluate(() => {
    const w = window as unknown as {
      __aow: {
        match: {
          sim: { step(a?: unknown[], b?: unknown[]): void; player(s: number): { cash: number }; units: unknown[] };
          command(c: unknown): void;
        };
        orig: { scene: { tick(): void } };
      };
    };
    const { match, orig } = w.__aow;
    // build a crowd: lots of cash, buy units for a while
    match.sim.player(1).cash = 1e6;
    const lo = 1;
    for (let i = 0; i < 4000; i++) {
      match.sim.step(i % 30 === 0 ? [{ t: 'tray', id: lo + (i % 3) }] : []);
      orig.scene.tick();
    }
    const n = 800;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      match.sim.step(i % 25 === 0 ? [{ t: 'tray', id: lo }] : []);
      orig.scene.tick();
    }
    return { msPerTick: (performance.now() - t0) / n, units: match.sim.units.length };
  });
  console.log('tick cost', JSON.stringify(r));
  expect(r.units).toBeGreaterThan(2);
  expect(r.msPerTick).toBeLessThan(2.5); // 25 ms available per tick; 10% budget even on a slow CI core
});
