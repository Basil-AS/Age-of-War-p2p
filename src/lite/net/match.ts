import type { Msg, Transport } from '../../net/transport';
import { OriginalAI } from '../sim/ai';
import { SIM_HZ } from '../sim/data';
import { Sim } from '../sim/sim';
import type { Cmd, Difficulty, Side } from '../sim/types';
import { Lockstep, MAX_CATCHUP_MS, type MatchStatus } from './lockstep';

const TICK_MS = 1000 / SIM_HZ;

/** What the UI/renderer talks to — identical for single-player and online play. */
export interface Match {
  readonly sim: Sim;
  readonly side: Side;
  readonly online: boolean;
  readonly status: MatchStatus;
  readonly alpha: number;
  speed: number;
  command(c: Cmd): void;
  update(now: number): void;
  onOther: ((m: Msg) => void) | null;
  send(m: Msg): void;
  /** hand the transport over to a successor match without closing it */
  release?(): void;
  destroy(): void;
}

export class SoloMatch implements Match {
  readonly sim: Sim;
  readonly side: Side = 0;
  readonly online = false;
  readonly status: MatchStatus = { stalled: false, desync: false, peerLeft: false, rtt: 0, delay: 0 };
  speed = 1;
  onOther: ((m: Msg) => void) | null = null;
  private ai: OriginalAI;
  private pending: Cmd[] = [];
  private acc = 0;
  private last = 0;

  constructor(seed: number, difficulty: Difficulty) {
    this.sim = new Sim(seed, { free: [false, true] });
    this.ai = new OriginalAI(1, difficulty);
  }
  command(c: Cmd) {
    this.pending.push(c);
  }
  update(now: number) {
    const dt = Math.min(MAX_CATCHUP_MS, Math.max(0, now - (this.last || now)));
    this.last = now;
    this.acc += dt * this.speed;
    while (this.acc >= TICK_MS && this.sim.winner === -1) {
      const mine = this.pending.splice(0);
      this.sim.step(mine, this.ai.think(this.sim));
      this.acc -= TICK_MS;
    }
    if (this.sim.winner !== -1) this.acc = 0;
  }
  get alpha() {
    return Math.min(1, this.acc / TICK_MS);
  }
  send() {}
  destroy() {}
}

export class OnlineMatch implements Match {
  readonly online = true;
  speed = 1;
  private ls: Lockstep;
  constructor(seed: number, side: Side, tr: Transport, delay: number) {
    const sim = new Sim(seed);
    this.ls = new Lockstep(sim, side, tr, delay);
  }
  get sim() {
    return this.ls.sim;
  }
  get side() {
    return this.ls.side;
  }
  get status() {
    return this.ls.status;
  }
  get alpha() {
    return this.ls.alpha;
  }
  get onOther() {
    return this.ls.onOther;
  }
  set onOther(f) {
    this.ls.onOther = f;
  }
  command(c: Cmd) {
    this.ls.command(c);
  }
  update(now: number) {
    this.ls.update(now);
  }
  send(m: Msg) {
    this.ls.send(m);
  }
  release() {
    this.ls.release();
  }
  destroy() {
    this.ls.destroy();
  }
}
