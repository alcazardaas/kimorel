import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/mask-preview',
  workers: 1,
  retries: 0,
  timeout: 45000,
  outputDir: '.cache/mask-preview-browser',
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4177',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm exec vite --config vite.mask-preview.config.ts',
    url: 'http://127.0.0.1:4177',
    reuseExistingServer: false,
    timeout: 20000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
