import { test } from '@playwright/test';

test.setTimeout(180000);
test('original in-game scene', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto('/orig-test.html?what=game');
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true, null, { timeout: 90000 });
  await page.evaluate(() => {
    const w = window as unknown as { send: (c: unknown) => void };
    for (let i = 0; i < 5; i++) w.send({ t: 'tray', id: 1 });
  });
  await page.waitForTimeout(8000);
  await page.locator('#c').screenshot({ path: '/tmp/shots/orig-game1.png' });
  await page.evaluate(() => {
    const w = window as unknown as { sim: { player(s: number): { cash: number; xp: number } } };
    w.sim.player(1).cash = 5000;
    w.sim.player(1).xp = 5000;
  });
  await page.evaluate(() => {
    const w = window as unknown as { send: (c: unknown) => void };
    w.send({ t: 'evolve' });
    w.send({ t: 'turret', spot: 1, id: 4 });
    for (let i = 0; i < 4; i++) w.send({ t: 'tray', id: 5 });
  });
  await page.waitForTimeout(15000);
  await page.locator('#c').screenshot({ path: '/tmp/shots/orig-game2.png' });
  if (errs.length) console.log('ERRORS', errs.join('\n'));
});
