# Comparison with other open-source Age of War clones

Reviewed: `erupturatis/Age-of-war-unity-clone`, `ataberkus/age-of-war-clone`, `Pukaty-LR/AgesOfWar`,
`bondyfan/era-battle`, `apiotrowski255/age-of-war`. None of them is a pixel-exact port of the Flash
original, and none has online play; they are re-creations with their own art and numbers.

| Repo | Approach | Good ideas taken | Why not the base |
|------|----------|------------------|------------------|
| erupturatis (Unity) | full clone, 5 ages, special attacks, turret slots | era/tier structure, add-on slots, special as a cooldown ability | Unity/C#, not web; own art |
| ataberkus | small clone | simple unit-queue (training tray) | few ages, approximated stats |
| Pukaty-LR (AgesOfWar) | class-based game loop | clear separation of sim and render | approximated numbers/art |
| bondyfan (era-battle) | browser game | lane combat feel, base HP growth on evolve | own balance, no netcode |
| apiotrowski255 | canvas implementation | minimal state model | not faithful to the original |

Decision: instead of copying an approximation, the original SWF itself was parsed
(`tools/swf`) and its ActionScript transcribed, giving the original look, timings and stats exactly.
From the clones we kept only structural ideas (sim/render split, queue, add-on slots, evolution HP bonus),
all of which the original already contains, so the port follows the original and adds what the clones lack:
deterministic lockstep netcode, a multi-route connection ladder, LAN play and a fair AI.
