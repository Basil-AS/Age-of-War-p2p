import { expect, test } from '@playwright/test';

// Real Trystero + WebRTC data channels (no BroadcastChannel shortcut). A tiny local Nostr relay
// (e2e/tools/relay.mjs) does the signalling so the test runs offline; set RELAY_URL='' and
// WEBRTC_PUBLIC=1 to run it against the real public relays instead.
const relayQuery = process.env.WEBRTC_PUBLIC ? '' : '?relayUrl=ws://localhost:7777';
test('webrtc: two browsers connect over a real RTCDataChannel and play in sync', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await a.goto(`/${relayQuery}`);
  await a.getByText(/Play with a friend|Игра с другом/).click();
  await a.getByText(/Create room|Создать комнату/).click();
  const code = (await a.getByTestId('room-code').textContent())?.trim() ?? '';
  await b.goto(`/${relayQuery}#join=${code}&relay=nostr`);
  await expect(a.getByTestId('gold')).toBeVisible({ timeout: 90_000 });
  await expect(b.getByTestId('gold')).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 3; i++) { await a.keyboard.press('1'); await b.keyboard.press('1'); await a.waitForTimeout(500); }
  await a.waitForTimeout(8000);
  const st = (p: typeof a) => p.evaluate(() => { const m = (window as any).__aow.match; return { desync: m.status.desync, tick: m.sim.tick, rtt: m.status.rtt, gold: m.sim.players.map((q: any) => q.gold) }; });
  const [sa, sb] = [await st(a), await st(b)];
  console.log('A', JSON.stringify(sa), 'B', JSON.stringify(sb));
  expect(sa.desync || sb.desync).toBe(false);
  expect(sa.tick).toBeGreaterThan(100);
  expect(sa.gold[1]).toBeLessThan(175);
  expect(sb.gold[0]).toBeLessThan(175);
});

