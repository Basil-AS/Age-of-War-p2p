import type { Msg, Transport } from './transport';

/** In-memory pair of transports with configurable one-way latency/jitter (for tests). */
export function createLoopbackPair(opts: {
  latencyMs?: number;
  jitterMs?: number;
  clock: { now(): number };
}): [Transport & { pump(): void }, Transport & { pump(): void }] {
  const { latencyMs = 0, jitterMs = 0, clock } = opts;
  type Pending = { at: number; m: Msg };
  const boxes: [Pending[], Pending[]] = [[], []];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const make = (me: 0 | 1): Transport & { pump(): void } => {
    let lastAt = 0;
    const t: Transport & { pump(): void } = {
      onMessage: null,
      onJoin: null,
      onLeave: null,
      connected: true,
      send: (m) => {
        // keep per-channel ordering (reliable + ordered), like an RTCDataChannel
        const at = Math.max(lastAt, clock.now() + latencyMs + rnd() * jitterMs);
        lastAt = at;
        boxes[(1 - me) as 0 | 1].push({ at, m });
      },
      close: () => {},
      pump: () => {
        const box = boxes[me];
        while (box.length && (box[0] as Pending).at <= clock.now()) {
          const { m } = box.shift() as Pending; // dropped if the other side is not listening yet (like a real channel)
          t.onMessage?.(m);
        }
      },
    };
    return t;
  };
  return [make(0), make(1)];
}
