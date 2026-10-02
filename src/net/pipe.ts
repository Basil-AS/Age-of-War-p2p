/** A dumb, unreliable, broadcast-style string channel (relay, broker, socket…). */
export interface Pipe {
  /** resolves once at least one underlying connection is open; rejects if all fail */
  ready: Promise<void>;
  send(data: string): void;
  onData: ((data: string) => void) | null;
  close(): void;
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** AES-GCM sealing keyed by the room code: relays only ever see ciphertext. */
export async function makeSealer(code: string) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`age-of-war-p2p|${code}`));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  return {
    async seal(text: string): Promise<string> {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
      const out = new Uint8Array(12 + ct.length);
      out.set(iv);
      out.set(ct, 12);
      return b64(out);
    },
    async open(data: string): Promise<string | null> {
      try {
        const u = unb64(data);
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12));
        return new TextDecoder().decode(pt);
      } catch {
        return null; // not ours / tampered
      }
    },
  };
}
