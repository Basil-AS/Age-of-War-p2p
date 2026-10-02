// Same-network play, no internet needed:
//   npm run build && node server/lan.mjs        (PORT=8080 by default)
// One player runs this, both open  http://<printed LAN address>:8080  — the game is served from here
// and the built-in WebSocket relay (/ws) connects the two browsers over the local network (≈1 ms ping).
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT || 8080);
const root = resolve(process.env.DIST || 'dist');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};

const http = createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
    if (p.endsWith('/') || p === '.') p = join(p, 'index.html');
    const file = join(root, p);
    if (!file.startsWith(root)) throw new Error('bad path');
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const rooms = new Map();
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 256 * 1024 });
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

http.listen(port, '0.0.0.0', () => {
  console.log(`\nAge of War — LAN server. Both players open one of:`);
  for (const list of Object.values(networkInterfaces()))
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) console.log(`  http://${i.address}:${port}`);
  console.log(`  http://localhost:${port}   (this computer)\n`);
});
