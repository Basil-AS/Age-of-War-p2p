# Field test (5 minutes, two players, real internet)

This is the part no CI can do: two real people on real networks (e.g. one in Russia).

0. **Each player first:** *Play with a friend* → **🔍 Network check** → wait ~5 s → **📋 Copy report** and paste it to me.
   It probes, from your own network, every STUN server, the TURN relay, 6 Nostr relays and 3 MQTT brokers and says whether direct P2P should work.
1. Both open https://basil-as.github.io/Age-of-War-p2p/ → **Original** (Ctrl+Shift+R once to drop old caches).
2. Player A: *Play with a friend* → *Create room* → send the link. Player B opens the link.
3. In the game, look at the top badge: `● <ping> ms · <route> · <name> · n/m ↔`.
   Hover the `n/m ↔` part to see every route and its ping.
   - Green ≤ 80 ms, amber ≤ 150 ms, red > 150 ms.
   - Routes: `nostr`/`torrent`/`mqtt` = direct P2P (best), `turn` = relayed WebRTC, `relay-*` = servers, `lan` = same network.
4. Play ~3 minutes, buy units on both sides, watch for "waiting for opponent" or "desync".
5. Report: both Network-check reports, both pings, the route shown, and whether it stalled.

If the ping is red in RU↔EU: deploy `deploy/` (coturn + relay) on a VPS between the players, build with
`VITE_TURN=… VITE_WS_RELAY=…` (see `deploy/docker-compose.yml`) — the ladder will prefer it automatically.
