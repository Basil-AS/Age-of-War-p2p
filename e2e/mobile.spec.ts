import { expect, test } from '@playwright/test';

test('phone landscape layout', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto('/');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: '/tmp/shots/m-menu.png' });
  await p.getByText(/Play vs AI|Игра против ИИ/).click();
  await p.getByText(/▶/).first().click();
  for (let i = 0; i < 5; i++) {
    await p.getByTestId('unit-0').tap();
    await p.waitForTimeout(500);
  }
  await p.waitForTimeout(8000);
  await p.screenshot({ path: '/tmp/shots/m-game.png' });
  await expect(p.getByTestId('special')).toBeVisible();
  await ctx.close();
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const q = await c2.newPage();
  await q.goto('/');
  await q.waitForTimeout(1500);
  await q.screenshot({ path: '/tmp/shots/m-portrait.png' });
});
