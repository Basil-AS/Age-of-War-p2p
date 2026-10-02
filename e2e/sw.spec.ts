import { type ChildProcess, spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';

// production build (dist/) behind `vite preview`: the service worker only exists there
let server: ChildProcess;
test.beforeAll(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4180', '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch('http://localhost:4180/')).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
});
test.afterAll(() => {
  server?.kill();
});
test.use({ baseURL: 'http://localhost:4180' });

test('production build boots; second visit serves the art from the service-worker cache', async ({ browser }) => {
  const ctx = await browser.newContext();
  const errs: string[] = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  const ready = () =>
    page.waitForFunction(
      () => (window as unknown as { __aow?: { app: { phase: string } } }).__aow?.app.phase === 'title',
      null,
      { timeout: 90_000 },
    );
  await page.goto('/original.html');
  await ready();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  // let the runtime cache finish storing the first visit
  await page.waitForTimeout(3000);
  const cached = await page.evaluate(async () => (await (await caches.open('orig-assets')).keys()).length);
  expect(cached).toBeGreaterThan(5);

  let fromSw = 0;
  let fromNet = 0;
  page.on('response', (r) => {
    if (!r.url().includes('/orig/')) return;
    if (r.fromServiceWorker()) fromSw++;
    else fromNet++;
  });
  await page.reload();
  await ready();
  expect(fromSw).toBeGreaterThan(5);
  expect(fromNet).toBe(0);
  expect(errs).toEqual([]);
  await ctx.close();
});
