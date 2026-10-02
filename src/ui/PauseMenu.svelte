<script lang="ts">
  import { app, leave, setLang, setMusicOn, setMusicVol, setAutoPause, setSfx, setSpeed, toggleMenu, tr } from '../lib/app.svelte';
  import LangSwitch from './LangSwitch.svelte';
  import VersionSwitch from './VersionSwitch.svelte';
  const goFull = () => document.documentElement.requestFullscreen?.().catch(() => {});
</script>

<div class="aw-ui fixed inset-0 z-30 grid place-items-center bg-black/55 p-4 backdrop-blur-sm" data-testid="pause-menu">
  <div class="aw-panel w-full max-w-[400px] p-5 flex flex-col gap-3">
    <h2 class="aw-title text-center text-4xl" style="-webkit-text-stroke:1.5px #4a2d05">{app.net.online ? tr('menu') : tr('paused')}</h2>
    <div class="flex items-center justify-between"><span class="font-bold">{tr('language')}</span><LangSwitch lang={app.lang} set={setLang} /></div>
    <button class="aw-btn big" data-testid="resume" onclick={toggleMenu}>▶ {tr('resume')}</button>
    <label class="flex items-center gap-3"><span class="font-bold w-20 shrink-0">{tr('volume')}</span><input class="aw-range" type="range" min="0" max="1" step="0.05" value={app.sfx} oninput={(e) => setSfx(Number(e.currentTarget.value))} /></label>
    <label class="flex items-center gap-3"><span class="font-bold w-20 shrink-0">{tr('music')}</span>
      <input type="checkbox" class="size-5 accent-amber-400" checked={app.musicOn} onchange={(e) => setMusicOn(e.currentTarget.checked)} />
      <input class="aw-range" type="range" min="0" max="1" step="0.05" value={app.music} oninput={(e) => setMusicVol(Number(e.currentTarget.value))} /></label>
    {#if !app.net.online}
      <div class="flex items-center gap-2"><span class="font-bold w-20 shrink-0">{tr('speed')}</span>
        {#each [1, 2, 3] as s}<button class="aw-chip {app.speed === s ? 'on' : ''}" onclick={() => setSpeed(s)}>{s}×</button>{/each}</div>
    {/if}
    <label class="flex items-center justify-between"><span class="font-bold">{tr('autoPause')}</span><input type="checkbox" class="size-5 accent-amber-400" checked={app.autoPause} onchange={(e) => setAutoPause(e.currentTarget.checked)} /></label>
    <button class="aw-btn wood small" onclick={goFull}>⛶ {tr('fullscreen')}</button>
    <div class="aw-glass p-3 text-xs leading-relaxed"><b>{tr('hotkeys')}</b><br />{tr('hk1')} · {tr('hk2')} · {tr('hk3')}<br />{tr('hk4')}</div>
    <button class="aw-btn wood" data-testid="leave" onclick={leave}>{tr('leave')}</button>
    <VersionSwitch current="original" block lang={app.lang} />
  </div>
</div>
