<script lang="ts">
  import { app, cancelLobby, manualStart, manualSubmit, tr } from '../lib/app.svelte';
  import { ROUTE_NAMES, STATUS_NAMES } from '../lib/i18n';

  let copied = $state('');
  let paste = $state('');
  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = tag;
      setTimeout(() => (copied = ''), 1600);
    } catch {
      /* clipboard blocked */
    }
  }
  async function share() {
    try {
      await navigator.share?.({ title: 'Age of War', url: app.lobby.link });
    } catch {
      /* cancelled */
    }
  }
  const icon = (s: string) => ({ waiting: '·', trying: '⏳', slow: '⏳', connected: '✅', failed: '✖', closed: '–' })[s] ?? '·';
  const manual = $derived(app.lobby.manual);
  const isManual = $derived(app.lobby.via === 'manual' && manual.step !== 'off');
</script>

<div class="aw-ui fixed inset-0 z-20 grid place-items-center p-5 overflow-auto bg-black/40 backdrop-blur-[3px]">
  <div class="aw-panel w-full max-w-md p-6 flex flex-col gap-4 text-center">
    {#if isManual}
      <h2 class="text-2xl font-black">{tr('manualTitle')}</h2>
      {#if manual.step === 'offer'}
        <div class="text-sm opacity-90">{tr('manualCopyOffer')}</div>
        {#if manual.busy}<div class="animate-pulse">{tr('preparing')}</div>
        {:else}
          <textarea class="aw-input text-[10px] h-24" readonly value={manual.offer} onfocus={(e) => e.currentTarget.select()}></textarea>
          <button class="aw-btn" onclick={() => copy(manual.offer, 'o')}>{copied === 'o' ? tr('copied') : `📋 ${tr('copy')}`}</button>
          <div class="text-sm opacity-90">{tr('manualPasteAnswer')}</div>
          <textarea class="aw-input text-[10px] h-24" bind:value={paste} placeholder="AOW1…"></textarea>
          <button class="aw-btn wood" disabled={paste.trim().length < 20 || manual.busy} onclick={() => manualSubmit(paste)}>{tr('manualConnect')}</button>
        {/if}
      {:else if manual.step === 'paste-offer'}
        <div class="text-sm opacity-90">{tr('manualPasteOffer')}</div>
        <textarea class="aw-input text-[10px] h-24" bind:value={paste} placeholder="AOW1…"></textarea>
        <button class="aw-btn" disabled={paste.trim().length < 20 || manual.busy} onclick={() => manualSubmit(paste)}>{tr('manualConnect')}</button>
      {:else if manual.step === 'show-answer'}
        <div class="text-sm opacity-90">{tr('manualShowAnswer')}</div>
        <textarea class="aw-input text-[10px] h-24" readonly value={manual.answer} onfocus={(e) => e.currentTarget.select()}></textarea>
        <button class="aw-btn" onclick={() => copy(manual.answer, 'a')}>{copied === 'a' ? tr('copied') : `📋 ${tr('copy')}`}</button>
        <div class="animate-pulse text-sm">{tr('manualConnecting')}</div>
      {:else}
        <div class="animate-pulse">{tr('manualConnecting')}</div>
      {/if}
      {#if manual.error}<div class="text-rose-200 text-sm">{tr('badCode')}</div>{/if}
    {:else}
      {#if app.lobby.role === 'host'}
        <div class="opacity-90 text-sm">{tr('roomCode')}</div>
        <div class="aw-title text-6xl tracking-[.25em]" data-testid="room-code">{app.lobby.code}</div>
        <div class="text-sm opacity-90">{tr('share')}</div>
        <input class="aw-input text-xs" readonly value={app.lobby.link} onfocus={(e) => e.currentTarget.select()} />
        <div class="flex gap-2 justify-center">
          <button class="aw-btn" onclick={() => copy(app.lobby.link, 'l')}>{copied === 'l' ? tr('copied') : `📋 ${tr('copy')}`}</button>
          {#if 'share' in navigator}<button class="aw-btn wood" onclick={share}>📤</button>{/if}
        </div>
      {:else}
        <div class="aw-title text-5xl tracking-[.25em]">{app.lobby.code}</div>
      {/if}

      <div class="flex items-center justify-center gap-3 text-lg font-semibold">
        {#if app.lobby.state === 'connected'}
          <span class="text-emerald-300">✓ {tr('connected')}</span>
        {:else if app.lobby.state === 'error'}
          <span class="text-rose-200 text-sm">{app.lobby.error}</span>
        {:else}
          <span class="inline-block size-3 rounded-full bg-amber-400 animate-ping"></span>
          <span>{app.lobby.role === 'host' ? tr('waiting') : tr('connecting')}</span>
        {/if}
      </div>

      {#if app.lobby.rungs.length > 1}
        <div class="text-left">
          <div class="text-xs font-bold opacity-90">{tr('routes')}</div>
          <div class="text-[11px] opacity-60 mb-1">{tr('routesHint')}</div>
          <ul class="flex flex-col gap-1 text-xs" data-testid="routes">
            {#each app.lobby.rungs as r}
              <li class="flex items-center justify-between rounded-lg bg-black/30 px-2 py-1 {r.status === 'connected' ? 'ring-1 ring-emerald-400' : ''}" data-status={r.status}>
                <span class="truncate">{icon(r.status)} {ROUTE_NAMES[app.lang][r.id]}</span>
                <span class="opacity-70 shrink-0 ml-2" title={r.detail}>{STATUS_NAMES[app.lang][r.status]}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if app.lobby.slow}
        <p class="text-sm text-amber-200">{tr('lobbyTimeout')}</p>
        <button class="aw-btn wood" onclick={() => manualStart(app.lobby.role)}>🔗 {tr('tryManual')}</button>
      {/if}
    {/if}
    <button class="aw-btn wood small" onclick={cancelLobby}>← {tr('back')}</button>
  </div>
</div>
