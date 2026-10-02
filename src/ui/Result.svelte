<script lang="ts">
  import { app, leave, requestRematch, tr } from '../lib/app.svelte';
</script>

<!-- online matches: the original victory/defeat screen is drawn by the game; these are the extra buttons -->
<div class="fixed inset-x-0 bottom-6 z-30 flex flex-col items-center gap-2 pointer-events-none">
  {#if app.rematch.theirs && !app.rematch.mine}<div class="glass rounded-full px-4 py-1 text-amber-300 text-sm font-semibold">{tr('rematchAsk')}</div>{/if}
  <div class="flex gap-3 pointer-events-auto">
    <button class="btn btn-primary" onclick={requestRematch} disabled={app.rematch.mine}>{app.rematch.mine ? tr('rematchWait') : `↻ ${tr('rematch')}`}</button>
    <button class="btn" onclick={leave}>{tr('menu')}</button>
  </div>
</div>
