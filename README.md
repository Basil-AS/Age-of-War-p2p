# Age of War — 1v1 online

The original Flash **Age of War** (650×450, 40 fps), ported to a modern web stack and playable
against a friend straight from the browser. Graphics, animations, sounds, UI and unit stats are the
original ones, extracted from the game's SWF; the game logic is a deterministic TypeScript port of
its ActionScript.

**Play:** https://basil-as.github.io/Age-of-War-p2p/ — open it, pick *Play with a friend*, send the link.

## Stack
Vite 8 · TypeScript · PixiJS 8 (own mini Flash display-list engine) · Svelte 5 overlays · Tailwind 4 ·
Trystero / WebRTC · Vitest · Playwright · Biome · PWA.

## How it works
- `tools/swf/` — parses the SWF and generates `public/orig/` (sprite atlases per era, data tables, sounds, fonts).
  Rebuild with `node tools/swf/build-assets.mjs public/orig && node tools/swf/build-data.mjs public/orig`
  (needs the SWF export, see the env vars at the top of those scripts).
- `src/orig/sim.ts` — deterministic simulation (own PRNG, own trig) so two browsers stay in lockstep.
- `src/net/` — lockstep (4-tick turns, input delay, state hash check) over a **connection ladder**.

## Connection ladder (fault tolerant)
The host listens on every route at once; the guest walks down them. First live peer wins, direct routes get a head start.

| # | Route | Notes |
|---|-------|-------|
| 0 | **LAN** (`server/lan.mjs`) | same network, no internet, ≈1 ms |
| 1–3 | WebRTC, signalling via Nostr / BitTorrent / MQTT | direct P2P, lowest ping |
| 4 | WebRTC via TURN (443/TCP too) | strict NAT, blocked UDP |
| 5–6 | Game frames over Nostr / MQTT relays (wss) | no WebRTC at all |
| 7 | Your own relay (`?ws=`, `VITE_WS_RELAY`) | `server/relay.mjs` |
| – | Manual copy-paste codes (works on LAN with no internet) | no servers |

The ping badge turns red above 150 ms. For consistently low ping (e.g. from Russia) host your own
TURN + relay near both players: see [`deploy/`](deploy/) — build with `VITE_TURN` / `VITE_WS_RELAY`.

### Same local network
```
npm ci && npm run build && node server/lan.mjs      # prints http://192.168.x.x:8080
```
Both players open that address → *Play with a friend*. Works without internet.

## Opponent AI
Settings → *Opponent AI*: **Smart** (default; the bot pays for units/turrets, earns gold/xp from kills,
evolves, buys slots, uses its special) or **Classic** (the original script that spawns units for free).

## Develop
```
npm ci
npm run dev        # http://localhost:5173
npm test           # sim + lockstep unit tests
npm run e2e        # Playwright (visual, solo, PvP over BroadcastChannel and WS relay)
```

See [`docs/COMPARISON.md`](docs/COMPARISON.md) for how this relates to other open-source clones and [`NOTICE.md`](NOTICE.md) for credits.
