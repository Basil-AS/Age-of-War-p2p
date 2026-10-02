# apiotrowski255/age-of-war (Godot 4 GDScript clone) - study notes
Repo: /home/user/apiotrowski255/age-of-war. README: art+SFX ripped from the Flash original, music Waterflame "Glorious Morning". Single-player vs AI only, ~3.9k LOC.

## Architecture
- Node-per-entity, physics-driven. `unit.gd`; `scripts/melee_unit.gd` (StaticBody/RigidBody, RayCast2D melee) and `range_unit.gd` (RigidBody2D, separate range+melee rays, state enum die/idle/idle_attack/melee_attack/walk/walk_attack). One tiny script per unit in `units/<age>/<melee|range|tank>/`, only sets stats + animation-frame hooks (damage lands on a specific sprite frame, e.g. frame 28).
- Damage is animation-frame driven (`do_damage` called from `attack_state()` on a frame number) - not deterministic, bad for lockstep netcode.
- Globals autoload `globals/global_variables.gd`: money, exp, current_stage, price/name tables as giant if/elif chains. `main_game.gd` (178 L) spawns units, runs specials. `UI/in_game_menu.gd` (458 L) holds training queue, turret placing, buy/sell, special trigger. Player base `bases/player_base.gd` (410 L) = HP + 4 turret slots + AI turret logic. Turrets: `bases/turret.gd` + 15 tiny age/tier scripts. Projectiles: `projectile.gd` Area2D.
- Unit paths built by string: `"res://units/"+age+"/"+type+"/"+age+"_"+type+".tscn"`. Age folder typo "miltary"/"medival" everywhere.

## Rules / numbers (vs original Flash)
- Start: money 175, exp 0. Base HP 500 -> +600=1100 (knight) -> 2000 -> 3200 -> 4700 (heals by the delta on evolve; original base HP is the same style but check values).
- Evolve XP: 4000 / 14000 / 45000 / 200000 (original: 4k/14k/45k/200k - matches).
- Unit cost melee/range/tank: cave 15/25/100; knight 50/75/500; medieval 200/400/1000; modern 1500/2000/7000; future 5000/6000/20000 (matches original table). Train time: melee 0.5s, range 1s, tank 2s; queue max 5; spawn blocked while spawn zone occupied.
- HP/dmg melee,range,tank: cave 70/10, 50/5, 120/40; knight 120/20, 90/12, 300/80; medieval 240/40, 130/25, 600/150; modern 500/80, 350/50, 1500/300 (tank row partly inferred from grep order); future 1100/160, 600/100, 3000/500. All move_speed 50. Kill reward gold: 20/33/130, 75/98/650, 260/520/1300, 1950/2600/9100, 6500/7800/26000; XP on killing enemy = 2x gold; XP when own unit dies = gold/2 (odd, enemy-kills give XP to you only; AI gets nothing).
- Turret price per tier: cave 100/200/500; knight 500/750/1000; medieval 1500/3000/6000; modern 7500/9000/14000; future 24000/40000/100000. Sell refund 50% (cancel placing = 100%). Extra slot prices 1000/3000/7500 (max 4 slots, start with 1).
- Turret dmg/proj speed: cave 15/2(egg auto)/40; knight 40/60/300; medieval 60/120/120; modern 60/120/80; future 100/50/50. Targets via range Area2D FIFO queue, only units (not base). Projectile-offspring on hit for catapults (3 small 10-dmg shards).
- Specials (once-unlocked, cooldown ~100s via 1s progress ticks in `UI/special_button.gd`): cave 25 meteors x80; knight 35 arrows x150; medieval 5s mass heal (+1 HP/frame and +1 max HP, units overheal); modern plane flies across dropping bombs every 0.5s; future 20 sequential lasers 0.1s apart. Spawned at random x 300-1500 in sky, damage friendly-agnostic via is_player_owned flag. Future also has "super soldier": cost 150000, 20000 HP, 300 dmg, 10s train (not in the original).
- Pause on key; difficulty menu exists (normal/hard/impossible enum) but AI code ignores it.

## AI spawner (`ai_spawner.gd`)
- Timer-driven, ages on fixed clock: cave->knight at 180s, then +200, +220, +240 (does NOT use XP/money). Phases per age: 60s melee only (2-8s gap), 60s melee/range 50% (2-6s / 3-6s), then melee/range/tank 25/25/50% (2-4s / 4-6s). Phase resets each age. AI is cost-free (no economy).
- Turret timer: random choice of buy / upgrade-to-current-age / add slot / sell old turret; each successful buy/add +15s to turret timer. Pauses spawn when body in its area.
- AI base evolve via `update_sprite_ai()` keyed on max_health value (brittle).

## Camera / UI / feel
- `camera.gd`: edge-scroll velocity 400 px/s, clamp x 500..1350 (viewport 1152x~600), `shake_strength` lerp-fade shake (`apply_shake`, randomStrength 10, `camera_shake()` stub). Mouse-edge scroll in `scripts/camera_scroll.gd`.
- Feel: spawn-aura flash on unit spawn, floating "+gold" text (`show_death_money.gd`), turret sprite follows mouse while placing with cancel/sell modes, hover tooltips "$price - Name", health bar above units, vertical HP bar on base, rotating turret sprite towards target, ragdoll-free death animation with random die_0N.mp3, unit sfx on exact anim frames, SFX/Music buses with volume config saved in user://options.cfg, main-menu parallax + character switcher.

## Weaknesses
- No determinism: physics bodies, randf, frame-based hits, Timer nodes - unusable for lockstep/p2p. Heavy node lookups (`get_node("/root/main_game/...")`), if/elif data tables, stubbed functions (get_first_player_unit etc.), repeated code per age, typos, unit stats magic-numbered in scripts, AI ignores difficulty, special cooldown hardcoded, units can spawn blocked, no win/lose except base HP 0 scene change, no enemy economy, AI never uses evolution XP, special_button cooldown not saved.
- Friendly fire on specials unclear (projectile checks is_player_owned so they only hit enemy); medieval heal loops every frame.

## WORTH ADOPTING
- Price/XP/HP-per-age tables (`globals/global_variables.gd`) as cross-check for our data JSON (they match original values; verify medieval/modern unit stats).
- XP = 2x kill gold rule; base HP growth steps; turret slot price ladder 1000/3000/7500; 50% sell refund (`bases/player_base.gd`).
- Specials' structure: sky-rain at random x with per-age count/dmg (`main_game.gd`: cave_special_attack etc.); sequential laser sweep (`future_special_laser_attack.gd`); plane + bombs (`miltary_special_plane.gd`).
- Training-queue UI with progress bar and 5 cap (`UI/in_game_menu.gd`); turret ghost follows mouse (`UI/sprite_follow_player_mouse.gd`); "Not enough money!" label; spawn-aura flash; floating death gold; camera shake fade (`camera.gd`).
- AI phased escalation idea (melee -> +range -> +tank) as a base for a single-player/bot mode (`ai_spawner.gd`).

## DON'T ADOPT
- Physics/animation-frame combat, Timer-node scheduling, randf without seed (breaks sync).
- Per-unit scripts + string-built scene paths; if/elif tables; "miltary"/"medival" naming.
- AI age-clock independent of economy; super soldier (150k) special; difficulty enum that does nothing.
- XP to the player only on kills with no symmetrical XP for opponent - 1v1 needs both sides symmetric.
