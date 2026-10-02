import { defineConfig, devices } from '@playwright/test';

const cross = !!process.env.CROSS_BROWSER;
const live = process.env.LIVE_URL; // post-deploy run against the real site: no local servers

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: live ?? 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: live ? undefined : /cross-browser/,
      testMatch: live ? /live\.spec/ : undefined,
      use: {
        launchOptions: {
          executablePath: process.env.CHROMIUM_PATH || undefined,
          args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
        },
      },
    },
    // Firefox / WebKit run only the cross-browser smoke spec (CI sets CROSS_BROWSER=1 and installs them)
    ...(cross
      ? [
          {
            name: 'firefox',
            testMatch: /cross-browser/,
            use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 720 } },
          },
          {
            name: 'webkit',
            testMatch: /cross-browser/,
            use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 720 } },
          },
        ]
      : []),
  ],
  webServer: live
    ? []
    : [
        { command: 'npx vite --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true },
        { command: 'node e2e/tools/relay.mjs', port: 7777, reuseExistingServer: true },
        { command: 'node server/relay.mjs', env: { PORT: '7779' }, port: 7779, reuseExistingServer: true },
      ],
});
