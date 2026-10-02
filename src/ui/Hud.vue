<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  ageName, app, buySlot, buyTurret, buyUnit, cancelQueue, evolve, fmt, freeSlotIndex, sellSlot, setInsets, special,
  specialName, toggleMenu, tr, turretName, unitName,
} from '../lib/app';
import { TURRETS } from '../sim/data';

const top = ref<HTMLElement>();
const bottom = ref<HTMLElement>();
let ro: ResizeObserver | null = null;
onMounted(() => {
  const t = top.value as HTMLElement;
  const b = bottom.value as HTMLElement;
  const upd = () => setInsets(t.offsetHeight * 0.55, b.offsetHeight + 2);
  upd();
  ro = new ResizeObserver(upd);
  ro.observe(t);
  ro.observe(b);
});
onUnmounted(() => ro?.disconnect());

const h = computed(() => app.hud);
const myAge = computed(() => h.value?.age ?? 0);
const xpPct = computed(() => (h.value?.xpNeed ? Math.min(100, (h.value.xp / h.value.xpNeed) * 100) : 100));
const hpPct = (a: number, b: number) => Math.max(0, Math.min(100, (a / b) * 100));
const mm = computed(() => (h.value ? `${Math.floor(h.value.time / 60)}:${String(Math.floor(h.value.time % 60)).padStart(2, '0')}` : ''));
const hasSlotFree = computed(() => (h.value ? freeSlotIndex({ turrets: h.value.slots, slots: h.value.slotsOwned }) >= 0 : false));
const SPECIAL_ICONS = ['☄️', '🏹', '💚', '💣', '🛰️'];
const bannerText = computed(() => {
  const b = app.banner;
  if (!b) return '';
  if (b.kind.startsWith('evolve')) return `${b.kind === 'evolve-me' ? tr('evolved') : tr('enemyEvolved')} ${ageName(Number(b.text))}`;
  const map: Record<string, number> = { meteors: 0, arrows: 1, heal: 2, bombs: 3, lasers: 4 };
  return `${b.kind === 'special-me' ? tr('youCast') : tr('enemyCast')}: ${specialName(map[b.text] ?? 0)}`;
});
const sellTitle = (id: number | null | undefined) =>
  id !== null && id !== undefined ? `${tr('sell')} ${turretName(id)} +${fmt(Math.floor((TURRETS[id]?.cost ?? 0) / 2))}` : tr('free');
</script>

<template>
  <div class="rotate-hint fixed inset-0 z-50 place-items-center bg-black/85 text-center p-8 text-xl font-bold">📱↻<br />{{ tr('rotate') }}</div>

  <!-- top bar -->
  <div ref="top" class="fixed top-0 inset-x-0 p-2 sm:p-3 short:p-1 flex items-start gap-2 sm:gap-3 pointer-events-none z-10">
    <template v-if="h">
      <div class="glass rounded-2xl p-2 sm:p-3 short:p-1.5 short:gap-1 pointer-events-auto flex flex-col gap-1.5 w-[min(46vw,360px)]">
        <div class="flex items-center justify-between gap-2 text-sm sm:text-base">
          <span class="font-extrabold text-sky-300 truncate">{{ ageName(myAge) }}</span>
          <span class="font-extrabold text-amber-300 tabular-nums" data-testid="gold">🪙 {{ fmt(h.gold) }}</span>
        </div>
        <div class="h-3 short:h-2 rounded-full bg-slate-900/80 overflow-hidden" title="HP">
          <div class="h-full bg-gradient-to-r from-sky-500 to-sky-300 transition-[width]" :style="{ width: hpPct(h.baseHp, h.baseMax) + '%' }"></div>
        </div>
        <div class="flex items-center gap-2">
          <div class="relative flex-1 h-4 rounded-full bg-slate-900/80 overflow-hidden">
            <div class="h-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-[width]" :style="{ width: xpPct + '%' }"></div>
            <span class="absolute inset-0 text-[10px] font-bold text-center leading-4 tabular-nums">{{ tr('xp') }} {{ fmt(h.xp) }}{{ h.xpNeed ? ` / ${fmt(h.xpNeed)}` : ` ${tr('max')}` }}</span>
          </div>
          <button class="btn btn-primary !py-1 !px-3 text-xs" :class="{ ready: h.canEvolve }" :disabled="!h.canEvolve" data-testid="evolve" @click="evolve">⬆ {{ tr('evolve') }}</button>
        </div>
      </div>

      <div class="flex-1 flex flex-col items-center gap-1 pointer-events-none">
        <div class="glass rounded-full px-3 py-1 text-xs sm:text-sm font-bold tabular-nums">
          {{ mm }}
          <span v-if="app.net.online" class="ml-2" :class="app.net.rtt > 200 ? 'text-rose-400' : 'text-emerald-400'">● {{ app.net.rtt }}ms</span>
        </div>
        <div v-if="app.net.stalled" class="glass rounded-full px-3 py-1 text-xs text-amber-300 animate-pulse">{{ tr('waitingOpp') }}</div>
      </div>

      <div class="glass rounded-2xl p-2 sm:p-3 short:p-1.5 short:gap-1 pointer-events-auto flex flex-col gap-1.5 w-[min(36vw,260px)]">
        <div class="flex items-center justify-between gap-2 text-sm">
          <span class="font-extrabold text-rose-300 truncate">{{ app.peerName || 'AI' }}</span>
          <span class="text-xs text-slate-300 truncate">{{ ageName(h.eAge) }}</span>
        </div>
        <div class="h-3 short:h-2 rounded-full bg-slate-900/80 overflow-hidden">
          <div class="h-full bg-gradient-to-r from-rose-300 to-rose-500 transition-[width] ml-auto" :style="{ width: hpPct(h.eHp, h.eMax) + '%' }"></div>
        </div>
      </div>
      <button class="glass pointer-events-auto rounded-xl size-10 shrink-0 grid place-items-center text-lg" aria-label="menu" @click="toggleMenu">☰</button>
    </template>
  </div>

  <!-- banner (re-keyed so the CSS animation restarts) -->
  <div v-if="app.banner" :key="app.banner.id" class="fixed inset-x-0 top-[28%] grid place-items-center pointer-events-none z-20">
    <div class="banner title text-3xl sm:text-5xl font-black px-6 py-2 rounded-2xl text-center" :class="app.banner.kind.endsWith('me') ? 'text-amber-300' : 'text-rose-300'">{{ bannerText }}</div>
  </div>

  <!-- bottom panel -->
  <div ref="bottom" class="fixed bottom-0 inset-x-0 p-2 sm:p-3 short:p-1 z-10">
    <div v-if="h" class="glass rounded-2xl p-2 sm:p-3 short:p-1.5 flex flex-wrap items-stretch justify-center gap-2 sm:gap-4 short:gap-2">
      <!-- units -->
      <div class="flex flex-col gap-1.5">
        <div class="flex gap-1.5 sm:gap-2">
          <button v-for="(u, i) in h.units" :key="u.def" class="card w-[72px] sm:w-24 short:w-[60px] p-1 short:p-0.5 flex flex-col items-center" :class="{ off: !u.ok }" :data-testid="'unit-' + i" @click="buyUnit(u.def)">
            <span class="kbd">{{ i + 1 }}</span>
            <img :src="app.icons['u' + u.def]" alt="" class="h-11 sm:h-14 short:h-8 object-contain" draggable="false" />
            <span class="text-[10px] sm:text-xs font-bold leading-tight text-center truncate w-full short:hidden">{{ unitName(u.def) }}</span>
            <span class="text-[11px] sm:text-xs font-extrabold text-amber-300 tabular-nums">🪙 {{ fmt(u.cost) }}</span>
          </button>
        </div>
        <div class="flex gap-1 items-center h-7">
          <span class="text-[10px] text-slate-400 w-12">{{ tr('queue') }}</span>
          <button v-for="i in 5" :key="i" class="relative size-7 rounded-md border border-slate-600 bg-slate-900/70 overflow-hidden" :disabled="!h.queue[i - 1]" title="✕" @click="cancelQueue(i - 1)">
            <template v-if="h.queue[i - 1]">
              <img :src="app.icons['u' + (h.queue[i - 1] as { def: number }).def]" alt="" class="absolute inset-0 size-full object-contain p-0.5" />
              <div v-if="i === 1" class="absolute bottom-0 inset-x-0 bg-amber-400/70" :style="{ height: (h.queue[0] as { frac: number }).frac * 100 + '%' }"></div>
            </template>
          </button>
        </div>
      </div>

      <!-- turrets -->
      <div class="flex flex-col gap-1.5">
        <div class="flex gap-1.5 sm:gap-2">
          <button v-for="(t, i) in h.turretBuy" :key="t.id" class="card w-[72px] sm:w-24 short:w-[60px] p-1 short:p-0.5 flex flex-col items-center" :class="{ off: !t.ok }" :data-testid="'turret-' + i" @click="buyTurret(t.id)">
            <span class="kbd">{{ 'QWE'[i] }}</span>
            <img :src="app.icons['t' + t.id]" alt="" class="h-9 sm:h-12 short:h-7 object-contain" draggable="false" />
            <span class="text-[10px] sm:text-xs font-bold leading-tight text-center truncate w-full short:hidden">{{ turretName(t.id) }}</span>
            <span class="text-[11px] sm:text-xs font-extrabold text-amber-300 tabular-nums">🪙 {{ fmt(t.cost) }}</span>
          </button>
        </div>
        <div class="flex gap-1 items-center h-7">
          <span class="text-[10px] text-slate-400 w-12">{{ tr('turrets') }}</span>
          <template v-for="s in 4" :key="s">
            <button v-if="s - 1 < h.slotsOwned" class="size-7 rounded-md border border-slate-600 bg-slate-900/70 grid place-items-center overflow-hidden" :disabled="h.slots[s - 1] === null || h.slots[s - 1] === undefined" :title="sellTitle(h.slots[s - 1])" @click="sellSlot(s - 1)">
              <img v-if="h.slots[s - 1] !== null && h.slots[s - 1] !== undefined" :src="app.icons['t' + h.slots[s - 1]]" alt="" class="size-full object-contain" />
            </button>
            <button v-else class="h-7 px-1.5 rounded-md border border-amber-500/60 bg-slate-900/70 text-[10px] font-bold text-amber-300" :class="{ 'opacity-50': !(s - 1 === h.slotsOwned && h.canSlot) }" :disabled="s - 1 !== h.slotsOwned || !h.canSlot" :title="tr('buySlot')" @click="buySlot">
              {{ s - 1 === h.slotsOwned ? `+🪙${fmt(h.slotCost ?? 0)}` : '🔒' }}
            </button>
          </template>
          <span v-if="!hasSlotFree" class="text-[10px] text-slate-500">F</span>
        </div>
      </div>

      <!-- special -->
      <button class="relative rounded-2xl w-24 sm:w-28 short:w-16 border border-amber-400/60 bg-gradient-to-b from-orange-600/80 to-rose-700/80 overflow-hidden flex flex-col items-center justify-center p-1" :class="h.specialReady ? 'ready' : 'opacity-80'" :disabled="!h.specialReady" data-testid="special" @click="special">
        <span class="kbd">␣</span>
        <span class="text-2xl sm:text-3xl short:text-xl">{{ SPECIAL_ICONS[myAge] }}</span>
        <span class="text-[10px] sm:text-xs font-extrabold leading-tight text-center short:hidden">{{ specialName(myAge) }}</span>
        <template v-if="!h.specialReady">
          <div class="absolute bottom-0 inset-x-0 bg-black/60" :style="{ height: h.specialCd * 100 + '%' }"></div>
          <span class="absolute inset-0 grid place-items-center text-xl font-black tabular-nums">{{ Math.ceil(h.specialCd * 60) }}</span>
        </template>
      </button>
    </div>
  </div>
</template>
