<script lang="ts">
  import { onMount } from 'svelte';
  import { app, boot, tr } from '../lib/app.svelte';
  import FriendPanel from './FriendPanel.svelte';
  import GameMenu from './GameMenu.svelte';
  import Lobby from './Lobby.svelte';
  import Result from './Result.svelte';
  import Settings from './Settings.svelte';
  import Status from './Status.svelte';

  let canvas: HTMLCanvasElement;
  onMount(() => {
    void boot(canvas);
  });
</script>

<canvas id="stage" bind:this={canvas}></canvas>

{#if app.loadError}
  <div class="fixed inset-0 grid place-items-center p-6 text-center bg-black text-rose-300">{app.loadError}</div>
{:else if app.phase === 'loading'}
  <div class="fixed inset-0 grid place-items-center menu-bg">
    <div class="title text-3xl text-amber-300 animate-pulse">AGE OF WAR</div>
  </div>
{:else}
  <Status />
  {#if app.phase === 'title' && app.overlay === 'none'}
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
