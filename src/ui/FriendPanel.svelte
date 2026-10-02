<script lang="ts">
  import { app, closeOverlay, hostRoom, joinRoom, manualStart, setName, tr } from '../lib/app.svelte';
  import NetCheck from './NetCheck.svelte';
  let code = $state('');
</script>

<div class="fixed inset-0 z-30 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
  <div class="glass w-full max-w-md rounded-3xl p-5 flex flex-col gap-3">
    <h2 class="title text-2xl font-black text-amber-300 text-center">{tr('playFriend')}</h2>
    <label class="text-sm font-semibold text-slate-300" for="nm">{tr('yourName')}</label>
    <input id="nm" class="field" maxlength="16" value={app.name} oninput={(e) => setName(e.currentTarget.value)} />
    <button class="btn btn-primary text-lg" onclick={hostRoom}>🏰 {tr('createRoom')}</button>
    <div class="flex items-center gap-2 text-slate-400 text-xs"><hr class="flex-1 border-slate-600" />{tr('joinRoom')}<hr class="flex-1 border-slate-600" /></div>
    <div class="flex gap-2">
      <input id="code" class="field uppercase tracking-[.3em] text-center" placeholder="ABCDE" maxlength="8" bind:value={code} onkeydown={(e) => e.key === 'Enter' && joinRoom(code)} />
      <button class="btn" disabled={code.trim().length < 4} onclick={() => joinRoom(code)}>{tr('join')}</button>
    </div>
    <div class="flex items-center gap-2 text-slate-400 text-xs"><hr class="flex-1 border-slate-600" />{tr('manualTitle')}<hr class="flex-1 border-slate-600" /></div>
    <div class="grid grid-cols-2 gap-2">
      <button class="btn btn-ghost text-sm" onclick={() => manualStart('host')}>{tr('manualHost')}</button>
      <button class="btn btn-ghost text-sm" onclick={() => manualStart('guest')}>{tr('manualGuest')}</button>
    </div>
    <NetCheck />
    <button class="btn btn-ghost" onclick={closeOverlay}>← {tr('back')}</button>
  </div>
</div>
