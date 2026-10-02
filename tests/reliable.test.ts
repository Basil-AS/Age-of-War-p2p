import { describe, expect, it } from 'vitest';
import type { Pipe } from '../src/net/pipe';
import { createReliableTransport } from '../src/net/reliable';
import type { Msg } from '../src/net/transport';

/** Two ends of a nasty broadcast medium: drops, duplicates, reorders, delays. */
function nastyPair(loss: number, dup: number, maxDelay: number): [Pipe, Pipe] {
  const mk = (): Pipe => ({ onData: null, ready: Promise.resolve(), send() {}, close() {} });
  const a = mk();
  const b = mk();
  const wire = (from: Pipe, to: Pipe) => {
    from.send = (d) => {
      const copies = Math.random() < dup ? 2 : 1;
      for (let i = 0; i < copies; i++) {
        if (Math.random() < loss) continue;
        setTimeout(() => to.onData?.(d), Math.random() * maxDelay);
      }
    };
  };
  wire(a, b);
  wire(b, a);
  return [a, b];
}

describe('reliable transport over a lossy relay', () => {
  it('delivers everything exactly once, in order, both directions (30% loss, dups, reorder)', async () => {
    const [pa, pb] = nastyPair(0.3, 0.2, 40);
    const opts = { flushMs: 15, heartbeatMs: 60, deadMs: 5000 };
    const [ta, tb] = await Promise.all([
      createReliableTransport(pa, 'TESTCODE', opts),
      createReliableTransport(pb, 'TESTCODE', opts),
    ]);
    const gotA: number[] = [];
    const gotB: number[] = [];
    ta.onMessage = (m: Msg) => m.k === 'turn' && gotA.push(m.n);
    tb.onMessage = (m: Msg) => m.k === 'turn' && gotB.push(m.n);
    await new Promise<void>((r) => {
      let n = 0;
      ta.onJoin = tb.onJoin = () => ++n === 2 && r();
      setTimeout(r, 3000);
    });
    expect(ta.connected && tb.connected).toBe(true);
    for (let i = 0; i < 150; i++) {
      ta.send({ k: 'turn', n: i, cmds: [] });
      tb.send({ k: 'turn', n: 1000 + i, cmds: [] });
      await new Promise((r) => setTimeout(r, 4));
    }
    await new Promise((r) => setTimeout(r, 1500));
    expect(gotB).toEqual(Array.from({ length: 150 }, (_, i) => i));
    expect(gotA).toEqual(Array.from({ length: 150 }, (_, i) => 1000 + i));
    ta.close();
    tb.close();
  }, 20000);

  it('ignores frames sealed with a different room code', async () => {
    const [pa, pb] = nastyPair(0, 0, 5);
    const opts = { flushMs: 15, heartbeatMs: 60 };
    const ta = await createReliableTransport(pa, 'ROOM-ONE', opts);
    const tb = await createReliableTransport(pb, 'ROOM-TWO', opts);
    await new Promise((r) => setTimeout(r, 400));
    expect(ta.connected || tb.connected).toBe(false);
    ta.close();
    tb.close();
  });

  it('reports the peer leaving', async () => {
    const [pa, pb] = nastyPair(0, 0, 5);
    const opts = { flushMs: 15, heartbeatMs: 60 };
    const [ta, tb] = await Promise.all([
      createReliableTransport(pa, 'LEAVE', opts),
      createReliableTransport(pb, 'LEAVE', opts),
    ]);
    let left = false;
    ta.onLeave = () => {
      left = true;
    };
    await new Promise((r) => setTimeout(r, 300));
    tb.close();
    await new Promise((r) => setTimeout(r, 600));
    expect(left).toBe(true);
    ta.close();
  });
});
