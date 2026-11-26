import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { pilotAssets } from '../../apps/demo/src/pilot';

const toggleName = 'Experimental character v2 (three-exercise pilot)';
async function choose(page: Page, query: string) {
  await page.getByRole('searchbox', { name: 'Search by name' }).fill(query);
  await page
    .getByRole('list', { name: 'Movements' })
    .getByRole('button')
    .first()
    .click();
}
const controls = (page: Page) =>
  page.getByRole('group', { name: 'Animation controls', exact: true });

test('three exact pilot exports play opt-in; v1 stays default and unsupported fallback', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const drafts: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/assets/character-v2/')) drafts.push(r.url());
  });
  await page.goto('/kimorel/');
  await choose(page, 'Bodyweight squat');
  await expect(
    page.getByRole('checkbox', { name: toggleName }),
  ).not.toBeChecked();
  await expect(
    controls(page).getByRole('button', { name: 'Pause', exact: true }),
  ).toBeEnabled();
  expect(drafts).toEqual([]);
  for (const [id, query] of [
    ['bodyweight-squat', 'Bodyweight squat'],
    ['push-up', 'Push-up'],
    ['dumbbell-shoulder-press', 'Dumbbell shoulder press'],
  ] as const) {
    await choose(page, query);
    await page.getByRole('checkbox', { name: toggleName }).check();
    await expect(
      page.getByRole('status').filter({ hasText: 'Experimental v2 draft' }),
    ).toBeVisible();
    await expect(
      controls(page).getByRole('button', { name: 'Pause', exact: true }),
    ).toBeEnabled();
    await controls(page)
      .getByRole('button', { name: 'Pause', exact: true })
      .click();
    await controls(page)
      .getByRole('button', { name: 'Restart', exact: true })
      .click();
    await expect(
      page.getByRole('timer', { name: 'Animation time' }),
    ).toHaveText('0.000 / 4.000 s');
    const firstPose = await page.locator('canvas').screenshot();
    await page
      .getByRole('slider', { name: 'Animation timeline' })
      .evaluate((element) => {
        Object.getOwnPropertyDescriptor(
          globalThis.HTMLInputElement.prototype,
          'value',
        )!.set!.call(element, '2');
        element.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await expect(
      page.getByRole('timer', { name: 'Animation time' }),
    ).toHaveText('2.000 / 4.000 s');
    expect((await page.locator('canvas').screenshot()).equals(firstPose)).toBe(
      false,
    );
    await expect(
      page.getByRole('checkbox', { name: 'Muscle highlights' }),
    ).toHaveCount(0);

    await controls(page)
      .getByRole('combobox', { name: 'Playback speed' })
      .selectOption('0.5');
    await controls(page)
      .getByRole('button', { name: 'Play', exact: true })
      .click();
    await page.waitForTimeout(350);
    await expect(page.locator('canvas')).toHaveCount(1);
    const response = await page.request.get(
      `/kimorel/assets/character-v2/${id}.glb`,
    );
    expect(response.ok()).toBe(true);
    expect(
      createHash('sha256')
        .update(await response.body())
        .digest('hex'),
    ).toBe(pilotAssets[id]!.sha256);
    expect(drafts.some((url) => url.endsWith(`/${id}.glb`))).toBe(true);
    await page.getByRole('checkbox', { name: toggleName }).uncheck();
    await expect(
      controls(page).getByRole('button', { name: 'Pause', exact: true }),
    ).toBeEnabled();
  }
  await choose(page, 'Dumbbell biceps curl');
  await expect(page.getByRole('checkbox', { name: toggleName })).toBeDisabled();
  await expect(
    page.getByText('Showing original v1. This exercise has no v2 pilot yet.'),
  ).toBeVisible();
  await expect(
    controls(page).getByRole('button', { name: 'Pause', exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test('failed v2 load restores a usable v1 viewer and allows retry', async ({
  page,
}) => {
  await page.route('**/assets/character-v2/bodyweight-squat.glb', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/kimorel/');
  await choose(page, 'Bodyweight squat');
  await page.getByRole('checkbox', { name: toggleName }).check();
  await expect(
    page.getByText(
      'Experimental v2 could not load. Showing original v1 instead.',
    ),
  ).toBeVisible();
  await expect(
    controls(page).getByRole('button', { name: 'Pause', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('checkbox', { name: toggleName }).uncheck();
  await page.unroute('**/assets/character-v2/bodyweight-squat.glb');
  await page.getByRole('checkbox', { name: toggleName }).check();
  await expect(
    page.getByRole('status').filter({ hasText: 'Experimental v2 draft' }),
  ).toBeVisible();
  await expect(
    controls(page).getByRole('button', { name: 'Pause', exact: true }),
  ).toBeEnabled();
});
