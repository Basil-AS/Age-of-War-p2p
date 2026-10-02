import { turnMs } from './lockstep';
import type { Msg, Transport } from './transport';

export interface Handshake {
  seed: number;
  delay: number;
  side: 0 | 1;
  peerName: string;
}

/**
 * Host: waits for the friend, measures round-trip time, picks the input delay and the shared RNG
 * seed, and tells the guest. Guest: just waits for that `init`.
 */
export function hostHandshake(tr: Transport, name: string, seed = (Math.random() * 2 ** 32) >>> 0): Promise<Handshake> {
  return new Promise((resolve) => {
    let peerName = 'Friend';
    const rtts: number[] = [];
    const ping = () => tr.send({ k: 'ping', t: performance.now() });
    tr.onMessage = (m: Msg) => {
      if (m.k === 'ping') tr.send({ k: 'pong', t: m.t });
      else if (m.k === 'hello') peerName = m.name;
      else if (m.k === 'pong') {
        rtts.push(performance.now() - m.t);
        if (rtts.length < 4) return ping();
        rtts.sort((a, b) => a - b);
        const rtt = rtts[Math.floor(rtts.length / 2)] as number;
        const delay = Math.min(8, Math.max(2, Math.ceil(rtt / 2 / turnMs) + 1));
        tr.send({ k: 'init', seed, delay, hostName: name });
        resolve({ seed, delay, side: 0, peerName });
      }
    };
    if (tr.connected) ping();
    else tr.onJoin = ping;
  });
}

export function guestHandshake(tr: Transport, name: string): Promise<Handshake> {
  return new Promise((resolve) => {
    tr.onMessage = (m: Msg) => {
      if (m.k === 'ping') tr.send({ k: 'pong', t: m.t });
      else if (m.k === 'init') resolve({ seed: m.seed, delay: m.delay, side: 1, peerName: m.hostName });
    };
    const hello = () => tr.send({ k: 'hello', name });
    if (tr.connected) hello();
    else tr.onJoin = hello;
  });
}
