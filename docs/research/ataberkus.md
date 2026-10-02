# Study: ataberkus/age-of-war-clone

Source: /home/user/ataberkus/age-of-war-clone (React 19 + Vite + Tailwind/shadcn, Canvas2D). ~3.2k LOC in src/game + src/mp.

## Architecture
- `src/game/engine.ts` (728 LOC) `GameEngine`: one mutable class, `update(dt)` with variable dt (capped 0.05 in Game.tsx), floats everywhere, `Math.random()` for spawn jitter, AI, particles, specials. NOT deterministic, no seed, no fixed tick.
- `production-engine.ts`: queue bolted on by monkey-patching `GameEngine.prototype` (buyUnit/update/runAI/getSnapshot) + WeakMap state + `Object.defineProperty(engine,'over')`. Hacky; a port should make the queue a first-class part of the sim state.
- `data.ts`: all numbers (AGES[5] x 3 units + 2 turrets + 1 special + theme), `DIFFICULTIES`. `types.ts` plain interfaces.
- UI: `components/Game.tsx` owns rAF loop, camera, minimap, HUD snapshot at throttled rate; `Lobby.tsx` room-code flow.
- Same renderer is fed either the real engine (solo/host) or `GuestSync` (duck-typed as GameEngine).

## Rules / numbers vs original Flash (original-like, but a loose clone)
- Field 1600x520, ground y468, bases at x=96/1504, 3 turret slots, base HP 700 (+150 per evolve), start gold 125.
- 5 ages: Stone, Medieval, Renaissance, Modern, Future. EVOLVE_COSTS XP = 210/780/2250/5600 (original Flash used ~4k/14k/45k/100k-ish scale; these are rescaled, not faithful).
- Passive income +2.6 gold/s (+0.35 per age) and +1.6 xp/s -- the original has NO passive income; gold/xp come from kills only. Deviation.
- Units: 3/age (cheap melee, ranged, heavy mount) e.g. Clubman 15g/75hp/12dmg, Dino 100g, Knight 260g, Tank 1600g, War Machine 4000g. Not the original's 4 units/age; original names differ (e.g. Slingshot ok, but no Super Soldier etc.). Reward = ~0.4x cost gold.
- Turrets: 2 per age (cheap/fast, heavy/splash) vs original 4 turret tiers + slot upgrades; no turret sell. Special: 1/age, 45s cooldown, damage 80/130/210/330/520 (original: meteor, etc. fine).
- Queue (added): cap 20, living cap 50, train times 1.5/2.5/4.0 s by slot, pay on enqueue, refund on cancel of waiting entries, active not cancellable, queued unit keeps purchase-age def. Original has a 5-slot queue with per-unit train time -- same concept, different numbers.
- Combat: nearest enemy in front within range(+26 mount/+12), melee/ranged, base hit within range+62; splash; speedJit 0.92-1.08.
- AI: 4 difficulties (income mult 0.55..1.8, aggro, smartness, spawnCd, mountDelay) -- cheating income mult, not smart planning.

## Multiplayer (src/mp) -- host-authoritative snapshot streaming, NOT lockstep
- Transport: Supabase Realtime broadcast channel `match:<CODE>` (5-char code, no DB), presence for peer-leave. Keys hard-coded in `config.ts` (publishable anon key). Server relays all traffic (no WebRTC/P2P). `session.ts`.
- Sync model: host runs the full sim; guest sends `action` {buyUnit|buyTurret|evolve|special|cancelUnit, idx}; host applies them as side 'enemy' with no tick stamping / no validation beyond engine rules. Host broadcasts `state` snapshot every 125 ms (8 Hz) as flat packed arrays (`PackedSnap`, sync.ts) -- units [uid,side,defCode,x,hp,dieT,atk], last 22 projectiles, turrets, strikes, queues; ints rounded to keep <2KB.
- Guest "shadow": mirrors sides and x (FIELD_W - x), lerps unit x toward target (dt*12), integrates projectiles locally and re-matches them by kind/side/proximity, re-derives particles/sfx/shake from deltas (base HP drop, specialCd rising, dieT). Own purchases only visible after round-trip (no prediction) -- guest latency = RTT + up to 125ms.
- Handshake: guest sends `join` repeatedly until host answers `start`; host re-answers `join` (handles lost msgs).
- Reconnect: NONE. `onPeerLeave` just ends the match (winner forced to remaining player). Lost snapshots are tolerated (next one overwrites) but lost actions are silently dropped (`ack:false`).
- Desync handling: not needed/not present (single authority); no hashes, no checksums, no resend.
- Security: host trusts guest; guest cannot cheat sim state but room codes are guessable-ish (32^5), channel is public with anon key.

## Production queue engine (production-engine.ts)
- Per-side FIFO of immutable entries {def, ageIdx, unitIdx, cost, duration, remaining}; only head ticks; on remaining<=0 and living<50 -> spawn at base+-62, shift. Excess dt not carried (tested). Over => queues cleared. Guest receives queue as [defCode, remaining*10] and ticks head locally.
- Design spec/plan in docs/superpowers/{specs,plans}/2026-07-18-unit-production-queue*.md -- clear, rules table, worth reading.

## Renderer (src/game/renderer.ts, 1215 LOC)
- Pure Canvas2D immediate mode, procedural vector art: no sprites/assets. Per-age sky gradients, split sky of two ages blended with 14 lerped strips at the centre, parallax hills (seeded sin), per-age base drawers (cave/castle/fort/bunker/future), humanoid + mount drawers (dino/horse/cannon/tank/mech), weapon drawers, per-projectile/strike drawers. Gradients recreated every frame (no caching); screenshake via Math.random in render. Camera: lerp follow + manual pan, DPR-aware canvas, minimap. Emoji icons for UI.

## Tests
- `scripts/run-production-tests.mjs`: tsc -p tsconfig.tests.json into .test-dist, then `node --test` on CJS tests. `tests/production-engine.test.cjs` (~12 tests: costs, FIFO, caps, refunds, dt carry, pause, game over, AI cap) and `tests/sync.test.cjs` (3 tests: queue pack/mirror, stable defCode across evolve, host validates cancel). No determinism, combat, balance or network-fault tests.

## Weaknesses
- Non-deterministic (Math.random, float dt, variable step) => cannot be reused for lockstep as-is.
- Monkey-patched engine; god-class; renderer reads engine fields directly; guest faking engine shape via cast.
- Client-server via a hosted broker, 8 Hz snapshots => visible jitter, no prediction, no reconnect, no rollback, host advantage (zero latency).
- Gameplay deviates from original (passive income, 3 units/age, rescaled costs).
- Secrets in repo; no CI; test coverage thin; renderer allocation-heavy per frame.

## WORTH ADOPTING
- Rule/spec doc style and queue semantics tests: docs/superpowers/specs/2026-07-18-unit-production-queue-design.md, tests/production-engine.test.cjs (port as vitest, run against a deterministic sim).
- Queue entry stores purchase-time def + cost (evolve-safe, refund exact): src/game/production-engine.ts.
- Stable unit/turret wire codes (age*10+slot, 100+...) for compact messages: src/mp/sync.ts `unitDefCode`.
- Join handshake that re-answers lost `join` with `start`: src/mp/sync.ts HostSync, src/components/Lobby.tsx.
- Room-code alphabet w/o ambiguous chars: src/mp/session.ts `makeCode`.
- Data-driven ages/units/turrets table layout: src/game/data.ts (but re-fill with original numbers).
- Split-sky age blend + procedural per-age themes idea: src/game/renderer.ts `render` (in Pixi: use texture/gradient sprites cached once).
- Tests-by-tsc-then-node:test runner pattern (simple, no deps): scripts/run-production-tests.mjs.

## DON'T ADOPT
- Host-authoritative snapshot streaming / Supabase relay (src/mp/session.ts, sync.ts) -- contradicts deterministic lockstep P2P goal.
- Prototype patching of GameEngine (src/game/production-engine.ts) and the duck-typed GuestSync shadow engine.
- Math.random / variable dt in sim (src/game/engine.ts); use seeded PRNG + fixed tick, integer/fixed-point math.
- Passive gold/xp and the 3-unit/2-turret simplification of data.ts; AI income multipliers.
- Per-frame gradient creation and Math.random shake inside render (src/game/renderer.ts).
- Hard-coded backend key in src/mp/config.ts; global module-level cancel-handler hook.
