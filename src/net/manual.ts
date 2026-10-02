import type { Msg, Transport } from './transport';

import { STUN } from './trystero';

const ICE = [{ urls: STUN }];

async function pack(obj: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let out: Uint8Array = bytes;
  let tag = 'R';
  if ('CompressionStream' in window) {
    const cs = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    out = new Uint8Array(await new Response(cs).arrayBuffer());
    tag = 'Z';
  }
  let s = '';
  for (const b of out) s += String.fromCharCode(b);
  return `AOW1${tag}.${btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

async function unpack<T>(code: string): Promise<T> {
  const m = /^AOW1([ZR])\.([A-Za-z0-9_-]+)$/.exec(code.trim().replace(/\s+/g, ''));
  if (!m) throw new Error('bad code');
  const b64 = (m[2] as string).replace(/-/g, '+').replace(/_/g, '/');
  const raw = Uint8Array.from(atob(b64 + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
  let bytes: Uint8Array = raw;
  if (m[1] === 'Z') {
    const ds = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(ds).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

type Desc = { t: 'o' | 'a'; sdp: string };

/**
 * No-server mode: the two players swap two short text codes through any messenger.
 * Pure WebRTC with STUN — nothing but the players' browsers is involved.
 */
export class ManualPeer {
  readonly transport: Transport & { kind: 'direct' };
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;

  /** lan: same-network play — no STUN, host candidates only, so it works with no internet at all */
  constructor(lan = false) {
    this.pc = new RTCPeerConnection({ iceServers: lan ? [] : ICE });
    const t: Transport & { kind: 'direct' } = {
      kind: 'direct',
      connected: false,
      onMessage: null,
      onJoin: null,
      onLeave: null,
      send: (m: Msg) => {
        if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(m));
      },
      close: () => {
        this.dc?.close();
        this.pc.close();
      },
    };
    this.transport = t;
    this.pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(this.pc.connectionState) && t.connected) {
        t.connected = false;
        t.onLeave?.();
      }
    };
    this.pc.ondatachannel = (e) => this.bind(e.channel);
  }

  private bind(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => {
      this.transport.connected = true;
      this.transport.onJoin?.();
    };
    dc.onmessage = (e) => this.transport.onMessage?.(JSON.parse(String(e.data)) as Msg);
    dc.onclose = () => {
      if (this.transport.connected) {
        this.transport.connected = false;
        this.transport.onLeave?.();
      }
    };
  }

  private async gathered(): Promise<void> {
    if (this.pc.iceGatheringState === 'complete') return;
    await new Promise<void>((res) => {
      const done = () => {
        if (this.pc.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', done);
          res();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', done);
      setTimeout(res, 5000); // good enough: whatever candidates we have
    });
  }

  /** Host step 1 — returns the code to send to the friend. */
  async createOffer(): Promise<string> {
    this.bind(this.pc.createDataChannel('m', { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this.gathered();
    return pack({ t: 'o', sdp: (this.pc.localDescription as RTCSessionDescription).sdp } satisfies Desc);
  }

  /** Guest — paste the host's code, get an answer code to send back. */
  async acceptOffer(code: string): Promise<string> {
    const d = await unpack<Desc>(code);
    if (d.t !== 'o') throw new Error('not an offer');
    await this.pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await this.gathered();
    return pack({ t: 'a', sdp: (this.pc.localDescription as RTCSessionDescription).sdp } satisfies Desc);
  }

  /** Host step 2 — paste the guest's answer; the channel opens by itself. */
  async acceptAnswer(code: string): Promise<void> {
    const d = await unpack<Desc>(code);
    if (d.t !== 'a') throw new Error('not an answer');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
  }
}
