<script lang="ts">
  import { app, closeOverlay, setCompat, setLang, setMusicOn, setMusicVol, setSfx, setSmartAi, tr } from '../lib/app.svelte';
  const goFull = () => document.documentElement.requestFullscreen?.().catch(() => {});
</script>

<div class="fixed inset-0 z-30 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
  <div class="glass w-full max-w-md rounded-3xl p-5 flex flex-col gap-3">
    <h2 class="title text-2xl font-black text-amber-300 text-center">{tr('settings')}</h2>
    <div class="flex items-center justify-between"><span class="font-semibold">{tr('language')}</span>
      <div class="flex gap-2"><button class="btn {app.lang === 'ru' ? 'btn-primary' : ''}" onclick={() => setLang('ru')}>RU</button><button class="btn {app.lang === 'en' ? 'btn-primary' : ''}" onclick={() => setLang('en')}>EN</button></div></div>
    <label class="flex items-center gap-3"><span class="font-semibold w-20">{tr('volume')}</span><input type="range" min="0" max="1" step="0.05" class="flex-1 accent-amber-400" value={app.sfx} oninput={(e) => setSfx(Number(e.currentTarget.value))} /></label>
    <label class="flex items-center gap-3"><span class="font-semibold w-20">{tr('music')}</span><input type="checkbox" class="size-5 accent-amber-400" checked={app.musicOn} onchange={(e) => setMusicOn(e.currentTarget.checked)} />
      <input type="range" min="0" max="1" step="0.05" class="flex-1 accent-amber-400" value={app.music} oninput={(e) => setMusicVol(Number(e.currentTarget.value))} /></label>
    <div class="flex items-center justify-between gap-2"><span class="font-semibold">{tr('aiMode')}</span>
      <select class="btn text-sm" value={app.smartAi ? '1' : '0'} onchange={(e) => setSmartAi(e.currentTarget.value === '1')}><option value="1">{tr('aiSmart')}</option><option value="0">{tr('aiClassic')}</option></select></div>
    <div>
      <label class="flex items-center justify-between"><span class="font-semibold">{tr('compat')}</span><input type="checkbox" class="size-5 accent-amber-400" checked={app.compat} onchange={(e) => setCompat(e.currentTarget.checked)} /></label>
      <p class="text-xs text-slate-400 mt-1">{tr('compatHint')}</p>
    </div>
    <button class="btn btn-ghost" onclick={goFull}>⛶ {tr('fullscreen')}</button>
    <button class="btn btn-primary" onclick={closeOverlay}>OK</button>
  </div>
</div>
