# bondyfan/era-battle study (read-only; refs = /home/user/bondyfan/era-battle/*)

## Architecture
- Vanilla JS, no build. script.js (3949 l) = sim + HUD + menus + netcode glue in one `Game` class; world.js = map/lane geometry (shared by sim and render); render3d.js (three.js, top-down 3D) is a pure reflection of sim state; sounds.js = pooled <audio> SFX; net.js = Firebase RTDB transport.
- Sim is 1D-per-lane (unit.dist = arc length along a lane polyline, x/z derived via posAt). 5000x5000 map, corners at (700,700)/(4300,4300), 3 lanes (mid free; top/bottom 300g each side), base HP 2000.
- Fixed 1x dt, `update(dt)` script.js:3012; every UI gesture ends in a `player*()` call (2643-2697) which maps 1:1 to a network command.

## Rules/numbers vs original Age of War (it is a DEVIATING remix, not a clone)
- Start gold 150 (:2297). Passive income (1+era)/s (:3020). Kill bounty = unit.goldReward (Clubman 15g cost -> 8g reward, Spearman 25->14, Mammoth 100->55; ~55% of cost). XP is stored (xpReward) but NOT used; evolve is gold-bought.
- NO global XP-to-evolve: instead per-slot evolution: cost = next-tier unit cost * 2.5 (:346, 2396). Slot 3 (heavy) needs one-time 50g unlock. ERA_DATA[5 eras].units[3] {cost,hp,damage,speed,range,cooldown,type} (:20+). Stone: Clubman 50hp/8dmg, Spearman range150, Mammoth 250hp/22dmg.
- Special: must be bought; levels 1-4 mult [0.4,1,2,4], cost [250,600,1500,4000] (:334); 40s cooldown; aimed with radius 950 at a point (meteor x15, arrows x50, fireball x8, airstrike carpet along lane, orbital laser 3s). Era decides type.
- Ranged-range upgrade: +45/level, 6 levels, costs 180..2700 (:339) - new vs original.
- Towers: free-placed anywhere legal (>=280 apart, >=150 off lane; towerSpotValid :2605), slots bought 150/400/1000, build 250 (:329). Original has fixed turret slots on the base.
- Era soundtrack tracks player era (updateMusic :2390).

## Enemy AI (updateEnemyAI :2933-3000) - CHEATS, never pays
1. Era by wall-clock: t>=90s era1, 240 era2, 450 era3, 720 era4; all 3 unit tiers set together, heavy auto-unlocked, towers' cooldown reset + "ENEMY ADVANCES" fx on era change.
2. enemySpecialLevel = min(4, 1+era); enemyRangeLevel = min(6, era) - free.
3. Lanes: top opens at 60s, bottom at 150s, free.
4. Tower slots: slot n unlocks at n*120+60 s (max 3); if towers<slots, 6 random attempts (lane random, d=55-90% of length, +-60 jitter) until towerSpotValid.
5. Spawning: timer = max(2200, 7500 - 6.5*t) + rand(0..1800) ms. Roll: >0.85 heavy (15%), >0.5 mid (35%), else basic (50%). Random open lane. Uses `addUnitFree` = NO gold spent. (enemyGold only accrues in host/PvP mode.)
6. Special: only when timer fires, if player has >=4 units, 25% chance, aimed at centroid of live player units; obeys 40s CD.
Re-implementation note: replace free spawns with gold budget (same costs), keep time-curve only as a *difficulty floor*, keep centroid special targeting.

## Netcode (net.js)
- Firebase RTDB, host-authoritative. 4-char code (no 0/O/1/I). Paths games/<code>/{meta,snap,cmd,presence}.
- Host sims both sides, writes whole-state snapshot ~11 Hz (90ms; SNAPSHOT_INTERVAL_MS :2127), compact arrays per unit [id,side,era,type,x,z,lane,hp,state,facing,heading,death]. Guest pushes commands (push to cmd, host onChildAdded -> consume/remove). Guest view mirrored (mirrorX/Z/Lane) so both sit left; commands un-mirrored in onGuestCommand :2698. Guest lerps (NET_LERP 0.3).
- Presence via onDisconnect + grace timer; 9s timeout wrapper to avoid hanging on dead DB; set() wrapped in try/catch (NaN throws).
- Weaknesses: full snapshot every tick (no delta/id-keyed diff, ~KBs); guest has no prediction so spawn feedback lags a RTT+90ms; rules `games` world-writable, no TTL cleanup, cheating trivial (host is trusted); no reconnect resume; host-clock `tm` only. Not P2P - for our WebRTC/p2p port, deterministic lockstep of commands would be much smaller than snapshots.

## Game feel / audio
- sounds.js: 18 named SFX (attack_melee/ranged, hit, death, spawn, kill_gold, purchase, upgrade, evolve, evolve_ready, tower_build, lane_unlock, special, victory, defeat, click, error, base_hit), pool of 4 <audio> per name, per-call `throttle` ms and `volume`, global click sound on all buttons, unlock on first pointerdown. Per-era music (music/).
- Juice: floating "+Xg" bounty on kills (:1131), "-N" damage text, blood/smoke/spark particles, "ENEMY ADVANCES!" banner, announcer text for special ("ENEMY FIREBALL"), button affordance highlighting (updateAffordance :2871), cooldown overlay fill on special button, hover tooltips on units.

## Weaknesses
- God-class script.js; AI cheats (free units, free upgrades); XP field dead; unit stats duplicated in snapshots; no pause/speed; random AI placement; PvP guest has no authority/anti-cheat; per-slot evolution makes it a different game from original (global XP threshold).

## WORTH ADOPTING
- Gold-bought per-slot unit evolution (cost = next-tier cost*2.5, :346/2396) as optional mode / cost curve to tune against XP.
- Special levels with multipliers + 40s CD and *aimed* special (radius disc, centroid default) (:327-336, 2521-2548, 1944+).
- Lane unlock economy (top/bottom 300g) for a "lanes" mode (world.js:27, script.js:2453).
- Ranged-range upgrade as an economy sink (:339-341).
- Command schema `{a:'spawn',i,l}` / mirrored coordinates for guest (script.js:2698-2730) - reuse the mirror idea.
- Bounty floating text + kill_gold throttled sfx; sfx throttle/volume pool API (sounds.js:30-50); error sound on failed purchase; evolve_ready cue.
- Presence/onDisconnect + grace timer for opponent drop; 4-letter unambiguous room code (net.js:55-60).
- AI special targeting by centroid; AI timer curve max(2200,7500-6.5t) as difficulty ramp reference.

## DON'T ADOPT
- Free AI spawns/upgrades (AI should pay and obey same rules).
- Full-snapshot-per-tick Firebase sync (use lockstep/commands or delta).
- Open `games` RTDB rules; host-trusted state.
- Monolithic Game class and 3D top-down render (PixiJS 2D side-view is the target).
- Free-form tower placement (original has fixed turret slots); unused xpReward field.
