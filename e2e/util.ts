import type { Page } from '@playwright/test';

type W = { __aow: { app: { phase: string }; toPage(x: number, y: number): { x: number; y: number } } };

export const phase = (page: Page) => page.evaluate(() => (window as unknown as W).__aow.app.phase);

export const waitTitle = (page: Page) =>
  page.waitForFunction(() => (window as unknown as W).__aow?.app.phase === 'title', null, { timeout: 90_000 });

/** click in the 650×450 stage coordinate system */
export async function stageClick(page: Page, x: number, y: number) {
  const p = await page.evaluate(([a, b]) => (window as unknown as W).__aow.toPage(a as number, b as number), [x, y]);
  await page.mouse.click(p.x, p.y);
}

/** title → Play → Normal, retrying clicks until the game really starts (slow software GL can swallow a click) */
export async function startSolo(page: Page, url = '/original.html') {
  await page.goto(url);
  await waitTitle(page);
  await page.waitForTimeout(800);
  for (let i = 0; i < 12; i++) {
    if ((await phase(page)) === 'game') return;
    await stageClick(page, 325, i % 2 === 0 ? 218 : 172); // "Play", then "Normal"
    await page.waitForTimeout(900);
  }
  if ((await phase(page)) !== 'game') throw new Error('could not start a solo game');
}
