import { makeSealer, type Pipe } from './pipe';
import type { Msg, Transport } from './transport';

interface Frame {
  i: string; // sender id
  a: number; // cumulative ack: highest contiguous seq received from the other side
  d?: [number, Msg][]; // unacked messages (seq, msg)
  b?: 1; // bye
}

export interface ReliableOpts {
  flushMs?: number;
  heartbeatMs?: number;
  deadMs?: number;
}

/**
 * Turns an unreliable broadcast Pipe (Nostr relay, MQTT broker, WebSocket room…) into the
 * reliable, ordered, 1-to-1 `Transport` the lockstep engine expects:
 * sequence numbers + cumulative acks + retransmission + de-duplication + peer discovery.
 * Everything is AES-GCM sealed with the room code, so relay operators cannot read or forge it.
 */
export async function createReliableTransport(
  pipe: Pipe,
  code: string,
  opts: ReliableOpts = {},
): Promise<Transport & { kind: 'relay' }> {
  const { flushMs = 150, heartbeatMs = 1000, deadMs = 12000 } = opts;
  const sealer = await makeSealer(code);
  const me = Math.random().toString(36).slice(2, 10);
  let peer: string | null = null;
  let nextSend = 1;
  let nextRecv = 1;
  let unacked: [number, Msg][] = [];
  const ahead = new Map<number, Msg>();
  let dirty = true;
  let lastSent = 0;
  let lastHeard = 0;
  let closed = false;
  let sending = false;

  const t: Transport & { kind: 'relay' } = {
    kind: 'relay',
    connected: false,
    onMessage: null,
    onJoin: null,
    onLeave: null,
    send(m) {
      if (!peer) return;
      unacked.push([nextSend++, m]);
      if (unacked.length > 800) unacked.splice(0, unacked.length - 800);
      dirty = true;
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      void emit({ i: me, a: nextRecv - 1, b: 1 }).finally(() => setTimeout(() => pipe.close(), 300));
    },
  };

  async function emit(f: Frame) {
    pipe.send(await sealer.seal(JSON.stringify(f)));
  }

  pipe.onData = async (raw) => {
    const txt = await sealer.open(raw);
    if (txt === null) return;
    let f: Frame;
    try {
      f = JSON.parse(txt) as Frame;
    } catch {
      return;
    }
    if (f.i === me) return;
    if (peer === null) {
      peer = f.i;
      t.connected = true;
      dirty = true;
      t.onJoin?.();
    } else if (f.i !== peer) return;
    lastHeard = Date.now();
    if (f.b) {
      t.connected = false;
      t.onLeave?.();
      return;
    }
    // acks
    if (f.a > 0) unacked = unacked.filter(([s]) => s > f.a);
    // data — deliver strictly in order
    for (const [s, m] of f.d ?? []) if (s >= nextRecv && !ahead.has(s)) ahead.set(s, m);
    let progressed = false;
    for (let m = ahead.get(nextRecv); m !== undefined; m = ahead.get(nextRecv)) {
      ahead.delete(nextRecv++);
      progressed = true;
      t.onMessage?.(m);
    }
    if (progressed) dirty = true;
  };

  const timer = setInterval(async () => {
    if (closed || sending) return;
    const now = Date.now();
    if (peer && t.connected && now - lastHeard > deadMs) {
      t.connected = false;
      t.onLeave?.();
      return;
    }
    // before a peer is known we only ever send hello heartbeats
    const due = now - lastSent >= (peer ? heartbeatMs : 800);
    if (!dirty && !due) return;
    dirty = false;
    lastSent = now;
    sending = true;
    try {
      await emit({ i: me, a: nextRecv - 1, d: unacked.length ? unacked : undefined });
    } finally {
      sending = false;
    }
  }, flushMs);

  await pipe.ready;
  return t;
}
