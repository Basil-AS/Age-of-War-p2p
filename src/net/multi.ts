import type { Msg, Transport } from './transport';

export interface RouteInfo {
  id: string;
  /** smoothed round-trip time in ms (0 = not measured yet) */
  rtt: number;
  alive: boolean;
  /** currently carrying game traffic (best + hot standby) */
  active: boolean;
}

interface Route {
  id: string;
  t: Transport;
  rtt: number;
  lastHeard: number;
}

const PROBE_MS = 1000;
const DEAD_MS = 4000;
const LEAVE_GRACE_MS = 6000;
const SEEN = 1024;

/**
 * Several live routes to the same peer behind one `Transport`.
 *  - every route is probed with tiny RTT pings, so the best one is always known;
 *  - game traffic goes out on the best route *and* a hot standby (de-duplicated on arrival), so the
 *    fastest copy wins and a dying route costs nothing;
 *  - routes that connect later (slower fallbacks, a LAN-direct WebRTC link…) join the pool, and
 *    traffic migrates to them automatically when they measure faster.
 */
export class MultiTransport implements Transport {
  kind = 'multi' as const;
  onMessage: ((m: Msg) => void) | null = null;
  onJoin: (() => void) | null = null;
  onLeave: (() => void) | null = null;
  connected = true;
  private routes: Route[] = [];
  private seq = 0;
  private seen = new Set<number>();
  private probe: ReturnType<typeof setInterval>;
  private noneSince = 0;
  private closed = false;

  constructor() {
    this.probe = setInterval(() => this.tick(), PROBE_MS);
  }

  add(id: string, t: Transport) {
    if (this.closed || this.routes.some((r) => r.id === id)) return;
    const r: Route = { id, t, rtt: 0, lastHeard: performance.now() };
    this.routes.push(r);
    t.onMessage = (m) => {
      r.lastHeard = performance.now();
      this.recv(r, m);
    };
    t.onLeave = () => {
      r.lastHeard = 0;
    };
    this.ping(r);
  }

  private alive(r: Route, now = performance.now()) {
    return r.t.connected && now - r.lastHeard < DEAD_MS;
  }

  private ping(r: Route) {
    if (r.t.connected) r.t.send({ k: 'rtt', t: performance.now() });
  }

  private tick() {
    const now = performance.now();
    for (const r of this.routes) this.ping(r);
    if (this.routes.some((r) => this.alive(r, now))) this.noneSince = 0;
    else if (!this.noneSince) this.noneSince = now;
    else if (now - this.noneSince > LEAVE_GRACE_MS && this.connected) {
      this.connected = false;
      this.onLeave?.();
    }
  }

  private recv(r: Route, m: Msg) {
    if (m.k === 'rtt') {
      if (m.e) {
        const rtt = performance.now() - m.t;
        r.rtt = r.rtt ? r.rtt * 0.7 + rtt * 0.3 : rtt;
      } else r.t.send({ k: 'rtt', t: m.t, e: 1 });
      return;
    }
    const s = (m as Msg & { _s?: number })._s;
    if (s !== undefined) {
      const key = s;
      if (this.seen.has(key)) return;
      this.seen.add(key);
      if (this.seen.size > SEEN) this.seen.delete(this.seen.values().next().value as number);
    }
    this.connected = true;
    this.onMessage?.(m);
  }

  /** routes ordered best → worst (alive first; unmeasured ones rank as "average") */
  private ranked(): Route[] {
    const now = performance.now();
    return this.routes.filter((r) => this.alive(r, now)).sort((a, b) => (a.rtt || 150) - (b.rtt || 150));
  }

  send(m: Msg) {
    const out = { ...m, _s: ++this.seq } as unknown as Msg;
    const live = this.ranked();
    // dedupe origin id = per-sender counter; both directions use their own counter space but
    // each side only de-duplicates what it *receives*, so that is fine.
    for (const r of live.slice(0, 2)) r.t.send(out);
    if (!live.length) for (const r of this.routes) r.t.send(out); // everything looks dead: shout on all
  }

  get best(): string {
    return this.ranked()[0]?.id ?? this.routes[0]?.id ?? '';
  }

  info(): RouteInfo[] {
    const now = performance.now();
    const top = new Set(
      this.ranked()
        .slice(0, 2)
        .map((r) => r.id),
    );
    return this.routes.map((r) => ({
      id: r.id,
      rtt: Math.round(r.rtt),
      alive: this.alive(r, now),
      active: top.has(r.id),
    }));
  }

  close() {
    this.closed = true;
    clearInterval(this.probe);
    for (const r of this.routes) {
      try {
        r.t.close();
      } catch {
        /* already closed */
      }
    }
  }
}
