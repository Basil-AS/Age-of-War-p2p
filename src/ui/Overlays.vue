<script setup lang="ts">
import { computed } from 'vue';
import { ageName, app, leave, requestRematch, setMusicOn, setSpeed, setVol, toggleMenu, tr } from '../lib/app';

const h = computed(() => app.hud);
const done = computed(() => !!h.value && h.value.winner !== -1);
const mm = computed(() => (h.value ? `${Math.floor(h.value.time / 60)}:${String(Math.floor(h.value.time % 60)).padStart(2, '0')}` : ''));
const val = (e: Event) => (e.target as HTMLInputElement).value;
const goFull = () => document.documentElement.requestFullscreen?.().catch(() => {});
</script>

<template>
  <div v-if="app.net.desync" class="fixed top-16 inset-x-0 grid place-items-center z-30 pointer-events-none">
    <div class="glass rounded-xl px-4 py-2 text-rose-300 font-bold">{{ tr('desync') }}</div>
  </div>

  <div v-if="app.net.peerLeft && !done" class="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4">
    <div class="glass rounded-3xl p-6 text-center flex flex-col gap-4">
      <div class="text-xl font-bold">{{ tr('peerLeft') }}</div>
      <button class="btn btn-primary" @click="leave">{{ tr('menu') }}</button>
    </div>
  </div>

  <div v-if="done && h" class="fixed inset-0 z-40 grid place-items-center bg-black/55 p-4 backdrop-blur-sm">
    <div class="glass rounded-3xl p-6 sm:p-8 text-center flex flex-col gap-4 min-w-[min(92vw,360px)]">
      <div class="title text-5xl font-black" :class="h.winner === 1 ? 'text-amber-300' : h.winner === 0 ? 'text-rose-400' : 'text-slate-200'" data-testid="result">
        {{ h.winner === 1 ? tr('victory') : h.winner === 0 ? tr('defeat') : tr('draw') }}
      </div>
      <div class="grid grid-cols-3 gap-2 text-sm">
        <div class="glass rounded-xl p-2"><div class="text-slate-400 text-xs">{{ tr('time') }}</div><div class="font-bold">{{ mm }}</div></div>
        <div class="glass rounded-xl p-2"><div class="text-slate-400 text-xs">{{ tr('kills') }}</div><div class="font-bold">{{ h.kills }}</div></div>
        <div class="glass rounded-xl p-2"><div class="text-slate-400 text-xs">{{ tr('reachedAge') }}</div><div class="font-bold text-xs">{{ ageName(h.age) }}</div></div>
      </div>
      <div v-if="app.rematch.theirs && !app.rematch.mine" class="text-amber-300 text-sm font-semibold">{{ tr('rematchAsk') }}</div>
      <button class="btn btn-primary" :disabled="app.rematch.mine && app.net.online" @click="requestRematch">
        {{ app.rematch.mine && app.net.online ? tr('rematchWait') : '↻ ' + tr('rematch') }}
      </button>
      <button class="btn btn-ghost" @click="leave">{{ tr('menu') }}</button>
    </div>
  </div>

  <div v-else-if="app.menuOpen" class="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
    <div class="glass rounded-3xl p-6 flex flex-col gap-3 min-w-[min(92vw,340px)]">
      <button class="btn btn-primary" @click="toggleMenu">▶ {{ tr('resume') }}</button>
      <label class="flex items-center gap-3">
        <span class="font-semibold w-16">{{ tr('volume') }}</span>
        <input type="range" min="0" max="1" step="0.05" class="flex-1 accent-amber-400" :value="app.volume" @input="setVol(Number(val($event)))" />
      </label>
      <label class="flex items-center gap-3">
        <span class="font-semibold w-16">{{ tr('music') }}</span>
        <input type="checkbox" class="size-5 accent-amber-400" :checked="app.music" @change="setMusicOn(($event.target as HTMLInputElement).checked)" />
      </label>
      <div v-if="!app.net.online" class="flex items-center gap-2">
        <span class="font-semibold w-16">{{ tr('speed') }}</span>
        <button v-for="s in [1, 2, 3]" :key="s" class="btn !px-3 !py-1.5" :class="{ 'btn-primary': app.speed === s }" @click="setSpeed(s)">{{ s }}×</button>
      </div>
      <button class="btn" @click="goFull">⛶ {{ tr('fullscreen') }}</button>
      <button class="btn btn-ghost" @click="leave">{{ tr('leave') }}</button>
    </div>
  </div>
</template>
