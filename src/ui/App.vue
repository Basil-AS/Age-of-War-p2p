<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { app, boot, buySlot, buyTurret, buyUnit, evolve, getMatch, sellLast, special, toggleMenu } from '../lib/app';
import { turretsOfAge, unitsOfAge } from '../sim/data';
import Hud from './Hud.vue';
import Lobby from './Lobby.vue';
import Menu from './Menu.vue';
import Overlays from './Overlays.vue';

const canvas = ref<HTMLCanvasElement>();

function onKey(e: KeyboardEvent) {
  if (app.screen !== 'game' || e.target instanceof HTMLInputElement) return;
  const m = getMatch();
  if (!m) return;
  const age = m.sim.players[m.side].age;
  const k = e.key.toLowerCase();
  if (k === 'escape') return toggleMenu();
  if (app.menuOpen) return;
  if (k >= '1' && k <= '4') {
    const u = unitsOfAge(age)[Number(k) - 1];
    if (u) buyUnit(u.id);
  } else if (k === 'q' || k === 'w' || k === 'e') {
    const t = turretsOfAge(age)['qwe'.indexOf(k)];
    if (t) buyTurret(t.id);
  } else if (k === 'r') buySlot();
  else if (k === 'f') sellLast();
  else if (k === ' ') {
    e.preventDefault();
    special();
  } else if (k === 'enter') evolve();
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  void boot(canvas.value as HTMLCanvasElement);
});
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <canvas id="stage" ref="canvas"></canvas>
  <div v-if="!app.ready" class="fixed inset-0 grid place-items-center menu-bg">
    <div class="title text-3xl text-amber-300 animate-pulse">AGE OF WAR</div>
  </div>
  <Menu v-else-if="app.screen === 'menu'" />
  <Lobby v-else-if="app.screen === 'lobby'" />
  <template v-else>
    <Hud />
    <Overlays />
  </template>
</template>
