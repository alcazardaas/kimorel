import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';
import catalog from '../../packages/data/src/exercises.json' with { type: 'json' };

const assetBase = 'http://127.0.0.1:4176/library';
const squat = `${assetBase}/exercises/bodyweight-squat.glb`;

async function ready(page: Page) {
  await expect(
    page.getByRole('button', { name: /^(Play|Pause)$/ }),
  ).toBeEnabled();
  await expect(page.getByText('Loading exercise animation…')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(1);
}

async function evidence(page: Page, info: TestInfo) {
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const gpu = await canvas.evaluate((element) => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2');
    if (!gl || gl.isContextLost())
      throw new Error('Real WebGL2 context required');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      renderer: extension
        ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
    };
  });
  expect(gpu.width).toBeGreaterThan(0);
  expect(gpu.height).toBeGreaterThan(0);
  await info.attach('webgl-renderer.json', {
    body: JSON.stringify(gpu),
    contentType: 'application/json',
  });
  await info.attach('real-viewer.png', {
    body: await canvas.screenshot(),
    contentType: 'image/png',
  });
}

test('prefixed production demo loads every registered real clip and supports keyboard controls', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await page.goto('/kimorel/');
  await ready(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Play', exact: true }),
  ).toBeVisible();
  const timeline = page.getByLabel('Animation timeline');
  await timeline.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(timeline).not.toHaveValue('0');
  await page.getByLabel('Camera preset').selectOption('side');
  await expect(page.getByLabel('Camera preset')).toHaveValue('side');
  await evidence(page, info);
  await page.getByLabel('Movements per page').selectOption('all');
  for (const { name } of catalog.slice(1)) {
    await page
      .getByRole('list', { name: 'Movements' })
      .getByRole('button', { name: new RegExp(name) })
      .click();
    await ready(page);
    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    await evidence(page, info);
  }
  await page
    .getByRole('combobox', { name: 'Equipment', exact: true })
    .selectOption('dumbbell');
  await expect(page.getByRole('status')).toContainText(
    `${catalog.filter((e) => e.equipment.includes('dumbbell')).length} of ${catalog.length} movements`,
  );
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.getByRole('status')).toContainText(
    `${catalog.length} of ${catalog.length} movements`,
  );
});

test('catalog pagination preserves the viewer and works with keyboard and responsive layout', async ({
  page,
}) => {
  await page.goto('/kimorel/');
  await ready(page);
  const canvas = await page.locator('canvas').elementHandle();
  const list = page.getByRole('list', { name: 'Movements' });
  const pages = page.getByRole('navigation', { name: 'Catalog pages' });
  await expect(list.getByRole('button')).toHaveCount(5);
  await expect(pages.getByRole('button', { name: 'Previous' })).toBeDisabled();
  const next = pages.getByRole('button', { name: 'Next' });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(
    pages.getByRole('button', { name: 'Page 2', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(list.getByRole('button').first()).toContainText(
    catalog[5]!.name,
  );
  await expect(
    page.getByRole('heading', { name: catalog[0]!.name, exact: true }),
  ).toBeVisible();
  expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
  await pages
    .getByRole('button', {
      name: `Page ${Math.ceil(catalog.length / 5)}`,
      exact: true,
    })
    .click();
  await expect(next).toBeDisabled();
  await page.getByLabel('Movements per page').selectOption('10');
  await expect(list.getByRole('button')).toHaveCount(10);
  await expect(page.getByRole('status')).toContainText(
    `Showing 1–10 · Page 1 of ${Math.ceil(catalog.length / 10)}`,
  );
  await pages.getByRole('button', { name: 'Next' }).click();
  await page
    .getByRole('combobox', { name: 'Equipment', exact: true })
    .selectOption('dumbbell');
  await expect(page.getByRole('status')).toContainText('Page 1 of 1');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByLabel('Movements per page').selectOption('5');
  await pages.scrollIntoViewIfNeeded();
  const bounds = await pages.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await pages.getByRole('button', { name: 'Next' }).click();
  await list.getByRole('button').first().click();
  await ready(page);
  await expect(
    page.getByRole('heading', { name: catalog[5]!.name, exact: true }),
  ).toBeVisible();
});

test('reduced motion prevents autoplay but allows explicit keyboard play', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/kimorel/');
  await ready(page);
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeVisible();
  await play.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Pause', exact: true }),
  ).toBeVisible();
  await page.locator('canvas').scrollIntoViewIfNeeded();
  await expect
    .poll(async () =>
      Number((await page.getByRole('timer').innerText()).split(' / ')[0]),
    )
    .toBeGreaterThan(0);
});

test('non-looping playback finishes and can replay with one click', async ({
  page,
}) => {
  await page.goto('/host/');
  await ready(page);
  await page.getByLabel('Loop', { exact: true }).uncheck();
  await page.getByLabel('Playback speed').selectOption('2');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.locator('canvas').scrollIntoViewIfNeeded();
  await expect
    .poll(async () =>
      Number((await page.getByRole('timer').innerText()).split(' / ')[0]),
    )
    .toBe(4);
  await expect(
    page.getByRole('button', { name: 'Play', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.locator('canvas').scrollIntoViewIfNeeded();
  await expect
    .poll(async () =>
      Number((await page.getByRole('timer').innerText()).split(' / ')[0]),
    )
    .toBeLessThan(3);
  await expect(
    page.getByRole('button', { name: 'Pause', exact: true }),
  ).toBeVisible();
});

test('independent asset origin and host-owned metadata recover from missing file and clip', async ({
  page,
  diagnostics,
}, info) => {
  await page.goto('/host/');
  await ready(page);
  await evidence(page, info);
  const missing =
    'http://127.0.0.1:4176/missing/exercises/bodyweight-squat.glb';
  diagnostics.expectAssetFailure(missing);
  await page
    .getByLabel('Host asset base')
    .fill('http://127.0.0.1:4176/missing');
  await expect(page.getByRole('alert')).toContainText(
    'Unable to load animation',
  );
  await page.getByLabel('Host asset base').fill(assetBase);
  await ready(page);
  diagnostics.expectAssetFailure(squat);
  await page.getByLabel('Host clip').fill('missing');
  await expect(page.getByRole('alert')).toContainText(
    'Animation clip not found: missing',
  );
  await page.getByLabel('Host clip').fill('rep');
  await ready(page);
});

test('aborted local request fails honestly and a remounted host viewer recovers', async ({
  page,
  diagnostics,
}) => {
  diagnostics.expectAssetFailure(squat);
  await page.route(squat, (route) => route.abort('failed'));
  await page.goto('/host/');
  await expect(page.getByRole('alert')).toContainText(
    'Unable to load animation',
  );
  await page.unroute(squat);
  await page.getByLabel('Mount viewer').uncheck();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByLabel('Mount viewer').check();
  await ready(page);
});
