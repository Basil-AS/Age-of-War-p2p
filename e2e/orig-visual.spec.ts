import { test } from '@playwright/test';

test.setTimeout(120000);
for (const f of [5, 8, 9, 12, 14, 15]) {
  test(`main frame ${f}`, async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(`/orig-test.html?frame=${f}`);
    await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true, null, {
      timeout: 60000,
    });
    await page.waitForTimeout(500);
    await page.locator('#c').screenshot({ path: `/tmp/shots/orig-frame${f}.png` });
    if (errs.length) console.log(errs.join('\n'));
  });
}
test('menu panel', async ({ page }) => {
  await page.goto('/orig-test.html?what=menu');
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.locator('#c').screenshot({ path: '/tmp/shots/orig-menu.png' });
});
