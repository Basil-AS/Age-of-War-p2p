import { expect, test } from '@playwright/test';

test('solo: menu → game → screenshots', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.screenshot({ path: '/tmp/shots/menu.png' });
  await page.getByText(/Play vs AI|Игра против ИИ/).click();
  await page.getByText(/▶/).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/shots/game0.png' });
  for (let i = 0; i < 6; i++) { await page.keyboard.press('1'); await page.keyboard.press('2'); await page.waitForTimeout(400); }
  await page.waitForTimeout(25000);
  await page.screenshot({ path: '/tmp/shots/game1.png' });
  expect(errors).toEqual([]);
});
