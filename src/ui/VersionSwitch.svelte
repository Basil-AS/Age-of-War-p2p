<script lang="ts">
  /** jump between the two versions (and the launcher) from anywhere */
  let { current, block = false }: { current: 'original' | 'lite'; block?: boolean } = $props();
  const ru = /^ru|^uk|^be|^kk/i.test(navigator.language || '');
  const other = $derived(current === 'original' ? 'lite' : 'original');
  const label = $derived(
    other === 'original' ? (ru ? 'Оригинал' : 'Original') : ru ? 'Всраатая' : 'Vsraataya',
  );
</script>

<div class={block ? 'flex gap-2' : 'fixed top-2 left-2 z-20 flex gap-2'}>
  <a class="glass rounded-xl px-3 h-10 grid place-items-center text-sm font-bold no-underline text-amber-200 {block ? 'flex-1' : ''}" href="./{other}.html" data-testid="switch-version">⇄ {label}</a>
  <a class="glass rounded-xl px-3 h-10 grid place-items-center text-sm font-bold no-underline text-slate-200" href="./index.html" aria-label="menu">☰ {ru ? 'Версии' : 'Versions'}</a>
</div>
