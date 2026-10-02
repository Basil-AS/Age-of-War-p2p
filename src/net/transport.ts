import type { Cmd } from '../sim/types';

/** Everything that crosses the wire. Tiny JSON — a whole match is a few KB. */
export type Msg =
  | { k: 'hello'; name: string }
  | { k: 'init'; seed: number; delay: number; hostName: string }
  | { k: 'turn'; n: number; cmds: Cmd[]; hn?: number; h?: number }
  | { k: 'ping'; t: number }
  | { k: 'pong'; t: number }
  | { k: 'rematch' }
  | { k: 'bye' };

/** A reliable, ordered, point-to-point channel to exactly one remote peer. */
export interface Transport {
  send(m: Msg): void;
  onMessage: ((m: Msg) => void) | null;
  /** fires once when the (single) remote peer is connected and ready */
  onJoin: (() => void) | null;
  onLeave: (() => void) | null;
  /** true once the remote peer is connected */
  connected: boolean;
  close(): void;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRoomCode(len = 5): string {
  const b = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
}
export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').slice(0, 8);
}
