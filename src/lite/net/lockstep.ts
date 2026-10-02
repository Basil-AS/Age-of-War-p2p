import type { Msg, Transport } from '../../net/transport';
import { SIM_HZ } from '../sim/data';
import type { Sim } from '../sim/sim';
import type { Cmd, Side } from '../sim/types';

export const MAX_CATCHUP_MS = 1500; // keep real-time speed on slow-rendering devices
export const TURN_TICKS = 4; // one network turn = 4 sim ticks ≈ 98 ms
const TICK_MS = 1000 / SIM_HZ;
const HASH_EVERY = 5; // turns

export interface MatchStatus {
  stalled: boolean;
  desync: boolean;
  peerLeft: boolean;
  rtt: number;
  /** extra input delay in turns */
  delay: number;
}

/**
 * Deterministic lockstep: both browsers run the identical simulation and exchange only the
 * *commands* issued each turn (a few bytes). A turn executes once both players' commands for it
 * are known. Commands are scheduled `delay` turns ahead so the network can hide latency.
 * Periodic state hashes catch any desync immediately.
 */
export class Lockstep {
  turn = 0;
  private tickInTurn = 0;
  private acc = 0;
  private last = 0;
  private outbox: Cmd[] = [];
  private local = new Map<number, Cmd[]>();
  private remote = new Map<number, Cmd[]>();
  private sentUpTo: number;
  private myHash = new Map<number, number>();
  private theirHash = new Map<number, number>();
  private pingAt = 0;
  status: MatchStatus;
  /** non-lockstep messages (rematch, bye, …) */
  onOther: ((m: Msg) => void) | null = null;

  constructor(
    readonly sim: Sim,
    readonly side: Side,
    private tr: Transport,
    readonly delay: number,
  ) {
    for (let n = 0; n < delay; n++) {
      this.local.set(n, []);
      this.remote.set(n, []);
    }
    this.sentUpTo = delay - 1;
    this.status = { stalled: false, desync: false, peerLeft: false, rtt: 0, delay };
    tr.onMessage = (m) => this.recv(m);
    tr.onLeave = () => {
      this.status.peerLeft = true;
    };
  }

  command(c: Cmd) {
    if (this.sim.winner === -1) this.outbox.push(c);
  }

  private recv(m: Msg) {
    switch (m.k) {
      case 'turn':
        this.remote.set(m.n, m.cmds as unknown as Cmd[]);
        if (m.h !== undefined && m.hn !== undefined) {
          this.theirHash.set(m.hn, m.h);
          this.compare(m.hn);
        }
        break;
      case 'ping':
        this.tr.send({ k: 'pong', t: m.t });
        break;
      case 'pong': {
        const rtt = performance.now() - m.t;
        this.status.rtt = this.status.rtt ? this.status.rtt * 0.7 + rtt * 0.3 : rtt;
        break;
      }
      case 'bye':
        this.status.peerLeft = true;
        this.onOther?.(m);
        break;
      default:
        this.onOther?.(m);
    }
  }

  private compare(n: number) {
    const a = this.myHash.get(n);
    const b = this.theirHash.get(n);
    if (a === undefined || b === undefined) return;
    if (a !== b) this.status.desync = true;
    this.myHash.delete(n);
    this.theirHash.delete(n);
  }

  /** Advance the simulation to wall-clock time `now` (ms). Returns number of ticks executed. */
  update(now: number, speed = 1): number {
    const dt = Math.min(MAX_CATCHUP_MS, Math.max(0, now - (this.last || now)));
    this.last = now;
    if (now - this.pingAt > 2000) {
      this.pingAt = now;
      this.tr.send({ k: 'ping', t: performance.now() });
    }
    this.acc += dt * speed;
    let ran = 0;
    while (this.acc >= TICK_MS && this.sim.winner === -1) {
      if (this.tickInTurn === 0) {
        if (!this.remote.has(this.turn)) {
          this.status.stalled = true;
          this.acc = Math.min(this.acc, TICK_MS);
          return ran;
        }
        this.status.stalled = false;
        if (this.sentUpTo < this.turn + this.delay) {
          const cmds = this.outbox.splice(0);
          const n = this.turn + this.delay;
          this.local.set(n, cmds);
          const msg: Msg = { k: 'turn', n, cmds };
          if (this.turn % HASH_EVERY === 0) {
            const h = this.sim.hash();
            msg.hn = this.turn;
            msg.h = h;
            this.myHash.set(this.turn, h);
            this.compare(this.turn);
          }
          this.tr.send(msg);
          this.sentUpTo = n;
        }
        const mine = this.local.get(this.turn) ?? [];
        const theirs = this.remote.get(this.turn) ?? [];
        this.local.delete(this.turn);
        this.remote.delete(this.turn);
        if (this.side === 0) this.sim.step(mine, theirs);
        else this.sim.step(theirs, mine);
      } else this.sim.step();
      ran++;
      this.acc -= TICK_MS;
      if (++this.tickInTurn === TURN_TICKS) {
        this.tickInTurn = 0;
        this.turn++;
      }
    }
    if (this.sim.winner !== -1) this.acc = 0;
    return ran;
  }

  /** 0..1 progress to the next tick, for render interpolation */
  get alpha(): number {
    return Math.min(1, this.acc / TICK_MS);
  }

  send(m: Msg) {
    this.tr.send(m);
  }

  /** stop driving the sim but keep the transport open (used for rematches) */
  release() {
    this.onOther = null;
  }

  destroy() {
    try {
      this.tr.send({ k: 'bye' });
    } catch {
      /* channel already gone */
    }
    this.tr.close();
  }
}

export const turnMs = TURN_TICKS * TICK_MS;
