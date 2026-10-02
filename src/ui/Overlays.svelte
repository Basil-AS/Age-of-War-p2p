<script lang="ts">
  import { app, ageName, leave, requestRematch, setMusicOn, setSpeed, setVol, toggleMenu, tr } from '../lib/app.svelte';
  const h = $derived(app.hud);
  const done = $derived(!!h && h.winner !== -1);
  const mm = $derived(h ? `${Math.floor(h.time / 60)}:${String(Math.floor(h.time % 60)).padStart(2, '0')}` : '');
</script>

{#if app.net.desync}
  <div class="fixed top-16 inset-x-0 grid place-items-center z-30 pointer-events-none"><div class="glass rounded-xl px-4 py-2 text-rose-300 font-bold">{tr('desync')}</div></div>
{/if}
{#if app.net.peerLeft && !done}
  <div class="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4">
    <div class="glass rounded-3xl p-6 text-center flex flex-col gap-4"><div class="text-xl font-bold">{tr('peerLeft')}</div><button class="btn btn-primary" onclick={leave}>{tr('menu')}</button></div>
  </div>
{/if}

{#if done && h}
  <div class="fixed inset-0 z-40 grid place-items-center bg-black/55 p-4 backdrop-blur-sm">
    <div class="glass rounded-3xl p-6 sm:p-8 text-center flex flex-col gap-4 min-w-[min(92vw,360px)]">
      <div class="title text-5xl font-black {h.winner === 1 ? 'text-amber-300' : h.winner === 0 ? 'text-rose-400' : 'text-slate-200'}" data-testid="result">
        {h.winner === 1 ? tr('victory') : h.winner === 0 ? tr('defeat') : tr('draw')}
      </div>
      <div class="grid grid-cols-3 gap-2 text-sm">
        <div class="glass rounded-xl p-2"><div class="text-slate-400 text-xs">{tr('time')}</div><div class="font-bold">{mm}</div></div>
        <div class="glass rounded-xl p-2"><div class="text-slate-400 text-xs">{tr('kills')}</div><div class="font-bold">{h.kills}</div></div>
        <div class="glass rounded-xl p-2"><div class="text-slate-400 text-xs">{tr('reachedAge')}</div><div class="font-bold text-xs">{ageName(h.age)}</div></div>
      </div>
      {#if app.rematch.theirs && !app.rematch.mine}<div class="text-amber-300 text-sm font-semibold">{tr('rematchAsk')}</div>{/if}
      <button class="btn btn-primary" onclick={requestRematch} disabled={app.rematch.mine && app.net.online}>
        {app.rematch.mine && app.net.online ? tr('rematchWait') : `↻ ${tr('rematch')}`}
      </button>
      <button class="btn btn-ghost" onclick={leave}>{tr('menu')}</button>
    </div>
  </div>
{:else if app.menuOpen}
  <div class="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
    <div class="glass rounded-3xl p-6 flex flex-col gap-3 min-w-[min(92vw,340px)]">
      <button class="btn btn-primary" onclick={toggleMenu}>▶ {tr('resume')}</button>
      <label class="flex items-center gap-3"><span class="font-semibold w-16">{tr('volume')}</span>
        <input type="range" min="0" max="1" step="0.05" class="flex-1 accent-amber-400" value={app.volume} oninput={(e) => setVol(Number(e.currentTarget.value))} /></label>
      <label class="flex items-center gap-3"><span class="font-semibold w-16">{tr('music')}</span><input type="checkbox" class="size-5 accent-amber-400" checked={app.music} onchange={(e) => setMusicOn(e.currentTarget.checked)} /></label>
      {#if !app.net.online}
        <div class="flex items-center gap-2"><span class="font-semibold w-16">{tr('speed')}</span>
          {#each [1, 2, 3] as s}<button class="btn !px-3 !py-1.5 {app.speed === s ? 'btn-primary' : ''}" onclick={() => setSpeed(s)}>{s}×</button>{/each}</div>
      {/if}
      <button class="btn" onclick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>⛶ {tr('fullscreen')}</button>
      <button class="btn btn-ghost" onclick={leave}>{tr('leave')}</button>
    </div>
  </div>
{/if}
