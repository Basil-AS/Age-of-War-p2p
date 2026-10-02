import { expect, test } from '@playwright/test';
import { startSolo, waitTitle } from './util';

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

for (const [locale, play, htmlLang] of [
  ['ru-RU', 'Игра против ИИ', 'ru'],
  ['en-US', 'Play vs AI', 'en'],
  ['de-DE', 'Play vs AI', 'en'],
] as const)
  test(`default language from the browser locale ${locale}`, async ({ browser }) => {
    const ctx = await browser.newContext({ locale });
    const page = await ctx.newPage();
    await page.goto('/original.html');
    await waitTitle(page);
    await expect(page.getByTestId('menu-play')).toContainText(play);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe(htmlLang);
    await page.goto('/');
    await expect(page.locator('#orig .name')).toHaveText(htmlLang === 'ru' ? 'Оригинал' : 'Original');
  });

test('the RU/EN switch is visible in the menu, works instantly and is remembered', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();
  await page.goto('/original.html');
  await waitTitle(page);
  await expect(page.getByTestId('lang-switch')).toBeVisible();
  await page.getByTestId('lang-ru').click();
  await expect(page.getByTestId('menu-play')).toContainText('Игра против ИИ');
  await page.getByTestId('menu-howto').click();
  await expect(page.getByText(/Нанимайте юнитов/)).toBeVisible();
  await page.reload();
  await waitTitle(page);
  await expect(page.getByTestId('menu-play')).toContainText('Игра против ИИ'); // remembered
  await page.getByTestId('lang-en').click();
  await expect(page.getByTestId('menu-play')).toContainText('Play vs AI');
});

test('the whole game UI follows the language: HUD, unit names, pause menu, result', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'ru-RU' });
  const page = await ctx.newPage();
  await startSolo(page);
  await expect(page.getByTestId('unit-1')).toHaveAttribute('aria-label', 'Дубинщик');
  await expect(page.getByTestId('evolve')).toContainText('Эволюция');
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('pause-menu')).toContainText('ПАУЗА');
  await page.getByTestId('pause-menu').getByTestId('lang-en').click();
  await expect(page.getByTestId('pause-menu')).toContainText('PAUSED');
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('unit-1')).toHaveAttribute('aria-label', 'Clubman');
  await expect(page.getByTestId('evolve')).toContainText('Evolve');
});

test('lite version and launcher have the switch too', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.locator('#lang [data-l="en"]').click();
  await expect(page.locator('#orig .name')).toHaveText('Original');
  await page.goto('/lite.html');
  await expect(page.getByTestId('lang-switch')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Play vs|Against|AI/i).first()).toBeVisible(); // launcher choice (EN) carried over
});
