import { schnorr } from '@noble/secp256k1';
import { type Pipe, sha256Hex } from './pipe';

export const DEFAULT_NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://offchain.pub',
  'wss://relay.snort.social',
  'wss://nostr.mom',
];
const KIND = 22714; // ephemeral range: relays forward but never store
const hex = (u: Uint8Array) => Array.from(u, (x) => x.toString(16).padStart(2, '0')).join('');

/**
 * Last-resort data path that needs nothing but outbound WebSocket (wss/443): game frames are
 * published as signed ephemeral Nostr events to several public relays in parallel and read back.
 * Works even when UDP/WebRTC is blocked completely.
 */
export function createNostrPipe(code: string, urls: string[] = DEFAULT_NOSTR_RELAYS): Pipe {
  const { secretKey, publicKey } = schnorr.keygen();
  const pubkey = hex(publicKey);
  const sockets = new Map<string, WebSocket>();
  const seen = new Set<string>();
  const subId = Math.random().toString(36).slice(2, 12);
  let topic = '';
  let closed = false;
  const pipe: Pipe = {
    onData: null,
    ready: undefined as unknown as Promise<void>,
    send(data) {
      void publish(data);
    },
    close() {
      closed = true;
      for (const ws of sockets.values()) {
        try {
          ws.close();
        } catch {
          /* already closed */
        }
      }
    },
  };

  async function publish(content: string) {
    if (!topic) return;
    const created_at = Math.floor(Date.now() / 1000);
    const tags = [['x', topic]];
    const idBytes = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify([0, pubkey, created_at, KIND, tags, content])),
      ),
    );
    const sig = hex(await schnorr.signAsync(idBytes, secretKey));
    const msg = JSON.stringify(['EVENT', { id: hex(idBytes), pubkey, created_at, kind: KIND, tags, content, sig }]);
    for (const ws of sockets.values()) if (ws.readyState === 1) ws.send(msg);
  }

  function connect(url: string, attempt = 0, onFirstOpen?: () => void) {
    if (closed) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    sockets.set(url, ws);
    ws.onopen = () => {
      ws.send(
        JSON.stringify(['REQ', subId, { kinds: [KIND], '#x': [topic], since: Math.floor(Date.now() / 1000) - 10 }]),
      );
      onFirstOpen?.();
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(String(e.data)) as [string, string, { id: string; pubkey: string; content: string }];
        if (m[0] !== 'EVENT' || m[2].pubkey === pubkey || seen.has(m[2].id)) return;
        seen.add(m[2].id);
        if (seen.size > 4000) seen.clear();
        pipe.onData?.(m[2].content);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      sockets.delete(url);
      if (!closed) setTimeout(() => connect(url, attempt + 1), Math.min(15000, 1000 * 2 ** attempt));
    };
    ws.onerror = () => ws.close();
  }

  pipe.ready = new Promise<void>((resolve, reject) => {
    void sha256Hex(`aow-nostr-data|${code}`).then((h) => {
      topic = h.slice(0, 40);
      let opened = false;
      for (const u of urls) {
        connect(u, 0, () => {
          if (!opened) {
            opened = true;
            resolve();
          }
        });
      }
      setTimeout(() => !opened && reject(new Error('no Nostr relay reachable')), 20000);
    });
  });
  return pipe;
}
