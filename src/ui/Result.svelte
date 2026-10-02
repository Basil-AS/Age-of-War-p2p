<script lang="ts">
  import { ageName, app, leave, requestRematch, tr } from '../lib/app.svelte';
  const h = $derived(app.hud);
  const won = $derived(app.result.winner === app.result.me);
  const mm = $derived(h ? `${Math.floor(h.seconds / 60)}:${String(h.seconds % 60).padStart(2, '0')}` : '');
</script>

<div class="aw-ui fixed inset-0 z-30 grid place-items-center bg-black/55 p-4 backdrop-blur-sm" data-testid="result-screen">
  <div class="aw-panel w-full max-w-[420px] p-6 text-center flex flex-col gap-4">
    <div class="aw-title text-6xl sm:text-7xl" data-testid="result" style={won ? '' : 'filter:grayscale(.2) hue-rotate(-40deg) drop-shadow(0 4px 0 #4a2d05)'}>
      {won ? tr('victory') : tr('defeat')}
    </div>
    <p class="text-sm font-semibold opacity-90">{won ? '🏆' : '💀'}</p>
    {#if h}
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div class="aw-glass p-2"><div class="opacity-70 text-xs">{tr('time')}</div><div class="font-black text-lg">{mm}</div></div>
        <div class="aw-glass p-2"><div class="opacity-70 text-xs">{tr('reachedAge')}</div><div class="font-black">{ageName(h.tech - 1)}</div></div>
      </div>
    {/if}
    {#if app.net.online && app.rematch.theirs && !app.rematch.mine}<div class="text-amber-200 text-sm font-bold">{tr('rematchAsk')}</div>{/if}
    <button class="aw-btn big" data-testid="again" onclick={requestRematch} disabled={app.rematch.mine && app.net.online}>
      {app.rematch.mine && app.net.online ? tr('rematchWait') : `↻ ${app.net.online ? tr('rematch') : tr('again')}`}
    </button>
    <button class="aw-btn wood" data-testid="to-menu" onclick={leave}>{tr('menu')}</button>
  </div>
</div>
