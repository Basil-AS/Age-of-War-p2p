import { defineConfig, devices } from '@playwright/test';

const cross = !!process.env.CROSS_BROWSER;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /cross-browser/,
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
  webServer: [
    { command: 'npx vite --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true },
    { command: 'node e2e/tools/relay.mjs', port: 7777, reuseExistingServer: true },
    { command: 'node server/relay.mjs', env: { PORT: '7779' }, port: 7779, reuseExistingServer: true },
  ],
});
