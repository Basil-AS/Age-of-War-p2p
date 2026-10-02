import type { Msg, Transport } from './transport';

export type Relay = 'nostr' | 'torrent' | 'mqtt';
const APP_ID = 'age-of-war-p2p.basil-as.v1';

/**
 * WebRTC data-channel transport. Trystero uses public relays (Nostr / BitTorrent trackers / MQTT)
 * only to introduce the two browsers to each other — after that, game traffic is direct P2P.
 * Same room code + same relay on both sides = same match. No game server involved.
 */
export async function createTrysteroTransport(code: string, relay: Relay = 'nostr'): Promise<Transport> {
  const mod =
    relay === 'torrent' ? await import('trystero/torrent')
    : relay === 'mqtt' ? await import('trystero/mqtt')
    : await import('trystero/nostr');
  const room = mod.joinRoom(
    {
      appId: APP_ID,
      password: `aow-${code}`,
      rtcConfig: {
        iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }],
      },
    },
    code,
  );
  const action = room.makeAction<Msg>('m');
  let peer: string | null = null;
  const t: Transport = {
    onMessage: null,
    onJoin: null,
    onLeave: null,
    connected: false,
    send: (m) => {
      if (peer) void action.send(m, { target: peer });
    },
    close: () => {
      void room.leave();
    },
  };
  room.onPeerJoin = (id) => {
    if (peer) return; // 1v1 only: ignore a third browser
    peer = id;
    t.connected = true;
    t.onJoin?.();
  };
  room.onPeerLeave = (id) => {
    if (id !== peer) return;
    peer = null;
    t.connected = false;
    t.onLeave?.();
  };
  action.onMessage = (m, ctx) => {
    if (ctx.peerId === peer) t.onMessage?.(m);
  };
  return t;
}
