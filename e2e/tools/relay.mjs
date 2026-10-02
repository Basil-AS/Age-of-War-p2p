// Minimal in-memory Nostr relay (NIP-01 subset) so the real Trystero/WebRTC path can be tested offline.
import { WebSocketServer } from 'ws';

const port = Number(process.env.RELAY_PORT || 7777);
const wss = new WebSocketServer({ port });
const subs = new Map(); // ws -> Map(subId -> filters[])

wss.on('connection', (ws) => {
  subs.set(ws, new Map());
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    const [type, a, b] = msg;
    if (type === 'REQ') subs.get(ws).set(a, msg.slice(2));
    else if (type === 'CLOSE') subs.get(ws).delete(a);
    else if (type === 'EVENT') {
      ws.send(JSON.stringify(['OK', a.id, true, '']));
      for (const [peer, map] of subs) {
        for (const [subId, filters] of map) {
          const hit = filters.some((f) => (!f.kinds || f.kinds.includes(a.kind)) && (!f['#x'] || a.tags.some((t) => t[0] === 'x' && f['#x'].includes(t[1]))));
          if (hit && peer.readyState === 1) peer.send(JSON.stringify(['EVENT', subId, a]));
        }
      }
    }
    void b;
  });
  ws.on('close', () => subs.delete(ws));
});
console.log(`relay listening on ws://localhost:${port}`);
