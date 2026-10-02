<script lang="ts">
  import { type CheckResult, formatReport, judge, runNetCheck } from '../net/netcheck';

  const ru = /^ru|^uk|^be|^kk/i.test(navigator.language || '');
  const T = ru
    ? { run: '🔍 Проверка сети', running: 'Проверяю…', copy: '📋 Копировать отчёт', copied: 'Скопировано', good: 'Прямое P2P должно работать', maybe: 'P2P возможен, но через ретранслятор', unlikely: 'Сигнальные серверы недоступны — используйте ручные коды или свой сервер' }
    : { run: '🔍 Network check', running: 'Checking…', copy: '📋 Copy report', copied: 'Copied', good: 'Direct P2P should work', maybe: 'P2P possible, probably via a relay', unlikely: 'Signalling servers unreachable — use manual codes or your own server' };
  let results = $state<CheckResult[]>([]);
  let busy = $state(false);
  let copied = $state(false);
  const verdict = $derived(judge(results));

  async function run() {
    busy = true;
    copied = false;
    results = [];
    await runNetCheck({ onResult: (r) => (results = [...results, r]) });
    busy = false;
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(formatReport(results));
      copied = true;
    } catch {
      /* clipboard blocked */
    }
  }
</script>

<div class="flex flex-col gap-2">
  <button class="btn btn-ghost text-sm" disabled={busy} onclick={run} data-testid="netcheck-run">{busy ? T.running : T.run}</button>
  {#if results.length}
    <div class="text-xs leading-tight max-h-40 overflow-auto glass rounded-xl p-2" data-testid="netcheck-results">
      {#each results as r}
        <div class="flex justify-between gap-2"><span class="truncate">{r.ok ? '✅' : '❌'} {r.kind} · {r.target}</span><span class="tabular-nums text-slate-400">{r.ok ? `${r.ms} ms` : r.detail ?? ''}</span></div>
      {/each}
    </div>
    {#if !busy}
      <div class="text-sm font-semibold {verdict.directP2P === 'good' ? 'text-emerald-400' : verdict.directP2P === 'maybe' ? 'text-amber-300' : 'text-rose-400'}">
        {verdict.directP2P === 'good' ? T.good : verdict.directP2P === 'maybe' ? T.maybe : T.unlikely} · {verdict.summary.join(' · ')}
      </div>
      <button class="btn btn-ghost text-xs" onclick={copy}>{copied ? T.copied : T.copy}</button>
    {/if}
  {/if}
</div>
