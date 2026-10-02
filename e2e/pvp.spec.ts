import { expect, type Page, test } from '@playwright/test';

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

type W = {
  __aow: {
    app: { phase: string; lobby: { code: string; via: string } };
    match: {
      side: number;
      sim: { frame: number; units: { side: number }[]; hash(): number };
      command(c: unknown): void;
    } | null;
    hostRoom(): void;
    joinRoom(c: string): void;
  };
};
const ready = (p: Page) => p.waitForFunction(() => !!(window as unknown as W).__aow, null, { timeout: 90_000 });

async function pair(
  browser: import('@playwright/test').Browser,
  query: string,
  sameContext: boolean,
  page = 'original.html',
) {
  const c1 = await browser.newContext();
  const c2 = sameContext ? c1 : await browser.newContext();
  const a = await c1.newPage();
  const b = await c2.newPage();
  const errs: string[] = [];
  for (const p of [a, b]) p.on('pageerror', (e) => errs.push(String(e)));
  await Promise.all([a.goto(`/${page}${query}`), b.goto(`/${page}${query}`)]);
  await Promise.all([ready(a), ready(b)]);
  await a.evaluate(() => (window as unknown as W).__aow.hostRoom());
  const code = await a.evaluate(() => (window as unknown as W).__aow.app.lobby.code);
  await b.evaluate((c) => (window as unknown as W).__aow.joinRoom(c), code);
  for (const p of [a, b])
    await p.waitForFunction(
      () =>
        (window as unknown as W).__aow.app.phase === 'game' ||
        (window as unknown as { __aow: { app: { screen?: string } } }).__aow.app.screen === 'game',
      null,
      { timeout: 60_000 },
    );
  return { a, b, errs };
}

async function playAndCompare(a: Page, b: Page) {
  await a.evaluate(() => (window as unknown as W).__aow.match?.command({ t: 'tray', id: 1 }));
  await b.evaluate(() => (window as unknown as W).__aow.match?.command({ t: 'tray', id: 1 }));
  await a.waitForTimeout(8000);
  // slow CI runners need longer before both trained units exist
  await a.waitForFunction(() => ((window as unknown as W).__aow.match?.sim.units.length ?? 0) >= 2, null, {
    timeout: 40_000,
  });
  const snap = (p: Page) =>
    p.evaluate(() => {
      const m = (window as unknown as W).__aow.match;
      return { side: m?.side, units: m?.sim.units.length, frame: m?.sim.frame ?? 0 };
    });
  const [sa, sb] = [await snap(a), await snap(b)];
  expect([sa.side, sb.side].sort()).toEqual([1, 2]);
  expect(sa.units).toBeGreaterThanOrEqual(2);
  expect(Math.abs(sa.frame - (sb.frame ?? 0))).toBeLessThan(120);
}

test('lockstep PvP on one device (BroadcastChannel)', async ({ browser }) => {
  const { a, b, errs } = await pair(browser, '?net=local', true);
  await playAndCompare(a, b);
  expect(errs).toEqual([]);
});

test('fallback: WebSocket relay only (no WebRTC, no public servers)', async ({ browser }) => {
  const { a, b, errs } = await pair(browser, '?rungs=relay-ws&ws=ws://localhost:7779', false);
  expect(await a.evaluate(() => (window as unknown as W).__aow.app.lobby.via)).toBe('relay-ws');
  await playAndCompare(a, b);
  expect(errs).toEqual([]);
});

test('lite version: lockstep PvP on one device', async ({ browser }) => {
  const { a, b, errs } = await pair(browser, '?net=local', true, 'lite.html');
  await a.evaluate(() => (window as unknown as W).__aow.match?.command({ t: 'buy', u: 0 }));
  await b.evaluate(() => (window as unknown as W).__aow.match?.command({ t: 'buy', u: 0 }));
  await a.waitForTimeout(6000);
  const sides = await Promise.all([a, b].map((p) => p.evaluate(() => (window as unknown as W).__aow.match?.side)));
  expect([...sides].sort()).toEqual([0, 1]);
  expect(errs).toEqual([]);
});
