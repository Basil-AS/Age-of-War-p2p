import type { Pipe } from './pipe';

/** Optional: your own tiny WebSocket room relay (see server/relay.mjs) — `?ws=wss://host`. */
export function createWsPipe(code: string, base: string): Pipe {
  let ws: WebSocket | null = null;
  let closed = false;
  const queue: string[] = [];
  const pipe: Pipe = {
    onData: null,
    ready: undefined as unknown as Promise<void>,
    send(d) {
      if (ws?.readyState === 1) ws.send(d);
      else if (queue.length < 100) queue.push(d);
    },
    close() {
      closed = true;
      ws?.close();
    },
  };
  pipe.ready = new Promise<void>((resolve, reject) => {
    let first = true;
    const open = (attempt = 0) => {
      if (closed) return;
      const u = new URL(base);
      u.searchParams.set('room', code);
      ws = new WebSocket(u.toString());
      ws.onopen = () => {
        for (const q of queue.splice(0)) ws?.send(q);
        if (first) {
          first = false;
          resolve();
        }
      };
      ws.onmessage = (e) => pipe.onData?.(String(e.data));
      ws.onclose = () => {
        if (first && attempt >= 2) reject(new Error('ws relay unreachable'));
        else if (!closed) setTimeout(() => open(attempt + 1), Math.min(10000, 1000 * 2 ** attempt));
      };
    };
    open();
  });
  return pipe;
}
