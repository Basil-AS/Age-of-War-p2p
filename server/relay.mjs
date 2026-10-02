// Optional self-hosted WebSocket room relay — the last-resort route when you want a server you control.
//   node server/relay.mjs            (PORT=8787 by default)
// Clients connect to  wss://your-host/?room=CODE  and every message is forwarded to the other
// sockets in the same room. Messages are AES-GCM sealed by the clients, so this server is blind.
// Point the game at it with  ?ws=wss://your-host   or build with  VITE_WS_RELAY=wss://your-host
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT || 8787);
const rooms = new Map();
const http = createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
  res.end('age-of-war-p2p relay ok\n');
});
const wss = new WebSocketServer({ server: http, maxPayload: 256 * 1024 });

wss.on('connection', (ws, req) => {
  const room = new URL(req.url ?? '/', 'http://x').searchParams.get('room');
  if (!room || room.length > 64) return ws.close(1008, 'room required');
  let set = rooms.get(room);
  if (!set) rooms.set(room, (set = new Set()));
  if (set.size >= 2) return ws.close(1013, 'room full');
  set.add(ws);
  ws.on('message', (data, isBinary) => {
    for (const peer of set) if (peer !== ws && peer.readyState === 1) peer.send(data, { binary: isBinary });
  });
  ws.on('close', () => {
    set.delete(ws);
    if (set.size === 0) rooms.delete(room);
  });
});
http.listen(port, () => console.log(`relay listening on :${port}`));
