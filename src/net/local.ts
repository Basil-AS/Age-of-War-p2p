import type { Msg, Transport } from './transport';

type Wire = { from: string; to?: string; m?: Msg; announce?: 'join' | 'leave' | 'here' };

/**
 * Same-device transport over BroadcastChannel: lets two tabs/windows play each other with zero
 * network (and powers the end-to-end tests). Select it with `?net=local`.
 */
export function createLocalTransport(code: string): Transport {
  const id = Math.random().toString(36).slice(2);
  const ch = new BroadcastChannel(`aow-local-${code}`);
  let peer: string | null = null;
  const t: Transport = {
    onMessage: null,
    onJoin: null,
    onLeave: null,
    connected: false,
    send: (m) => {
      if (peer) ch.postMessage({ from: id, to: peer, m } satisfies Wire);
    },
    close: () => {
      ch.postMessage({ from: id, announce: 'leave' } satisfies Wire);
      ch.close();
    },
  };
  const join = (other: string) => {
    if (peer) return;
    peer = other;
    t.connected = true;
    t.onJoin?.();
  };
  ch.onmessage = (e: MessageEvent<Wire>) => {
    const w = e.data;
    if (w.from === id) return;
    if (w.announce === 'join') {
      ch.postMessage({ from: id, announce: 'here' } satisfies Wire);
      join(w.from);
    } else if (w.announce === 'here') join(w.from);
    else if (w.announce === 'leave') {
      if (w.from === peer) {
        peer = null;
        t.connected = false;
        t.onLeave?.();
      }
    } else if (w.to === id && w.m && w.from === peer) t.onMessage?.(w.m);
  };
  ch.postMessage({ from: id, announce: 'join' } satisfies Wire);
  return t;
}
