import { DEFAULT_MQTT_BROKERS } from './mqttpipe';
import { type Env, wsPing } from './netcheck';
import { DEFAULT_NOSTR_RELAYS } from './nostrpipe';

export interface Ranked {
  nostr: string[];
  mqtt: string[];
  at: number;
}

const TTL_MS = 10 * 60_000;
const KEEP = { nostr: 4, mqtt: 3 };
let cache: Ranked | null = null;
let inflight: Promise<Ranked> | null = null;

const load = (): Ranked | null => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  try {
    const raw = sessionStorage.getItem('aow.relayrank');
    if (raw) {
      const r = JSON.parse(raw) as Ranked;
      if (Date.now() - r.at < TTL_MS) return (cache = r);
    }
  } catch {
    /* storage blocked */
  }
  return null;
};

/**
 * Probes every default Nostr relay / MQTT broker from this network and remembers the reachable ones,
 * fastest first. Dead or blocked servers are dropped so the connection ladder does not waste its
 * first seconds on them; if nothing answers we keep the defaults (never make things worse).
 */
export function rankRelays(env?: Env, timeoutMs = 2500): Promise<Ranked> {
  const fresh = load();
  if (fresh) return Promise.resolve(fresh);
  if (inflight) return inflight;
  const e: Env | undefined = env;
  const probe = async (urls: string[], keep: number) => {
    const rs = await Promise.all(
      urls.map(async (u) => ({
        u,
        ...(await wsPing(
          e ?? { WebSocket: typeof WebSocket === 'undefined' ? undefined : WebSocket, now: () => performance.now() },
          u,
          timeoutMs,
        )),
      })),
    );
    return rs
      .filter((r) => r.ok)
      .sort((a, b) => a.ms - b.ms)
      .slice(0, keep)
      .map((r) => r.u);
  };
  inflight = Promise.all([probe(DEFAULT_NOSTR_RELAYS, KEEP.nostr), probe(DEFAULT_MQTT_BROKERS, KEEP.mqtt)]).then(
    ([nostr, mqtt]) => {
      cache = { nostr, mqtt, at: Date.now() };
      try {
        sessionStorage.setItem('aow.relayrank', JSON.stringify(cache));
      } catch {
        /* ignore */
      }
      inflight = null;
      return cache;
    },
  );
  return inflight;
}

/** undefined = "no data / nothing reachable": callers then use the built-in defaults */
export const rankedNostr = (): string[] | undefined => {
  const r = load();
  return r?.nostr.length ? r.nostr : undefined;
};
export const rankedMqtt = (): string[] | undefined => {
  const r = load();
  return r?.mqtt.length ? r.mqtt : undefined;
};

/** test helper */
export const resetRelayRank = () => {
  cache = null;
  inflight = null;
};
