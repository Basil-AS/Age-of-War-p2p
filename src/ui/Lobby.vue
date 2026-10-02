<script setup lang="ts">
import { ref } from 'vue';
import { app, cancelLobby, hostRoom, joinRoom, setRelay, tr } from '../lib/app';
import type { Relay } from '../net/trystero';

const copied = ref(false);
const relays: Relay[] = ['nostr', 'torrent', 'mqtt'];
const canShare = 'share' in navigator;

async function copy() {
  try {
    await navigator.clipboard.writeText(app.lobby.link);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1600);
  } catch {
    /* clipboard blocked */
  }
}
async function share() {
  try {
    await navigator.share?.({ title: 'Age of War', url: app.lobby.link });
  } catch {
    /* cancelled */
  }
}
function pick(r: Relay) {
  setRelay(r);
  if (app.lobby.role === 'host') void hostRoom();
  else void joinRoom(app.lobby.code);
}
</script>

<template>
  <div class="fixed inset-0 menu-bg grid place-items-center p-5 overflow-auto">
    <div class="glass w-full max-w-md rounded-3xl p-6 flex flex-col gap-4 text-center">
      <template v-if="app.lobby.role === 'host'">
        <div class="text-slate-300 text-sm">{{ tr('roomCode') }}</div>
        <div class="title text-6xl font-black text-amber-300 tracking-[.25em]" data-testid="room-code">{{ app.lobby.code }}</div>
        <div class="text-sm text-slate-300">{{ tr('share') }}</div>
        <input class="field text-xs" readonly :value="app.lobby.link" @focus="($event.target as HTMLInputElement).select()" />
        <div class="flex gap-2 justify-center">
          <button class="btn btn-primary" @click="copy">{{ copied ? tr('copied') : '📋 ' + tr('copy') }}</button>
          <button v-if="canShare" class="btn" @click="share">📤</button>
        </div>
      </template>
      <div v-else class="title text-5xl font-black text-amber-300 tracking-[.25em]">{{ app.lobby.code }}</div>

      <div class="flex items-center justify-center gap-3 text-lg font-semibold">
        <span v-if="app.lobby.state === 'connected'" class="text-emerald-400">✓ {{ tr('connected') }}</span>
        <span v-else-if="app.lobby.state === 'error'" class="text-rose-400 text-sm">{{ app.lobby.error }}</span>
        <template v-else>
          <span class="inline-block size-3 rounded-full bg-amber-400 animate-ping"></span>
          <span>{{ app.lobby.role === 'host' ? tr('waiting') : tr('connecting') }}</span>
        </template>
      </div>

      <template v-if="app.lobby.slow">
        <p class="text-sm text-amber-200">{{ tr('lobbyTimeout') }}</p>
        <div class="grid grid-cols-3 gap-2">
          <button v-for="r in relays" :key="r" class="btn text-sm" :class="{ 'btn-primary': app.relay === r }" @click="pick(r)">{{ r }}</button>
        </div>
      </template>
      <button class="btn btn-ghost" @click="cancelLobby">← {{ tr('back') }}</button>
    </div>
  </div>
</template>
