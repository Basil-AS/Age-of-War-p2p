<script lang="ts">
  import { app, tr } from '../lib/app.svelte';
  import { VIA_NAMES } from '../lib/i18n';
  const viaKind = (v: string) => (v === 'turn' ? 'turn' : v === 'local' ? 'local' : v === 'lan' ? 'lan' : v.startsWith('relay') ? 'relay' : 'direct');
</script>

{#if app.phase === 'game' && app.net.online}
  <div class="fixed top-1 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 pointer-events-none">
    <div class="glass rounded-full px-3 py-0.5 text-[11px] font-bold tabular-nums flex gap-2 items-center">
      <span class={app.net.rtt > 150 ? 'text-rose-400' : app.net.rtt > 80 ? 'text-amber-300' : 'text-emerald-400'}>● {app.net.rtt}ms</span>
      <span class="text-slate-400 font-semibold" data-testid="via">{VIA_NAMES[app.lang][viaKind(app.net.via)]}</span>
      <span class="text-slate-300">{app.peerName}</span>
      {#if app.net.routes.length > 1}<span class="text-slate-500 font-normal" title={app.net.routes.map((r) => `${r.id}: ${r.alive ? r.rtt + " ms" : "down"}${r.active ? " ●" : ""}`).join("\n")}>{app.net.routes.filter((r) => r.alive).length}/{app.net.routes.length} ↔</span>{/if}
    </div>
    {#if app.net.stalled}<div class="glass rounded-full px-3 py-0.5 text-xs text-amber-300 animate-pulse">{tr('waitingOpp')}</div>{/if}
    {#if app.net.desync}<div class="glass rounded-full px-3 py-0.5 text-xs text-rose-300 font-bold">{tr('desync')}</div>{/if}
    {#if app.net.peerLeft}<div class="glass rounded-full px-3 py-0.5 text-xs text-rose-300 font-bold">{tr('peerLeft')}</div>{/if}
  </div>
{/if}
