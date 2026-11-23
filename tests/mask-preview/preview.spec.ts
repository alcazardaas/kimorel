import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { request as rawRequest } from 'node:http';

async function seek(page: Page, time: string) {
  await page.getByLabel('Pose time').evaluate((element, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      globalThis.HTMLInputElement.prototype,
      'value',
    )!.set!;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, time);
}
function rawStatus(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = rawRequest(
      { hostname: '127.0.0.1', port: 4177, path },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode!));
      },
    );
    request.on('error', reject);
    request.end();
  });
}

test('real WebGL masks follow skinned corrective playback with accessible controls', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).hostname === '127.0.0.1')
      await route.continue();
    else {
      errors.push('Unexpected external request');
      await route.abort();
    }
  });
  await page.goto('/');
  await expect(page.locator('.stage [role="status"]')).toHaveText(
    'Verified draft loaded',
  );
  await expect(
    page.getByText('Anatomical review pending · coverage, not activation'),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Animated anatomical draft surface' }),
  ).toBeVisible();
  await page.getByText('Exact draft and playback diagnostics').click();
  const proof = page.getByTestId('motion-proof');
  await expect
    .poll(async () => Number(await proof.getAttribute('data-draws')))
    .toBeGreaterThan(0);
  await page.getByLabel('Mask selection').selectOption('left-deltoid');
  await seek(page, '1.016');
  await expect
    .poll(async () => Number(await proof.getAttribute('data-displacement')))
    .toBeGreaterThan(0.02);
  await expect
    .poll(async () => Number(await proof.getAttribute('data-morph')))
    .toBeGreaterThan(0.9);
  await page.screenshot({
    path: info.outputPath('draft-shoulder.png'),
    fullPage: true,
  });
  await page.getByLabel('Mask selection').selectOption('all');
  await seek(page, '0');
  await expect
    .poll(async () => Number(await proof.getAttribute('data-displacement')))
    .toBeLessThan(0.00001);
  await expect
    .poll(async () => Number(await proof.getAttribute('data-morph')))
    .toBe(0);
  await page.getByLabel('Stress clip').selectOption('elbow-flexion');
  await page.getByLabel('Playback speed').selectOption('1');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        (await page.getByLabel('Playback time').textContent())!.split(' / ')[0],
      ),
    )
    .toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const time = await page.getByLabel('Playback time').textContent();
  await page.waitForTimeout(150);
  expect(await page.getByLabel('Playback time').textContent()).toBe(time);
  await seek(page, '1.016');
  await page.getByRole('button', { name: 'Reset camera' }).click();
  await page.screenshot({
    path: info.outputPath('draft-all-masks.png'),
    fullPage: true,
  });
  const width = await page.evaluate(() => ({
    page: globalThis.document.documentElement.scrollWidth,
    viewport: globalThis.innerWidth,
  }));
  expect(width.page).toBeLessThanOrEqual(width.viewport);
  expect(errors).toEqual([]);
});
test('changed mask bytes fail closed instead of displaying an unverified body', async ({
  page,
}) => {
  await page.route('**/__draft/left-deltoid.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('hash mismatch');
  await expect(
    page.getByRole('button', { name: 'Play', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('canvas')).toHaveCount(0);
});
test('draft file middleware rejects unknown paths, query strings and traversal encodings', async ({
  request,
}) => {
  for (const path of [
    '/__draft/inspection.svg',
    '/__draft/catalog.json?x=1',
    '/__draft/%252e%252e/catalog.json',
    '/__draft/unknown.json',
  ])
    expect((await request.get(path)).status()).toBeGreaterThanOrEqual(400);
  // Node sends this exact request target; URL-based clients normalize dot segments before sending.
  expect(await rawStatus('/__draft/%2e%2e/catalog.json')).toBe(400);
  expect(await rawStatus('/__draft/../catalog.json')).toBe(400);
  expect((await request.post('/__draft/catalog.json')).status()).toBe(400);
  expect((await request.get('/__draft/catalog.json')).status()).toBe(200);
});
