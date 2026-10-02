import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_NOSTR_RELAYS } from '../src/net/nostrpipe';
import { rankedMqtt, rankedNostr, rankRelays, resetRelayRank } from '../src/net/relayrank';

/** fake WebSocket: answers after a per-url delay, or errors for unreachable ones */
const ws = (delays: Record<string, number>) =>
  class {
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    constructor(url: string) {
      const d = delays[url];
      setTimeout(() => (d === undefined ? this.onerror?.() : this.onopen?.()), d ?? 1);
    }
    close() {}
  };
const env = (d: Record<string, number>) => ({ WebSocket: ws(d) as never, now: () => performance.now() });

describe('relay ranking', () => {
  beforeEach(() => resetRelayRank());

  it('orders reachable relays by speed and drops blocked ones', async () => {
    const [a, b, c] = DEFAULT_NOSTR_RELAYS as [string, string, string];
    const r = await rankRelays(env({ [a]: 60, [b]: 10, [c]: 30 }), 500);
    expect(r.nostr).toEqual([b, c, a]);
    expect(r.nostr).not.toContain(DEFAULT_NOSTR_RELAYS[3]); // unreachable in the fake
    expect(rankedNostr()).toEqual([b, c, a]);
  });
  it('keeps at most 4 Nostr relays', async () => {
    const d = Object.fromEntries(DEFAULT_NOSTR_RELAYS.map((u, i) => [u, 5 + i * 3]));
    const r = await rankRelays(env(d), 500);
    expect(r.nostr.length).toBe(4);
    expect(r.nostr[0]).toBe(DEFAULT_NOSTR_RELAYS[0]);
  });
  it('falls back to the built-in defaults (undefined) when nothing is reachable', async () => {
    await rankRelays(env({}), 100);
    expect(rankedNostr()).toBeUndefined();
    expect(rankedMqtt()).toBeUndefined();
  });
});
