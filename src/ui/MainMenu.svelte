<script lang="ts">
  import { app, hostRoom, joinRoom, manualStart, setCompat, setLang, setMenu, setMusicOn, setMusicVol, setName, setSfx, setSmartAi, startSolo, tr, trList } from '../lib/app.svelte';
  import NetCheck from './NetCheck.svelte';
  import VersionSwitch from './VersionSwitch.svelte';

  let code = $state('');
  const goFull = () => document.documentElement.requestFullscreen?.().catch(() => {});
  const levels = [
    { n: 1 as const, k: 'lvl1', d: 'lvl1d', icon: '🛡️' },
    { n: 2 as const, k: 'lvl2', d: 'lvl2d', icon: '⚔️' },
    { n: 3 as const, k: 'lvl3', d: 'lvl3d', icon: '💀' },
  ];
  const view = $derived(app.menu);
</script>

<div class="aw-ui fixed inset-0 z-10 flex overflow-auto p-4" data-testid="main-menu">
  <div class="m-auto flex flex-col items-center gap-[clamp(8px,3vh,28px)] w-full">
  <header class="text-center select-none">
    <h1 class="aw-title text-[clamp(2.2rem,min(9vw,13vh),6.4rem)]">AGE OF WAR</h1>
    <p class="mt-2 text-[clamp(.8rem,1.8vw,1.1rem)] font-bold text-white [@media(max-height:520px)]:hidden" style="text-shadow:0 2px 0 #0008,0 0 12px #0008">{tr('sub')}</p>
  </header>

  <main class="aw-panel w-full max-w-[460px] p-[clamp(14px,2.4vh,22px)] flex flex-col gap-3">
    {#if view === 'home'}
      <button class="aw-btn big" data-testid="menu-play" onclick={() => setMenu('solo')}>▶ {tr('playAi')}</button>
      <button class="aw-btn big wood" data-testid="menu-friend" onclick={() => setMenu('friend')}>👥 {tr('playFriend')}</button>
      <div class="grid grid-cols-3 gap-2 text-[.8rem] [&>button]:!px-2 [&>button]:whitespace-nowrap">
        <button class="aw-btn wood small" data-testid="menu-howto" onclick={() => setMenu('howto')}>📖 {tr('howTo')}</button>
        <button class="aw-btn wood small" data-testid="menu-settings" onclick={() => setMenu('settings')}>⚙️ {tr('settings')}</button>
        <button class="aw-btn wood small" data-testid="menu-about" onclick={() => setMenu('about')}>ℹ️ {tr('about')}</button>
      </div>
    {:else if view === 'solo'}
      <h2 class="text-center text-xl font-black">{tr('soloTitle')}</h2>
      <div class="flex justify-center gap-2" role="radiogroup" aria-label={tr('aiMode')}>
        <button class="aw-chip {app.smartAi ? 'on' : ''}" onclick={() => setSmartAi(true)}>🧠 {tr('aiSmart').split(' (')[0]}</button>
        <button class="aw-chip {!app.smartAi ? 'on' : ''}" onclick={() => setSmartAi(false)}>📜 {tr('aiClassic').split(' (')[0]}</button>
      </div>
      <div class="flex flex-col gap-2">
        {#each levels as l}
          <button class="aw-btn big flex-col !items-start !gap-0 text-left" data-testid="lvl-{l.n}" onclick={() => startSolo(l.n)}>
            <span>{l.icon} {tr(l.k as 'lvl1')}</span>
            <span class="text-xs font-semibold opacity-75">{tr(l.d as 'lvl1d')}</span>
          </button>
        {/each}
      </div>
      <button class="aw-btn wood small" onclick={() => setMenu('home')}>← {tr('back')}</button>
    {:else if view === 'friend'}
      <h2 class="text-center text-xl font-black">{tr('friendTitle')}</h2>
      <p class="text-center text-sm opacity-90">{tr('friendHint')}</p>
      <label class="text-sm font-bold" for="nm">{tr('yourName')}</label>
      <input id="nm" class="aw-input" maxlength="16" value={app.name} oninput={(e) => setName(e.currentTarget.value)} />
      <button class="aw-btn big" data-testid="host-room" onclick={hostRoom}>🏰 {tr('createRoom')}</button>
      <div class="aw-sep">{tr('joinRoom')}</div>
      <div class="flex gap-2">
        <input class="aw-input uppercase tracking-[.3em] text-center" data-testid="join-code" placeholder="ABCDE" maxlength="8" bind:value={code} onkeydown={(e) => e.key === 'Enter' && joinRoom(code)} />
        <button class="aw-btn wood" data-testid="join-room" disabled={code.trim().length < 4} onclick={() => joinRoom(code)}>{tr('join')}</button>
      </div>
      <div class="aw-sep">{tr('manualTitle')}</div>
      <div class="grid grid-cols-2 gap-2">
        <button class="aw-btn wood small" onclick={() => manualStart('host')}>{tr('manualHost')}</button>
        <button class="aw-btn wood small" onclick={() => manualStart('guest')}>{tr('manualGuest')}</button>
      </div>
      <NetCheck />
      <button class="aw-btn wood small" onclick={() => setMenu('home')}>← {tr('back')}</button>
    {:else if view === 'howto'}
      <h2 class="text-center text-xl font-black">{tr('howTo')}</h2>
      <ul class="flex flex-col gap-2 text-[.92rem] leading-snug">
        {#each trList('howToText') as line}<li class="flex gap-2"><span>▸</span><span>{line}</span></li>{/each}
      </ul>
      <div class="aw-glass p-3 text-xs leading-relaxed">
        <b>{tr('hotkeys')}</b><br />{tr('hk1')} · {tr('hk2')} · {tr('hk3')}<br />{tr('hk4')}
      </div>
      <button class="aw-btn wood small" onclick={() => setMenu('home')}>← {tr('back')}</button>
    {:else if view === 'settings'}
      <h2 class="text-center text-xl font-black">{tr('settings')}</h2>
      <div class="flex items-center justify-between"><span class="font-bold">{tr('language')}</span>
        <span class="flex gap-2"><button class="aw-chip {app.lang === 'ru' ? 'on' : ''}" onclick={() => setLang('ru')}>RU</button><button class="aw-chip {app.lang === 'en' ? 'on' : ''}" onclick={() => setLang('en')}>EN</button></span></div>
      <label class="flex items-center gap-3"><span class="font-bold w-20 shrink-0">{tr('volume')}</span><input type="range" class="aw-range" min="0" max="1" step="0.05" value={app.sfx} oninput={(e) => setSfx(Number(e.currentTarget.value))} /></label>
      <label class="flex items-center gap-3"><span class="font-bold w-20 shrink-0">{tr('music')}</span>
        <input type="checkbox" class="size-5 accent-amber-400" checked={app.musicOn} onchange={(e) => setMusicOn(e.currentTarget.checked)} />
        <input type="range" class="aw-range" min="0" max="1" step="0.05" value={app.music} oninput={(e) => setMusicVol(Number(e.currentTarget.value))} /></label>
      <div class="flex items-center justify-between gap-2"><span class="font-bold">{tr('aiMode')}</span>
        <span class="flex gap-2"><button class="aw-chip {app.smartAi ? 'on' : ''}" onclick={() => setSmartAi(true)}>{tr('aiSmart').split(' (')[0]}</button><button class="aw-chip {!app.smartAi ? 'on' : ''}" onclick={() => setSmartAi(false)}>{tr('aiClassic').split(' (')[0]}</button></span></div>
      <div>
        <label class="flex items-center justify-between"><span class="font-bold">{tr('compat')}</span><input type="checkbox" class="size-5 accent-amber-400" checked={app.compat} onchange={(e) => setCompat(e.currentTarget.checked)} /></label>
        <p class="text-xs opacity-80 mt-1">{tr('compatHint')}</p>
      </div>
      <button class="aw-btn wood small" onclick={goFull}>⛶ {tr('fullscreen')}</button>
      <button class="aw-btn wood small" onclick={() => setMenu('home')}>← {tr('back')}</button>
    {:else}
      <h2 class="text-center text-xl font-black">{tr('about')}</h2>
      <p class="text-sm leading-relaxed">{tr('aboutText')}</p>
      <p class="text-xs opacity-80">{tr('credit')}</p>
      <button class="aw-btn wood small" onclick={() => setMenu('home')}>← {tr('back')}</button>
    {/if}
  </main>

  <footer class="flex flex-col items-center gap-2 text-center">
    <VersionSwitch current="original" block />
  </footer>
  </div>
</div>
