<script lang="ts">
  import { onMount } from 'svelte';
  import { app, boot, tr } from '../lib/app.svelte';
  import { purgeAndReload } from '../lib/heal';
  import FriendPanel from './FriendPanel.svelte';
  import GameMenu from './GameMenu.svelte';
  import Lobby from './Lobby.svelte';
  import Result from './Result.svelte';
  import Settings from './Settings.svelte';
  import Status from './Status.svelte';
  import VersionSwitch from './VersionSwitch.svelte';

  let canvas: HTMLCanvasElement;
  onMount(() => {
    void boot(canvas);
  });
</script>

<canvas id="stage" bind:this={canvas}></canvas>
<div class="rotate-hint fixed inset-0 z-50 hidden place-items-center bg-black/85 text-center p-8 text-amber-200 text-xl font-bold">📱↻<br />{tr('rotate')}</div>

{#if app.loadError}
  <div class="fixed inset-0 grid place-items-center p-6 text-center bg-black text-rose-300">
    <div class="flex flex-col gap-4 items-center"><div>{app.loadError}</div><button class="btn btn-primary" onclick={purgeAndReload}>↻ Reload / очистить кэш</button></div>
  </div>
{:else if app.phase === 'loading'}
  <div class="fixed inset-0 grid place-items-center menu-bg">
    <div class="title text-3xl text-amber-300 animate-pulse">AGE OF WAR</div>
  </div>
{:else}
  <Status />
  {#if app.phase === 'title' && app.overlay === 'none'}
    <VersionSwitch current="original" />
    <button class="glass fixed top-2 right-2 z-20 rounded-xl size-10 grid place-items-center text-lg" aria-label={tr('settings')} onclick={() => (app.overlay = 'settings')}>⚙️</button>
  {/if}
  {#if app.phase === 'game'}
    <button class="glass fixed bottom-2 right-2 z-20 rounded-xl size-10 grid place-items-center text-lg opacity-70" aria-label="menu" onclick={() => (app.overlay = app.overlay === 'menu' ? 'none' : 'menu')}>☰</button>
  {/if}
  {#if app.overlay === 'friend'}<FriendPanel />{/if}
  {#if app.overlay === 'lobby'}<Lobby />{/if}
  {#if app.overlay === 'settings'}<Settings />{/if}
  {#if app.overlay === 'menu'}<GameMenu />{/if}
  {#if app.phase === 'result' && app.result.online}<Result />{/if}
{/if}
