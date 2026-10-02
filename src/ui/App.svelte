<script lang="ts">
  import { onMount } from 'svelte';
  import { app, boot, tr } from '../lib/app.svelte';
  import { purgeAndReload } from '../lib/heal';
  import Hud from './Hud.svelte';
  import Lobby from './Lobby.svelte';
  import MainMenu from './MainMenu.svelte';
  import PauseMenu from './PauseMenu.svelte';
  import Result from './Result.svelte';
  import Status from './Status.svelte';

  let canvas: HTMLCanvasElement;
  onMount(() => {
    void boot(canvas);
  });
</script>

<canvas id="stage" bind:this={canvas}></canvas>
<div class="rotate-hint fixed inset-0 z-50 hidden place-items-center bg-black/85 text-center p-8 text-amber-200 text-xl font-bold">📱↻<br />{tr('rotate')}</div>

{#if app.loadError}
  <div class="fixed inset-0 z-40 grid place-items-center p-6 text-center bg-black text-rose-300">
    <div class="flex flex-col gap-4 items-center"><div>{app.loadError}</div><button class="aw-btn" onclick={purgeAndReload}>↻ Reload / очистить кэш</button></div>
  </div>
{:else if app.phase === 'loading'}
  <div class="aw-ui fixed inset-0 z-30 grid place-items-center" style="background:linear-gradient(180deg,#3fb1ff,#9fdcff 60%,#6b4a26 60%)">
    <div class="text-center"><div class="aw-title text-6xl">AGE OF WAR</div><div class="mt-4 font-bold text-white animate-pulse" style="text-shadow:0 2px 0 #0008">{tr('loading')}</div></div>
  </div>
{:else}
  {#if app.phase === 'title' && app.overlay === 'none'}<MainMenu />{/if}
  {#if app.phase === 'game' || app.phase === 'result'}<Hud />{/if}
  <Status />
  {#if app.overlay === 'lobby'}<Lobby />{/if}
  {#if app.overlay === 'menu'}<PauseMenu />{/if}
  {#if app.phase === 'result'}<Result />{/if}
{/if}
