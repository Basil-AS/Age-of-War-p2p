import { expect, type Page, test } from '@playwright/test';

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

type W = {
  __aow: {
    app: {
      phase: string;
      lobby: { code: string; via: string };
      net: { desync: boolean; rtt: number; via: string; routes: { id: string; alive: boolean }[] };
    };
    match: { side: number; sim: { frame: number; hash(): number }; command(c: unknown): void } | null;
    hostRoom(): void;
    joinRoom(c: string): void;
  };
};

// Real Trystero + RTCPeerConnection/RTCDataChannel between two separate browser contexts. A tiny local
// Nostr relay (e2e/tools/relay.mjs) does the signalling so it runs offline; the two peers then talk
// over a genuine WebRTC data channel (ICE host candidates on loopback).
test('webrtc: two browsers connect over a real RTCDataChannel and stay in lockstep', async ({ browser }) => {
  test.setTimeout(180_000);
  const q = '?rungs=nostr&relayUrl=ws://localhost:7777&q=sd&norender';
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const errs: string[] = [];
  for (const p of [a, b]) p.on('pageerror', (e) => errs.push(String(e)));
  await Promise.all([a.goto(`/original.html${q}`), b.goto(`/original.html${q}`)]);
  const ready = (p: Page) => p.waitForFunction(() => !!(window as unknown as W).__aow, null, { timeout: 90_000 });
  await Promise.all([ready(a), ready(b)]);
  await a.evaluate(() => (window as unknown as W).__aow.hostRoom());
  const code = await a.evaluate(() => (window as unknown as W).__aow.app.lobby.code);
  await b.evaluate((c) => (window as unknown as W).__aow.joinRoom(c), code);
  for (const p of [a, b])
    await p.waitForFunction(() => (window as unknown as W).__aow.app.phase === 'game', null, { timeout: 120_000 });
  expect(await a.evaluate(() => (window as unknown as W).__aow.app.lobby.via)).toBe('nostr');

  for (let i = 0; i < 3; i++) {
    await a.evaluate(() => (window as unknown as W).__aow.match?.command({ t: 'tray', id: 1 }));
    await b.evaluate(() => (window as unknown as W).__aow.match?.command({ t: 'tray', id: 2 }));
    await a.waitForTimeout(600);
  }
  await a.waitForTimeout(8000);
  const st = (p: Page) =>
    p.evaluate(() => {
      const w = (window as unknown as W).__aow;
      return { desync: w.app.net.desync, frame: w.match?.sim.frame ?? 0, rtt: w.app.net.rtt, via: w.app.net.via };
    });
  const [sa, sb] = [await st(a), await st(b)];
  console.log('webrtc A', JSON.stringify(sa), 'B', JSON.stringify(sb));
  expect(sa.desync || sb.desync).toBe(false);
  expect(sa.frame).toBeGreaterThan(200);
  expect(Math.abs(sa.frame - sb.frame)).toBeLessThan(120);
  expect(sa.via).toBe('nostr');
  expect(sa.rtt).toBeLessThan(150); // loopback WebRTC must be well inside the 150 ms budget
  expect(errs).toEqual([]);
});
