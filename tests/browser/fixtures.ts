import { test as base, expect } from '@playwright/test';

type Diagnostics = { expectAssetFailure: (url: string) => void };

export const test = base.extend<{ diagnostics: Diagnostics }>({
  diagnostics: [
    async ({ page }, use) => {
      const expected = new Set<string>();
      const failures: string[] = [];
      const logs: Promise<void>[] = [];
      page.on('pageerror', (error) =>
        failures.push(`Page error: ${error.message}`),
      );
      page.on('requestfailed', (request) => {
        if (!expected.has(request.url()))
          failures.push(`Request failed: ${request.url()}`);
      });
      page.on('response', (response) => {
        if (response.status() >= 400 && !expected.has(response.url()))
          failures.push(`HTTP ${response.status()}: ${response.url()}`);
      });
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        logs.push(
          (async () => {
            const args = await Promise.all(
              message.args().map((arg) => arg.jsonValue().catch(() => null)),
            );
            const assetUrl = (args[2] as { url?: string } | null)?.url;
            const intentional =
              expected.has(message.location().url) ||
              (message.text().startsWith('[Kimorel viewer] asset-load') &&
                assetUrl !== undefined &&
                expected.has(assetUrl));
            if (!intentional) failures.push(`Console error: ${message.text()}`);
          })(),
        );
      });
      await page.route('**/*', async (route) => {
        if (
          ['http://127.0.0.1:4175', 'http://127.0.0.1:4176'].includes(
            new URL(route.request().url()).origin,
          )
        ) {
          await route.continue();
        } else {
          failures.push(
            `Unexpected external request: ${route.request().url()}`,
          );
          await route.abort();
        }
      });
      await use({
        expectAssetFailure: (url) => {
          expected.add(url);
        },
      });
      await Promise.all(logs);
      expect(failures, 'Unexpected browser errors or requests').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect } from '@playwright/test';
