import type { Msg, Transport } from './transport';

export type Relay = 'nostr' | 'torrent' | 'mqtt';
const APP_ID = 'age-of-war-p2p.basil-as.v1';

export const STUN = [
  'stun:stun.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
  'stun:stun.nextcloud.com:443',
  'stun:global.stun.twilio.com:3478',
];

export interface TurnServer {
  urls: string | string[];
  username: string;
  credential: string;
}

/** Free public TURN (best effort — rate limited, can disappear). Override with `?turn=url|user|pass`. */
export const PUBLIC_TURN: TurnServer[] = [
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turns:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export interface TrysteroOpts {
  relay?: Relay;
  /** force all traffic through TURN (works through strict NAT / UDP-blocking networks when TCP/443 TURN is reachable) */
  turn?: TurnServer[];
  relayUrls?: string[];
  /** room namespace suffix so several attempts for one code do not collide */
  suffix?: string;
}

/**
 * WebRTC data-channel transport. Trystero uses public relays (Nostr / BitTorrent trackers / MQTT)
 * only to introduce the two browsers to each other — after that, game traffic is direct P2P.
 */
export async function createTrysteroTransport(
  code: string,
  opts: TrysteroOpts = {},
): Promise<Transport & { kind: 'webrtc' }> {
  const { relay = 'nostr', turn, relayUrls, suffix = '' } = opts;
  if (typeof RTCPeerConnection === 'undefined') throw new Error('WebRTC is not available in this browser');
  const mod =
    relay === 'torrent'
      ? await import('@trystero-p2p/torrent')
      : relay === 'mqtt'
        ? await import('@trystero-p2p/mqtt')
        : await import('@trystero-p2p/nostr');
  const room = mod.joinRoom(
    {
      appId: APP_ID,
      password: `aow-${code}${suffix}`,
      ...(relayUrls?.length ? { relayConfig: { urls: relayUrls } } : {}),
      rtcConfig: {
        iceServers: [{ urls: STUN }, ...(turn ?? [])],
        ...(turn ? { iceTransportPolicy: 'relay' as RTCIceTransportPolicy } : {}),
      },
    },
    `${code}${suffix}`,
  );
  const action = room.makeAction<Msg>('m');
  let peer: string | null = null;
  const t: Transport & { kind: 'webrtc' } = {
    kind: 'webrtc',
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
