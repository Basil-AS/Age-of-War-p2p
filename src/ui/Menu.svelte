<script lang="ts">
  import { app, hostRoom, joinRoom, manualStart, setDifficulty, setLang, setCompat, setMusicOn, setName, setVol, startSolo, tr, trList } from '../lib/app.svelte';
  import type { Difficulty } from '../sim/types';

  let panel = $state<'main' | 'ai' | 'friend' | 'howto' | 'settings' | 'about'>('main');
  let code = $state('');
  const diffs: Difficulty[] = ['easy', 'normal', 'hard', 'insane'];
  let installEvt = $state<Event & { prompt?: () => void } | null>(null);
  $effect(() => {
    const h = (e: Event) => { e.preventDefault(); installEvt = e as never; };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  });
  const goFull = () => document.documentElement.requestFullscreen?.().catch(() => {});
</script>

<div class="fixed inset-0 menu-bg overflow-auto">
  <div class="min-h-full flex flex-col items-center justify-center gap-6 p-5">
    <div class="text-center">
      <h1 class="title text-5xl sm:text-7xl font-black text-amber-300">{tr('title')}</h1>
      <p class="mt-2 text-slate-300 font-semibold">{tr('sub')}</p>
    </div>

    <div class="glass w-full max-w-md rounded-3xl p-5 flex flex-col gap-3">
      {#if panel === 'main'}
        <button class="btn btn-primary text-lg" onclick={() => (panel = 'friend')}>⚔️ {tr('playFriend')}</button>
        <button class="btn" onclick={() => (panel = 'ai')}>🤖 {tr('playAi')}</button>
        <div class="grid grid-cols-3 gap-2">
          <button class="btn btn-ghost text-sm" onclick={() => (panel = 'howto')}>📖 {tr('howTo')}</button>
          <button class="btn btn-ghost text-sm" onclick={() => (panel = 'settings')}>⚙️ {tr('settings')}</button>
          <button class="btn btn-ghost text-sm" onclick={() => (panel = 'about')}>ℹ️ {tr('about')}</button>
        </div>
        {#if installEvt}<button class="btn btn-ghost text-sm" onclick={() => installEvt?.prompt?.()}>📲 {tr('install')}</button>{/if}
      {:else if panel === 'ai'}
        <h2 class="font-bold text-lg">{tr('difficulty')}</h2>
        <div class="grid grid-cols-2 gap-2">
          {#each diffs as d}
            <button class="btn {app.difficulty === d ? 'btn-primary' : ''}" onclick={() => setDifficulty(d)}>{tr(d)}</button>
          {/each}
        </div>
        <button class="btn btn-primary text-lg mt-2" onclick={() => startSolo()}>▶ {tr('start')}</button>
        <button class="btn btn-ghost" onclick={() => (panel = 'main')}>← {tr('back')}</button>
      {:else if panel === 'friend'}
        <label class="text-sm font-semibold text-slate-300" for="nm">{tr('yourName')}</label>
        <input id="nm" class="field" maxlength="16" value={app.name} oninput={(e) => setName(e.currentTarget.value)} />
        <button class="btn btn-primary text-lg" onclick={() => hostRoom()}>🏰 {tr('createRoom')}</button>
        <div class="flex items-center gap-2 text-slate-400 text-xs"><hr class="flex-1 border-slate-600" />{tr('joinRoom')}<hr class="flex-1 border-slate-600" /></div>
        <div class="flex gap-2">
          <input id="code" class="field uppercase tracking-[.3em] text-center" placeholder="ABCDE" maxlength="8" bind:value={code}
            onkeydown={(e) => e.key === 'Enter' && joinRoom(code)} />
          <button class="btn" disabled={code.trim().length < 4} onclick={() => joinRoom(code)}>{tr('join')}</button>
        </div>
        <div class="flex items-center gap-2 text-slate-400 text-xs"><hr class="flex-1 border-slate-600" />{tr('manualTitle')}<hr class="flex-1 border-slate-600" /></div>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn btn-ghost text-sm" onclick={() => manualStart('host')}>{tr('manualHost')}</button>
          <button class="btn btn-ghost text-sm" onclick={() => manualStart('guest')}>{tr('manualGuest')}</button>
        </div>
        <button class="btn btn-ghost" onclick={() => (panel = 'main')}>← {tr('back')}</button>
      {:else if panel === 'howto'}
        <ul class="flex flex-col gap-3 text-sm leading-relaxed">
          {#each trList('howToText') as line}<li class="flex gap-2"><span>▸</span><span>{line}</span></li>{/each}
        </ul>
        <div class="text-xs text-slate-400 mt-1">{tr('hotkeys')}: {tr('hk1')} · {tr('hk2')} · {tr('hk3')} · {tr('hk4')}</div>
        <button class="btn btn-ghost" onclick={() => (panel = 'main')}>← {tr('back')}</button>
      {:else if panel === 'settings'}
        <div class="flex items-center justify-between"><span class="font-semibold">{tr('language')}</span>
          <div class="flex gap-2"><button class="btn {app.lang === 'ru' ? 'btn-primary' : ''}" onclick={() => setLang('ru')}>RU</button><button class="btn {app.lang === 'en' ? 'btn-primary' : ''}" onclick={() => setLang('en')}>EN</button></div></div>
        <label class="flex items-center justify-between gap-4"><span class="font-semibold">{tr('volume')}</span>
          <input type="range" min="0" max="1" step="0.05" class="flex-1 accent-amber-400" value={app.volume} oninput={(e) => setVol(Number(e.currentTarget.value))} /></label>
        <label class="flex items-center justify-between"><span class="font-semibold">{tr('music')}</span><input type="checkbox" class="size-5 accent-amber-400" checked={app.music} onchange={(e) => setMusicOn(e.currentTarget.checked)} /></label>
        <div>
          <label class="flex items-center justify-between"><span class="font-semibold">{tr('compat')}</span><input type="checkbox" class="size-5 accent-amber-400" checked={app.compat} onchange={(e) => setCompat(e.currentTarget.checked)} /></label>
          <p class="text-xs text-slate-400 mt-1">{tr('compatHint')}</p>
        </div>
        <button class="btn btn-ghost" onclick={goFull}>⛶ {tr('fullscreen')}</button>
        <button class="btn btn-ghost" onclick={() => (panel = 'main')}>← {tr('back')}</button>
      {:else}
        <p class="text-sm leading-relaxed">{tr('aboutText')}</p>
        <button class="btn btn-ghost" onclick={() => (panel = 'main')}>← {tr('back')}</button>
      {/if}
    </div>
  </div>
</div>
