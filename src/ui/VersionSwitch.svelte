<script lang="ts">
  /** jump between the two versions (and the launcher) from anywhere */
  let { current, block = false, lang = 'en' }: { current: 'original' | 'lite'; block?: boolean; lang?: 'ru' | 'en' } = $props();
  const ru = $derived(lang === 'ru');
  const other = $derived(current === 'original' ? 'lite' : 'original');
  const label = $derived(other === 'original' ? (ru ? 'Оригинал' : 'Original') : ru ? 'Всраатая' : 'Vsraataya');
</script>

<div class={block ? 'flex gap-2 justify-center' : 'fixed top-2 left-2 z-20 flex gap-2'}>
  <a class="aw-chip no-underline" href="./{other}.html" data-testid="switch-version" style="text-decoration:none">⇄ {label}</a>
  <a class="aw-chip no-underline" href="./index.html" style="text-decoration:none">☰ {ru ? 'Версии' : 'Versions'}</a>
</div>
