<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import {
  app, hostRoom, joinRoom, setDifficulty, setLang, setMusicOn, setName, setRelay, setVol, startSolo, tr, trList,
} from '../lib/app';
import type { Relay } from '../net/trystero';
import type { Difficulty } from '../sim/types';

type Panel = 'main' | 'ai' | 'friend' | 'howto' | 'settings' | 'about';
const panel = ref<Panel>('main');
const code = ref('');
const diffs: Difficulty[] = ['easy', 'normal', 'hard', 'insane'];
const relays: Relay[] = ['nostr', 'torrent', 'mqtt'];
const installEvt = ref<(Event & { prompt?: () => void }) | null>(null);

const onInstall = (e: Event) => {
  e.preventDefault();
  installEvt.value = e as Event & { prompt?: () => void };
};
onMounted(() => window.addEventListener('beforeinstallprompt', onInstall));
onUnmounted(() => window.removeEventListener('beforeinstallprompt', onInstall));
const goFull = () => document.documentElement.requestFullscreen?.().catch(() => {});
const val = (e: Event) => (e.target as HTMLInputElement).value;
</script>

<template>
  <div class="fixed inset-0 menu-bg overflow-auto">
    <div class="min-h-full flex flex-col items-center justify-center gap-6 p-5">
      <div class="text-center">
        <h1 class="title text-5xl sm:text-7xl font-black text-amber-300">{{ tr('title') }}</h1>
        <p class="mt-2 text-slate-300 font-semibold">{{ tr('sub') }}</p>
      </div>

      <div class="glass w-full max-w-md rounded-3xl p-5 flex flex-col gap-3">
        <template v-if="panel === 'main'">
          <button class="btn btn-primary text-lg" @click="panel = 'friend'">⚔️ {{ tr('playFriend') }}</button>
          <button class="btn" @click="panel = 'ai'">🤖 {{ tr('playAi') }}</button>
          <div class="grid grid-cols-3 gap-2">
            <button class="btn btn-ghost text-sm" @click="panel = 'howto'">📖 {{ tr('howTo') }}</button>
            <button class="btn btn-ghost text-sm" @click="panel = 'settings'">⚙️ {{ tr('settings') }}</button>
            <button class="btn btn-ghost text-sm" @click="panel = 'about'">ℹ️ {{ tr('about') }}</button>
          </div>
          <button v-if="installEvt" class="btn btn-ghost text-sm" @click="installEvt?.prompt?.()">📲 {{ tr('install') }}</button>
        </template>

        <template v-else-if="panel === 'ai'">
          <h2 class="font-bold text-lg">{{ tr('difficulty') }}</h2>
          <div class="grid grid-cols-2 gap-2">
            <button v-for="d in diffs" :key="d" class="btn" :class="{ 'btn-primary': app.difficulty === d }" @click="setDifficulty(d)">{{ tr(d) }}</button>
          </div>
          <button class="btn btn-primary text-lg mt-2" @click="startSolo()">▶ {{ tr('start') }}</button>
          <button class="btn btn-ghost" @click="panel = 'main'">← {{ tr('back') }}</button>
        </template>

        <template v-else-if="panel === 'friend'">
          <label class="text-sm font-semibold text-slate-300" for="nm">{{ tr('yourName') }}</label>
          <input id="nm" class="field" maxlength="16" :value="app.name" @input="setName(val($event))" />
          <button class="btn btn-primary text-lg" @click="hostRoom()">🏰 {{ tr('createRoom') }}</button>
          <div class="flex items-center gap-2 text-slate-400 text-xs">
            <hr class="flex-1 border-slate-600" />{{ tr('joinRoom') }}<hr class="flex-1 border-slate-600" />
          </div>
          <div class="flex gap-2">
            <input id="code" v-model="code" class="field uppercase tracking-[.3em] text-center" placeholder="ABCDE" maxlength="8" @keydown.enter="joinRoom(code)" />
            <button class="btn" :disabled="code.trim().length < 4" @click="joinRoom(code)">{{ tr('join') }}</button>
          </div>
          <button class="btn btn-ghost" @click="panel = 'main'">← {{ tr('back') }}</button>
        </template>

        <template v-else-if="panel === 'howto'">
          <ul class="flex flex-col gap-3 text-sm leading-relaxed">
            <li v-for="line in trList('howToText')" :key="line" class="flex gap-2"><span>▸</span><span>{{ line }}</span></li>
          </ul>
          <div class="text-xs text-slate-400 mt-1">{{ tr('hotkeys') }}: {{ tr('hk1') }} · {{ tr('hk2') }} · {{ tr('hk3') }} · {{ tr('hk4') }}</div>
          <button class="btn btn-ghost" @click="panel = 'main'">← {{ tr('back') }}</button>
        </template>

        <template v-else-if="panel === 'settings'">
          <div class="flex items-center justify-between">
            <span class="font-semibold">{{ tr('language') }}</span>
            <div class="flex gap-2">
              <button class="btn" :class="{ 'btn-primary': app.lang === 'ru' }" @click="setLang('ru')">RU</button>
              <button class="btn" :class="{ 'btn-primary': app.lang === 'en' }" @click="setLang('en')">EN</button>
            </div>
          </div>
          <label class="flex items-center justify-between gap-4">
            <span class="font-semibold">{{ tr('volume') }}</span>
            <input type="range" min="0" max="1" step="0.05" class="flex-1 accent-amber-400" :value="app.volume" @input="setVol(Number(val($event)))" />
          </label>
          <label class="flex items-center justify-between">
            <span class="font-semibold">{{ tr('music') }}</span>
            <input type="checkbox" class="size-5 accent-amber-400" :checked="app.music" @change="setMusicOn(($event.target as HTMLInputElement).checked)" />
          </label>
          <div>
            <div class="font-semibold mb-1">{{ tr('relay') }}</div>
            <div class="grid grid-cols-3 gap-2">
              <button v-for="r in relays" :key="r" class="btn text-sm" :class="{ 'btn-primary': app.relay === r }" @click="setRelay(r)">{{ r }}</button>
            </div>
            <p class="text-xs text-slate-400 mt-1">{{ tr('relayHint') }}</p>
          </div>
          <button class="btn btn-ghost" @click="goFull">⛶ {{ tr('fullscreen') }}</button>
          <button class="btn btn-ghost" @click="panel = 'main'">← {{ tr('back') }}</button>
        </template>

        <template v-else>
          <p class="text-sm leading-relaxed">{{ tr('aboutText') }}</p>
          <button class="btn btn-ghost" @click="panel = 'main'">← {{ tr('back') }}</button>
        </template>
      </div>
    </div>
  </div>
</template>
