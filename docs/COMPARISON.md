# What the five reference repos taught us

Each repo was read in full for its gameplay/net code; per-repo notes with file references are in
[`docs/research/`](research/). None of them is a pixel-exact port of the Flash original, and none is
usable as a base for deterministic P2P — so the base is the original SWF itself (`tools/swf`), and
from the repos we took ideas and checks.

| Repo | What it is | Verdict | Taken / used for |
|------|-----------|---------|------------------|
| [erupturatis/Age-of-war-unity-clone](research/erupturatis.md) | Unity sim for ML training; `Data.cs` holds the full tables, `Enemy_AI.cs` is the Flash AI transcribed | Not deterministic (coroutines/deltaTime), difficulty = stat cheating | **Cross-check of our extracted numbers** (16 troops, 15 turrets, XP 4k/14k/45k/200k, base HP, slot prices); Classic AI schedule matches our `base_comp` port; observation list used to design the smart bot's features |
| [apiotrowski255/age-of-war](research/apiotrowski255.md) | Godot clone | Physics/frame combat, no economy for AI, difficulty ignored | Confirms table values; special-attack designs, 5-slot training queue, camera shake, floating gold text (all already in the original port) |
| [ataberkus/age-of-war-clone](research/ataberkus.md) | TS/Vite, host snapshots over Supabase | Non-deterministic engine, no reconnect/desync handling, passive income rules differ from the original | Training-queue semantics and tests (cost taken at purchase), wire codes, handshake, room-code alphabet |
| [Pukaty-LR/AgesOfWar](research/pukaty-lr.md) | WC3/AoE-style RTS with Node authoritative server | Different genre; sim uses wall-clock pathfinding; impossible AI cheats | AI difficulty = *reaction/think rate and targets* (not stat cheats) → our smart bot's 3 levels; headless AI-vs-AI smoke tests (`tests/orig-sim.test.ts`); rejoin-token idea (future) |
| [bondyfan/era-battle](research/bondyfan.md) | Remix: 3 lanes, aimed specials, Firebase snapshots at 11 Hz | AI spawns free units, full snapshots, open DB rules | Evidence that a *paying* AI is the right fix; special/economy ideas kept out of the faithful mode; presence/grace handling for disconnects |

## Decisions
1. **Original look & rules** come only from the SWF (art, animation timing, hit frames, stats), never from approximations.
2. **Netcode**: deterministic lockstep (commands only, state hash check) — every reviewed repo that has online play streams snapshots from a trusted host instead, which is heavier, cheatable and has no clean reconnect. Ours also races many routes and keeps the best (see README).
3. **AI**: *Classic* = the original script (free units). *Smart* = a bot bound by the same rules as a human (pays gold, earns gold/XP from kills); difficulty changes reaction time, not stats.
4. **Not adopted** on purpose: passive income, lanes, free tower placement, aimed specials, snapshot sync — they change the game from the original.
