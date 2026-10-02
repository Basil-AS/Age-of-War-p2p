import { expect, test } from '@playwright/test';

test.afterEach(async ({ browser }) => {
  // contexts we create by hand are not auto-closed — stop their game loops so tests do not starve each other
  for (const c of browser.contexts()) await c.close();
});

const play = async (a: import('@playwright/test').Page, b: import('@playwright/test').Page) => {
  for (let i = 0; i < 3; i++) {
    await a.keyboard.press('1');
    await b.keyboard.press('1');
    await a.waitForTimeout(600);
  }
  await a.waitForTimeout(6000);
  const st = (p: typeof a) =>
    p.evaluate(() => {
      const m = (window as any).__aow.match;
      return { desync: m.status.desync, tick: m.sim.tick, gold: m.sim.players.map((q: any) => q.gold) };
    });
  const [sa, sb] = [await st(a), await st(b)];
  expect(sa.desync || sb.desync).toBe(false);
  expect(sa.tick).toBeGreaterThan(80);
  expect(sa.gold[1]).toBeLessThan(175);
  expect(sb.gold[0]).toBeLessThan(175);
};

test('fallback ladder: WebRTC blocked by the browser → game flows through relay servers', async ({ browser }) => {
  test.setTimeout(150_000);
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    // simulate a browser / network that has no WebRTC at all
    await ctx.addInitScript(() => {
      delete (window as any).RTCPeerConnection;
    });
    return ctx.newPage();
  };
  const [a, b] = [await mk(), await mk()];
  const q = '?relayUrl=ws://localhost:7777&rungs=nostr,turn,relay-nostr';
  await a.goto(`/${q}`);
  await a.getByText(/Play with a friend|Игра с другом/).click();
  await a.getByText(/Create room|Создать комнату/).click();
  const code = (await a.getByTestId('room-code').textContent())?.trim() ?? '';
  await b.goto(`/${q}#join=${code}`);
  // WebRTC rungs are reported unavailable immediately; the relay rung then carries the game
  await expect(b.getByTestId('routes').locator('[data-status="failed"]').first()).toBeVisible({ timeout: 40_000 });
  await expect(a.getByTestId('gold')).toBeVisible({ timeout: 90_000 });
  await expect(b.getByTestId('gold')).toBeVisible({ timeout: 30_000 });
  await expect(b.getByTestId('via')).toHaveText(/relay|сервер/i);
  await play(a, b);
});

test('manual mode: two copy-pasted codes, no servers at all', async ({ browser }) => {
  test.setTimeout(90_000);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await a.goto('/');
  await a.getByText(/Play with a friend|Игра с другом/).click();
  await a.getByText(/I am the host|Я хост/).click();
  const offer = a.locator('textarea[readonly]');
  await expect(offer).toHaveValue(/^AOW1/, { timeout: 45_000 });
  const offerCode = await offer.inputValue();

  await b.goto('/');
  await b.getByText(/Play with a friend|Игра с другом/).click();
  await b.getByText(/I am the guest|Я гость/).click();
  await b.locator('textarea').fill(offerCode);
  await b.getByRole('button', { name: /Connect|Соединить/ }).click();
  const answer = b.locator('textarea[readonly]');
  await expect(answer).toHaveValue(/^AOW1/, { timeout: 45_000 });

  await a.locator('textarea:not([readonly])').fill(await answer.inputValue());
  await a.getByRole('button', { name: /Connect|Соединить/ }).click();
  await expect(a.getByTestId('gold')).toBeVisible({ timeout: 30_000 });
  await expect(b.getByTestId('gold')).toBeVisible({ timeout: 30_000 });
  await play(a, b);
});

test('rematch keeps the connection and starts a fresh match', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  await a.goto('/?net=local');
  await a.getByText(/Play with a friend|Игра с другом/).click();
  await a.getByText(/Create room|Создать комнату/).click();
  const code = (await a.getByTestId('room-code').textContent())?.trim() ?? '';
  await b.goto(`/?net=local#join=${code}`);
  await expect(a.getByTestId('gold')).toBeVisible({ timeout: 45_000 });
  await expect(b.getByTestId('gold')).toBeVisible({ timeout: 45_000 });
  await a.waitForTimeout(1500);
  for (const p of [a, b]) {
    await p.evaluate(() => {
      (window as any).__aow.match.sim.winner = 0;
    });
  }
  await expect(a.getByTestId('result')).toBeVisible();
  await a.getByRole('button', { name: /Rematch|Реванш/ }).click();
  await b.getByRole('button', { name: /Rematch|Реванш/ }).click();
  await expect(a.getByTestId('result')).toBeHidden({ timeout: 30_000 });
  await expect(b.getByTestId('result')).toBeHidden({ timeout: 30_000 });
  await a.keyboard.press('1');
  await b.keyboard.press('1');
  await a.waitForTimeout(3000);
  const tick = await a.evaluate(
    () => (window as unknown as { __aow: { match: { sim: { tick: number } } } }).__aow.match.sim.tick,
  );
  expect(tick).toBeLessThan(300);
  expect(tick).toBeGreaterThan(20);
});

for (const [name, query] of [
  ['relay-mqtt (MQTT broker)', '?rungs=relay-mqtt&mqttUrl=ws://localhost:7778'],
  ['relay-ws (own WebSocket relay)', '?rungs=relay-ws&ws=ws://localhost:7779'],
] as const) {
  test(`route ${name} carries a full match`, async ({ browser }) => {
    test.setTimeout(120_000);
    const [a, b] = await Promise.all([(await browser.newContext()).newPage(), (await browser.newContext()).newPage()]);
    await a.goto(`/${query}`);
    await a.getByText(/Play with a friend|Игра с другом/).click();
    await a.getByText(/Create room|Создать комнату/).click();
    const code = (await a.getByTestId('room-code').textContent())?.trim() ?? '';
    await b.goto(`/${query}#join=${code}`);
    await expect(a.getByTestId('gold')).toBeVisible({ timeout: 60_000 });
    await expect(b.getByTestId('gold')).toBeVisible({ timeout: 60_000 });
    await play(a, b);
  });
}
