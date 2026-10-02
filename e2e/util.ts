import type { Page } from '@playwright/test';

type W = { __aow: { app: { phase: string } } };

export const phase = (page: Page) => page.evaluate(() => (window as unknown as W).__aow.app.phase);

export const waitTitle = (page: Page) =>
  page.waitForFunction(() => (window as unknown as W).__aow?.app.phase === 'title', null, { timeout: 90_000 });

/** title → Play → difficulty, through the real menu buttons */
export async function startSolo(page: Page, url = '/original.html', level: 1 | 2 | 3 = 1) {
  await page.goto(url);
  await waitTitle(page);
  await page.getByTestId('menu-play').click();
  await page.getByTestId(`lvl-${level}`).click();
  await page.waitForFunction(() => (window as unknown as W).__aow.app.phase === 'game', null, { timeout: 30_000 });
  await page.getByTestId('hud').waitFor({ timeout: 10_000 });
}
