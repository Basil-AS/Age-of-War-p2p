<script lang="ts">
  import { app, cancelLobby, hostRoom, joinRoom, setRelay, tr } from '../lib/app.svelte';
  let copied = $state(false);
  async function copy() {
    try { await navigator.clipboard.writeText(app.lobby.link); copied = true; setTimeout(() => (copied = false), 1600); } catch { /* clipboard blocked */ }
  }
  async function share() {
    try { await navigator.share?.({ title: 'Age of War', url: app.lobby.link }); } catch { /* cancelled */ }
  }
</script>

<div class="fixed inset-0 menu-bg grid place-items-center p-5 overflow-auto">
  <div class="glass w-full max-w-md rounded-3xl p-6 flex flex-col gap-4 text-center">
    {#if app.lobby.role === 'host'}
      <div class="text-slate-300 text-sm">{tr('roomCode')}</div>
      <div class="title text-6xl font-black text-amber-300 tracking-[.25em]" data-testid="room-code">{app.lobby.code}</div>
      <div class="text-sm text-slate-300">{tr('share')}</div>
      <input class="field text-xs" readonly value={app.lobby.link} onfocus={(e) => e.currentTarget.select()} />
      <div class="flex gap-2 justify-center">
        <button class="btn btn-primary" onclick={copy}>{copied ? tr('copied') : `📋 ${tr('copy')}`}</button>
        {#if 'share' in navigator}<button class="btn" onclick={share}>📤</button>{/if}
      </div>
    {:else}
      <div class="title text-5xl font-black text-amber-300 tracking-[.25em]">{app.lobby.code}</div>
    {/if}

    <div class="flex items-center justify-center gap-3 text-lg font-semibold">
      {#if app.lobby.state === 'connected'}
        <span class="text-emerald-400">✓ {tr('connected')}</span>
      {:else if app.lobby.state === 'error'}
        <span class="text-rose-400 text-sm">{app.lobby.error}</span>
      {:else}
        <span class="inline-block size-3 rounded-full bg-amber-400 animate-ping"></span>
        <span>{app.lobby.role === 'host' ? tr('waiting') : tr('connecting')}</span>
      {/if}
    </div>

    {#if app.lobby.slow}
      <p class="text-sm text-amber-200">{tr('lobbyTimeout')}</p>
      <div class="grid grid-cols-3 gap-2">{#each ['nostr', 'torrent', 'mqtt'] as r}<button class="btn text-sm {app.relay === r ? 'btn-primary' : ''}" onclick={() => { setRelay(r as never); if (app.lobby.role === 'host') void hostRoom(); else void joinRoom(app.lobby.code); }}>{r}</button>{/each}</div>
    {/if}
    <button class="btn btn-ghost" onclick={cancelLobby}>← {tr('back')}</button>
  </div>
</div>
