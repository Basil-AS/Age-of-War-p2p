<script lang="ts">
  import { app, leave, setMusicOn, setSfx, setSpeed, toggleMenu, tr } from '../lib/app.svelte';
  import VersionSwitch from './VersionSwitch.svelte';
  const goFull = () => document.documentElement.requestFullscreen?.().catch(() => {});
</script>

<div class="fixed inset-0 z-30 grid place-items-center bg-black/55 p-4 backdrop-blur-sm">
  <div class="glass rounded-3xl p-6 flex flex-col gap-3 min-w-[min(92vw,340px)]">
    <button class="btn btn-primary" onclick={toggleMenu}>▶ {tr('resume')}</button>
    <label class="flex items-center gap-3"><span class="font-semibold w-16">{tr('volume')}</span><input type="range" min="0" max="1" step="0.05" class="flex-1 accent-amber-400" value={app.sfx} oninput={(e) => setSfx(Number(e.currentTarget.value))} /></label>
    <label class="flex items-center gap-3"><span class="font-semibold w-16">{tr('music')}</span><input type="checkbox" class="size-5 accent-amber-400" checked={app.musicOn} onchange={(e) => setMusicOn(e.currentTarget.checked)} /></label>
    {#if !app.net.online}
      <div class="flex items-center gap-2"><span class="font-semibold w-16">{tr('speed')}</span>
        {#each [1, 2, 3] as s}<button class="btn !px-3 !py-1.5 {app.speed === s ? 'btn-primary' : ''}" onclick={() => setSpeed(s)}>{s}×</button>{/each}</div>
    {/if}
    <button class="btn" onclick={goFull}>⛶ {tr('fullscreen')}</button>
    <button class="btn btn-ghost" onclick={leave}>{tr('leave')}</button>
    <VersionSwitch current="original" block />
  </div>
</div>
