/**
 * Browsers pause requestAnimationFrame in background tabs, which would stall the *other* player of
 * an online lockstep match. A worker timer is not throttled the same way, so `tick` keeps being
 * called every ~20 ms; the caller decides what to do (only when `document.hidden`).
 */
export function startKeepAlive(tick: () => void): () => void {
  try {
    const url = URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),20)'], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = tick;
    return () => {
      w.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    return () => {};
  }
}
