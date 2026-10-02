import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lockstep } from '../src/net/lockstep';
import { createLoopbackPair } from '../src/net/loopback';
import { guestHandshake, hostHandshake } from '../src/net/session';
import { mk } from './helpers';

const clock = { now: () => performance.now() };

async function handshake(latencyMs: number) {
  const [ta, tb] = createLoopbackPair({ latencyMs, clock });
  const h = hostHandshake(ta, 'Alice', 4242);
  const g = guestHandshake(tb, 'Bob');
  for (let i = 0; i < 2000; i++) {
    vi.advanceTimersByTime(5);
    ta.pump();
    tb.pump();
  }
  return Promise.all([h, g]);
}

describe('handshake', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('agrees on seed, sides and names', async () => {
    const [h, g] = await handshake(20);
    expect(h.seed).toBe(4242);
    expect(g.seed).toBe(4242);
    expect([h.side, g.side]).toEqual([0, 1]);
    expect(h.peerName).toBe('Bob');
    expect(g.peerName).toBe('Alice');
    expect(g.delay).toBe(h.delay);
  });
  it('chooses a bigger input delay for slower links, within [2, 8]', async () => {
    const d = [];
    for (const ms of [2, 40, 120, 250, 900]) d.push((await handshake(ms))[0].delay);
    expect(d[0]).toBe(2);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1] as number);
    expect(d[d.length - 1]).toBe(8);
  });
});

describe('lockstep status', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const pair = (lat: number, delay = 3) => {
    const [ta, tb] = createLoopbackPair({ latencyMs: lat, clock });
    const a = new Lockstep(mk(7), 1, ta, delay);
    const b = new Lockstep(mk(7), 2, tb, delay);
    const tick = (ms: number) => {
      for (let t = 0; t < ms; t += 8) {
        vi.advanceTimersByTime(8);
        ta.pump();
        tb.pump();
        a.update(performance.now());
        b.update(performance.now());
      }
    };
    return { a, b, ta, tb, tick };
  };

  it('both sides stay on the same tick and hash', () => {
    const { a, b, tick } = pair(30);
    tick(20_000);
    expect(a.sim.frame).toBeGreaterThan(300);
    expect(Math.abs(a.sim.frame - b.sim.frame)).toBeLessThan(40);
    expect(a.status.desync).toBe(false);
    expect(b.status.desync).toBe(false);
  });
  it('detects a desync (a command that only one side saw)', () => {
    const { a, b, tick } = pair(10);
    tick(2000);
    a.sim.player(1).cash += 999; // simulated divergence
    tick(8000);
    expect(a.status.desync || b.status.desync).toBe(true);
  });
  it('stalls (waits) instead of running ahead when the peer goes silent', () => {
    const { a, tb, tick } = pair(10);
    tick(3000);
    tb.send = () => {}; // peer stops talking
    tick(4000);
    const f = a.sim.frame;
    tick(2000);
    expect(a.status.stalled).toBe(true);
    expect(a.sim.frame - f).toBeLessThan(10);
  });
  it('commands issued on both sides are applied identically', () => {
    const { a, b, tick } = pair(25);
    tick(1500);
    a.command({ t: 'tray', id: 1 });
    b.command({ t: 'tray', id: 2 });
    tick(8000);
    expect(a.sim.player(1).cash).toBe(b.sim.player(1).cash);
    expect(a.sim.player(2).cash).toBe(b.sim.player(2).cash);
    expect(a.sim.hash()).toBe(b.sim.hash());
  });
  it('reports measured RTT', () => {
    const { a, tick } = pair(40);
    tick(7000);
    expect(a.status.rtt).toBeGreaterThan(60);
    expect(a.status.rtt).toBeLessThan(120);
  });
});
