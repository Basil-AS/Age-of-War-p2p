# Study: Pukaty-LR/AgesOfWar (browser RTS, WC3/AoE style; NOT the Flash Age of War)

Paths relative to /home/user/Pukaty-LR/AgesOfWar. Czech-first UI, i18n (7 languages) in client/i18n.js.

## Architecture
- Plain ES modules, no build step. `server/index.js` (408 lines): static HTTP + `ws` WebSocket, lobbies, game rooms, stats, Cloudflare tunnel.
- `shared/` runs on BOTH server and client: `sim.js` (1213 l., Sim class), `data.js` (eras/factions/units), `ai.js`, `mapgen.js`, `pathfinding.js` (A*).
- Client: `client/game.js` (input, interpolation, camera), `ui.js` (HUD), `render/*` (procedural isometric pixel-art sprites, optional 3D), `audio.js` (procedural music/SFX).
- Tests: `tools/smoke.js` (all eras x map styles with 4 AIs), `tools/headless.js` (AI vs AI no browser).

## Rules / numbers
- TICK_RATE 20/s, NET_RATE 20 (server sends every tick, every 2nd when >500 entities), MAX_PLAYERS 8, maps 72/96/128 tiles.
- 2 resources (main from mines: gold/oil/crystal; wood from trees), pop cap via houses (+10/15/20).
- Role archetypes in data.js `commonUnits`: worker 45hp/50g; infantry 120hp a2 dmg13 70g10w; ranged 65hp r5.5; cavalry 170hp spd4.3; siege dmg55 r8 x3 vs buildings; ship. Counter table via `bonus` multipliers (cav x1.3 vs inf pattern: spear x2.2 vs cav, cav x1.6 vs ranged).
- Tier upgrades on buildings (U key), town hall up to tier 4 -> unlocks single hero (aura +20% atk, active skill 12s/60s cd, XP levels 1-5).
- Terrain height: +25% dmg downhill, -25% uphill. Walls + gates (A* wall draw), towers 3 levels, research (atk/armor per class), healers, transports.
- Town hall passively yields +10 main/+5 wood every 15s (anti-stall); centre-of-map endless mine guarded by creeps.
- Win: destroy all enemy buildings (except walls). Neutral "Divocina" creep player (team 99).

## Netcode (authoritative server, NOT lockstep)
- Server owns the single Sim; setInterval at tick/4 with accumulator (max 8 catch-up steps, reset if acc > 10 ticks).
- Clients send `{t:'cmd', c}` -> `sim.command(pid,c)` applied immediately on server (no input delay, no tick stamping). Rate limit 40 cmd/s.
- Server -> client: `start` (map, players, explored) + `fullSnapshot`, then JSON `deltaSnapshot` per net tick to every human. Client interpolates entities between snapshots over measured interval (game.js ~l.430, `snapDt`).
- Reconnect: client sends persistent `token` in `hello`; server maps token -> slot, resends `start`+fullSnapshot; room held 3 min after all humans leave; sim keeps running (AI/other player unaffected). Chat notifies.
- Lag: no prediction/rollback; `ping/pong` message only for display. Commands reach sim at server-arrival time.
- Single-player extras: pause, 1/1.5/2x speed, save/load whole sim (`sim.saveState/loadState` incl. AI state), autosave 3 min.
- Sim uses seeded `mulberry32` (sim.js l.16, ai.js l.8) so maps are reproducible from seed.

## AI difficulty (shared/ai.js, 277 l.)
- easy/normal/hard/impossible (lobby per-bot). Parameters: targetWorkers 9/14/18; easy thinks every 2nd cycle and skips scouting/expansion; attack-wave threshold 14/10/8 units + wave*4 (cap 18-20), min first-attack tick 9/5/2.5 min; hard+ uses a longer build plan (towers, siege, docks, 2nd hall); impossible cheats (+4 main +3 wood per AI update). AI also expands to new mines, builds houses, gates walls, rally point.
- Author feedback (MANAGER NOTES.txt) said AI was too strong -> added the 4 levels.

## UI/UX and mode ideas
- WC3 controls: formation movement, patrol, subgroup Tab, Ctrl-click select-all-type, control groups, F-key camera bookmarks, minimap ping to allies (alt-click), idle-worker key '.', last-attack Space.
- Fog of war with remembered buildings, end-game stats table + army/economy time graph, tips on loading screen, encyclopedia, cursor changes by action, tower range preview, "base+bonus" stat display, locked units greyed with required tier.
- Lobby: seed entry, map style/size, start resources, reveal map, teams/colours, bots with difficulty, rematch with same setup, lobby chat with /t team chat, tribute resources to allies.
- Player notes (MANAGER NOTES.txt): idle units visibility, truncated building sprites, overlapping building UI, too-loud music + mute button, gate on walls, more unit types as tiers (3 tiers x 2 units) - all done later.

## Weaknesses
- Server-authoritative: needs a hosted Node server (they hack Cloudflare tunnel + git-push of docs/current.json); no true P2P.
- Not deterministic enough for lockstep: pathfinding uses wall-clock budget (`performance.now()` in sim.js l.745-749, pathBudget), floats everywhere, AI cheats mutate state, snapshots use JSON (bandwidth heavy), no desync detection/checksums.
- No client prediction -> input lag = RTT; no command tick scheduling; no replays.
- Code style: very long one-liners, no types, giant switch in server, Czech strings as i18n keys; server `handle` mixes lobby/game/save logic.
- Not an Age-of-War-style lane game at all: full RTS with free-roaming units.

## WORTH ADOPTING
- `tools/headless.js` + `tools/smoke.js` pattern: sim with no DOM, AI vs AI regression across configs -> use in CI for our sim (also a determinism test with checksums).
- Sim shared between client/server in pure module with `command(pid, cmd)` + `step()`: `shared/sim.js` - matches lockstep design (our command = tick-stamped).
- Seeded PRNG in the sim (`mulberry32`, sim.js l.16); seed text in lobby (`server/index.js` setMap).
- Token-based identity & rejoin (`hello` token, server/index.js ~l.170) -> reuse idea for P2P reconnect: rejoining peer receives state snapshot + command log from a peer.
- AI difficulty parameterization (shared/ai.js l.33-37, 174-176): easy = slower think, later first attack, fewer workers; impossible = resource trickle. Good template for Age-of-War bot tiers.
- Command rate-limit + chat rate-limit; `ping/pong` latency display; pause/speed for vs-AI.
- Save/loadState (sim.js) incl. AI state; end-game stats graph (client/ui.js).
- Interpolation of render positions between sim ticks over measured interval (client/game.js ~l.430) - needed for 20-30Hz lockstep rendering at 60fps.
- Procedural audio (client/audio.js) to avoid asset licensing.

## DON'T ADOPT
- Authoritative-server snapshot streaming (`deltaSnapshot` JSON broadcast, server/index.js l.~120): wrong model for lockstep P2P.
- Immediate untimed command application (`case 'cmd'`, server/index.js): lockstep needs input delay + tick-stamped commands.
- Wall-clock-limited pathfinding and AI resource cheats inside the sim (sim.js l.745) - breaks determinism.
- Tunnel/git-push address publishing (`publishAddress`), visitor stats, Czech-string-key i18n, one-liner code style, monolithic server switch.
- Full-RTS scope (heroes, walls, ships, fog memory): out of scope for Age of War.
