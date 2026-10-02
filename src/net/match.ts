import { FPS, OrigSim, type SimOpts } from '../orig/sim';
import type { Cmd, OrigData, Side } from '../orig/types';
import { Lockstep, MAX_CATCHUP_MS, type MatchStatus } from './lockstep';
import type { Msg, Transport } from './transport';

const TICK_MS = 1000 / FPS;

/** What the UI/renderer talks to — identical for single-player and online play. */
export interface Match {
  readonly sim: OrigSim;
  readonly side: Side;
  readonly online: boolean;
  readonly status: MatchStatus;
  speed: number;
  command(c: Cmd): void;
  update(now: number): void;
  onTick: (() => void) | null;
  onOther: ((m: Msg) => void) | null;
  send(m: Msg): void;
  /** hand the transport over to a successor match without closing it */
  release?(): void;
  destroy(): void;
}

export class SoloMatch implements Match {
  readonly sim: OrigSim;
  readonly side: Side = 1;
  readonly online = false;
  readonly status: MatchStatus = { stalled: false, desync: false, peerLeft: false, rtt: 0, delay: 0 };
  speed = 1;
  onTick: (() => void) | null = null;
  onOther: ((m: Msg) => void) | null = null;
  private pending: Cmd[] = [];
  private acc = 0;
  private last = 0;

  constructor(data: OrigData, seed: number, opts: SimOpts) {
    this.sim = new OrigSim(data, seed, opts);
  }
  command(c: Cmd) {
    this.pending.push(c);
  }
  update(now: number) {
    const dt = Math.min(MAX_CATCHUP_MS, Math.max(0, now - (this.last || now)));
    this.last = now;
    this.acc += dt * this.speed;
    while (this.acc >= TICK_MS && !this.sim.winner) {
      this.sim.step(this.pending.splice(0));
      this.onTick?.();
      this.acc -= TICK_MS;
    }
    if (this.sim.winner) this.acc = 0;
  }
  send() {}
  destroy() {}
}

export class OnlineMatch implements Match {
  readonly online = true;
  speed = 1;
  private ls: Lockstep;
  constructor(data: OrigData, seed: number, side: Side, tr: Transport, delay: number, opts: SimOpts) {
    this.ls = new Lockstep(new OrigSim(data, seed, opts), side, tr, delay);
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
  get onTick() {
    return this.ls.onTick;
  }
  set onTick(f) {
    this.ls.onTick = f;
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
