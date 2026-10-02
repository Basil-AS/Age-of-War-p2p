import { expect, test } from '@playwright/test';

test.afterEach(async ({ browser }) => {
  // contexts we create by hand are not auto-closed — stop their game loops so tests do not starve each other
  for (const c of browser.contexts()) await c.close();
});

/**
 * Two browser tabs play each other through the same-device BroadcastChannel transport
 * (identical lockstep code path as WebRTC) — proves the whole online flow end to end.
 */
test('online 1v1: host creates room, friend joins by link, both stay in sync', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  const errs: string[] = [];
  for (const p of [a, b]) {
    p.on('pageerror', (e) => errs.push(String(e)));
  }

  await a.goto('/?net=local');
  await a.getByText(/Play with a friend|Игра с другом/).click();
  await a.getByText(/Create room|Создать комнату/).click();
  const code = (await a.getByTestId('room-code').textContent())?.trim() ?? '';
  expect(code).toHaveLength(5);

  await b.goto(`/?net=local#join=${code}&relay=nostr`);
  await expect(a.getByTestId('gold')).toBeVisible({ timeout: 45_000 });
  await expect(b.getByTestId('gold')).toBeVisible({ timeout: 45_000 });

  // both buy units
  for (let i = 0; i < 4; i++) {
    await a.keyboard.press('1');
    await b.keyboard.press('2');
    await a.waitForTimeout(300);
  }
  await a.getByTestId('unit-0').click();
  await b.getByTestId('unit-1').click();
  await a.waitForTimeout(12000);
  await a.screenshot({ path: '/tmp/shots/online-a.png' });
  await b.screenshot({ path: '/tmp/shots/online-b.png' });

  const snap = (p: typeof a) =>
    p.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const m = w.__aow.match;
      return {
        side: m.side,
        tick: m.sim.tick,
        desync: m.status.desync,
        lanes: m.sim.lanes.map((l: any[]) => l.length),
        gold: m.sim.players.map((p: any) => p.gold),
        hash: m.sim.hash(),
      };
    });
  const sa = await snap(a);
  const sb = await snap(b);
  expect(sa.side).toBe(0);
  expect(sb.side).toBe(1);
  expect(sa.desync || sb.desync).toBe(false);
  expect(sa.gold[0]).toBeLessThan(175); // host spent gold
  expect(sa.gold[1]).toBeLessThan(175); // …and saw the guest spend too
  expect(errs).toEqual([]);
  await ctx.close();
});
