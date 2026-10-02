<script lang="ts">
  /** RU | EN — defaults to the browser language, the choice is remembered (shared by both versions) */
  let { lang, set }: { lang: 'ru' | 'en'; set: (l: 'ru' | 'en') => void } = $props();
</script>

<div class="aw-ui inline-flex rounded-full border-2 border-[var(--aw-line)] bg-black/30 p-0.5 backdrop-blur-sm" role="group" aria-label="Language / Язык" data-testid="lang-switch">
  <button class="aw-chip !min-h-[30px] !border-0 {lang === 'ru' ? 'on' : ''}" data-testid="lang-ru" aria-pressed={lang === 'ru'} onclick={() => set('ru')}>RU</button>
  <button class="aw-chip !min-h-[30px] !border-0 {lang === 'en' ? 'on' : ''}" data-testid="lang-en" aria-pressed={lang === 'en'} onclick={() => set('en')}>EN</button>
</div>
