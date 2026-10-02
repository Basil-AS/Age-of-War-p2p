<script lang="ts">
  import { onMount } from 'svelte';
  import { app, boot, buySlot, buyTurret, buyUnit, evolve, getMatch, sellLast, special, toggleMenu } from '../lib/app.svelte';
  import { unitsOfAge, turretsOfAge } from '../sim/data';
  import Hud from './Hud.svelte';
  import Lobby from './Lobby.svelte';
  import Menu from './Menu.svelte';
  import Overlays from './Overlays.svelte';

  let canvas: HTMLCanvasElement;
  onMount(() => { void boot(canvas); });

  function onKey(e: KeyboardEvent) {
    if (app.screen !== 'game' || (e.target instanceof HTMLInputElement)) return;
    const m = getMatch();
    if (!m) return;
    const age = m.sim.players[m.side].age;
    const k = e.key.toLowerCase();
    if (k === 'escape') return toggleMenu();
    if (app.menuOpen) return;
    if (k >= '1' && k <= '4') { const u = unitsOfAge(age)[Number(k) - 1]; if (u) buyUnit(u.id); }
    else if (k === 'q' || k === 'w' || k === 'e') { const t = turretsOfAge(age)['qwe'.indexOf(k)]; if (t) buyTurret(t.id); }
    else if (k === 'r') buySlot();
    else if (k === 'f') sellLast();
    else if (k === ' ') { e.preventDefault(); special(); }
    else if (k === 'enter') evolve();
  }
</script>

<svelte:window onkeydown={onKey} />
<canvas id="stage" bind:this={canvas}></canvas>

{#if !app.ready}
  <div class="fixed inset-0 grid place-items-center menu-bg"><div class="title text-3xl text-amber-300 animate-pulse">AGE OF WAR</div></div>
{:else if app.screen === 'menu'}
  <Menu />
{:else if app.screen === 'lobby'}
  <Lobby />
{:else}
  <Hud />
  <Overlays />
{/if}
