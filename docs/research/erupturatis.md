# erupturatis/Age-of-war-unity-clone (research, read-only)
Repo: /home/user/erupturatis/Age-of-war-unity-clone. Minimal Unity clone of Flash Age of War, built only to train NEAT/PPO
agents at 10x speed in up to 50 parallel envs. Author admits it may not run. No license-clean game assets used here.

## Architecture
- Assets/scripts/GameManager.cs (1308 lines): one env per instance; money, xp, age, turret slots, training queue (max 5),
  player/enemy troop lists (player cap 20), take_action(int) dispatcher, abilities, custom start states for RL.
- Data.cs: all numbers (arrays indexed by troop id 0..15 = 5 ages x 3 tiers + super soldier; turrets 15 = 5 ages x 3).
- Troop.cs: per-troop state machine (walk, melee, ranged, MIN_DISTANCE queueing). Turret.cs/Bullet.cs: projectiles.
- Enemy_AI.cs: scripted opponent. Master.cs: human/NEAT harness. MasterMlAgents.cs: spawns N envs, timeScale.
- AgeOfWarAgent.cs: ML-Agents Agent (PPO). Frame-based timing: FPS=41, map 900 units, COEFF=50 (unity<->orig units).

## Rules/numbers (Data.cs) vs original
- Troops (cost/train frames/hp/melee/ranged): clubman 15/40/55/16; slinger 25/40/42/10+8r100; dino 100/100/160/40;
  sword 50/70/100/35; archer 75/50/80/20+14r130; knight 500/100/300/60 (note: 3 tiers per age, id%3=tier).
  Ages 3-5: duelist 200, musketeer 400, cannoneer 1000; ... Tank 7000/1200hp/300; war machine 20000/3000hp/600;
  super soldier 150000/4000hp/400 melee+400 ranged. Melee range 20-25, ranged 100-130.
- Per-troop attack timings: melee_first_speed, melee_speed, attack_pause (frames_wait_attack), walking vs standing ranged speed.
  Troop walk speed 40 units/s (450 units in 11.5s). MIN_DISTANCE 20 spacing.
- Turrets 15 (cost 100 ... 100000), range 300-550, damage 5-125, fragments (fire catapult/big cannon). 4 slots at x=20,68,116,164;
  slot_cost {1000,3000,7500} (3 buys -> 4 slots). Turret sale refund not checked (see GameManager sell_*).
- Age xp_cost {4000,14000,45000,200000,10M(=cap)}; base_hp {500,1100,2000,3200,4700}.
- Kill reward: 1.3*cost; money to killer side, xp = 2x reward (enemy dies) -- matches original-ish "xp = bounty" but ratio is the
  author's guess. Odd: player-troop death branch grants player xp += reward/2 (likely questionable/bug).
- Special: 60s cooldown, per-age (meteor shower, ... 5 age effects via ability1..5 coroutines spawning projectiles at random x).
- `diff` multiplies spawned troops' hp/damage (difficulty knob 1.2-1.5, enemy only?). Verify before reuse.
- Author flagged some constants (turret_speed_add) as hand-tuned "to match in-game time" -> NOT exact. Cross-check with the
  decompiled Flash AS (archive repo "Decompiled-flash-games-archive"), which is the real source of truth for our port.

## Enemy_AI.cs heuristic (extracted from the Flash AS; this is the original's AI)
- Not reactive at all: a fixed timeline per enemy age, in frames @41fps. Spawn tick every 1s: 30% chance to spawn if <6 enemy troops,
  type = random in [0..unit_level]; unit_level +1 at frame 1500 and 5000 (unlocks tier2/tier3). Troops must train like player's.
- Age-up at frame 8000 (ages 1-4; age 5 never upgrades). Turret script per age (frame -> action), e.g. Age1: 1000 buy t1@slot0,
  4000 sell+t2, 6000 sell+t3. Age5: 5000 t1, 12000 sell all + t2@slot1, 20000 sell all + t3@slot3 (4th slot).
- Never looks at player's army, money, or base HP. Hence trivially exploitable (turtle with turrets + cheap troops, push when 6-cap).
- Value for us: faithful "original difficulty" bot = same fixed schedule. Directly portable as data table.

## ML-Agents (AgeOfWarAgent.cs, config/*.yaml)
- Obs (36 floats): in-train count, own/enemy base hp %, sqrt(money/tier3 cost), money/150000, sqrt(xp/age xp cost), battle_place
  (frontline pos), ability ready, own/enemy troop counts per tier(/5, 4 buckets), slots avail/total, one-hot own & enemy age,
  4 slots x (tier+1)/3 and turret_age/5.
- Actions (discrete): 0-3 spawn tier1-4(+super), 4 buy slot, 5-7 buy turret t1-3, 8-11 sell slot0-3, 12 age up, 13 wait,
  14 ability, 15-22 multi-spawn (x2/x3). base2 mode: 5 binary branches decoded to action id, >22 -> wait. Decision every 1.3s.
- Rewards: +0.02/step, +percent_taken (frontline progress), money-hoarding terms (!), +0.75 for WAIT, big exponential bonus for
  holding >=3 tier-4 troops, +1000/+5000 win, -1000 loss. PPO 3x512, gamma .99, 50M steps.
- Verdict: the observation set is a sensible compact state for a scripted/utility bot; rewards are heavily hacked (wait bonus, money
  hoarding, scale 5000) and a learned net is unusable in-browser without exporting ONNX. DON'T port training; DO borrow features.

## Game-feel ideas
- Frontline `battle_place` scalar as the single tactical signal; per-troop distinct first-hit vs repeat-hit timing and
  walking vs standing ranged cadence; turret initial delay + fragment (splash) shots; 20-unit spacing queue.

## Weaknesses
- Hardcoded magic numbers, frame/second mixing (WaitForSeconds(frames/41)), time-scale dependent coroutines (nondeterministic,
  unfit for lockstep P2P). Unity Update/Time.deltaTime physics; random in gameplay. No tests. Sprites not included here.
- Rewards leak/hack; GameManager is a 1300-line god object. `aux` loops `i<=aux` spawn aux+1 troops (off-by-one).

## WORTH ADOPTING
- Assets/scripts/Data.cs: troop/turret/xp/slot/base_hp tables as starting data (verify vs original AS before trusting).
- Assets/scripts/Enemy_AI.cs: frame schedule as "Classic" bot preset (age-up 8000f, unit unlock 1500/5000f, 30%/s spawn, cap 6).
- Assets/scripts/AgeOfWarAgent.cs: 36-feature state vector -> feature set for a utility/MCTS bot; action list as bot command API.
- Assets/scripts/GameManager.cs take_action: single integer command interface (good for bot + network messages).
- Smarter bot suggestion: rule-based utility bot reading those features (counter-spend vs enemy tier mix, turret before age-up
  timing, special when >=3 enemies clustered, sell turrets at age-up), tunable by self-play evolutionary search, not PPO.

## DON'T ADOPT
- Assets/scripts/MasterMlAgents.cs, config/*.yaml, reward shaping in AgeOfWarAgent.cs (RL infra tied to Unity).
- Coroutine/Time.deltaTime simulation (Troop.cs, Turret.cs, GameManager.cs): use fixed-tick deterministic sim instead.
- `diff` hp/damage multiplier cheating as the only difficulty lever; Custom_state* start hacks; Master.cs NEAT plumbing.
