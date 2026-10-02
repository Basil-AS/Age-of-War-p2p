import { test } from '@playwright/test';

test('gallery of ages', async ({ page }) => {
  await page.goto('/');
  await page.getByText(/Play vs AI|Игра против ИИ/).click();
  await page.getByText(/▶/).first().click();
  await page.waitForTimeout(800);
  for (let age = 0; age < 5; age++) {
    await page.evaluate((a) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = (window as any).__aow.match;
      const p = m.sim.players;
      for (const q of p) { q.age = a; q.baseMax = 5000; q.baseHp = 5000; q.gold = 9e6; q.slots = 4; }
      p[1].free = false;
      const ids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].filter((i) => (i === 15 ? a === 4 : Math.floor(i / 3) === a));
      for (const side of [0, 1]) {
        ids.slice(0, 3).forEach((u: number) => m.sim.apply(side, { t: 'buy', u }));
        const t0 = a * 3;
        [0, 1, 2].forEach((k) => m.sim.apply(side, { t: 'turret', id: t0 + k, slot: k }));
      }
      m.sim.players[1].free = true;
    }, age);
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `/tmp/shots/age${age}.png` });
  }
});
