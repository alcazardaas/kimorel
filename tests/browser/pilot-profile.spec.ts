import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { frameStats, heapMetric, installProfileProbe } from './profile-metrics';
import type { ProfileProbe } from './profile-metrics';

test('collect opt-in local pilot performance observations', async ({
  browser,
}, info) => {
  test.skip(
    process.env.KIMOREL_PROFILE !== '1',
    'Explicit local profiling opt-in required',
  );
  test.setTimeout(120000);
  const samples = [];
  for (const [id, name] of [
    ['bodyweight-squat', 'Bodyweight squat'],
    ['push-up', 'Push-up'],
    ['dumbbell-shoulder-press', 'Dumbbell shoulder press'],
  ]) {
    for (const variant of ['v1', 'v2']) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
        reducedMotion: 'no-preference',
        serviceWorkers: 'block',
      });
      try {
        const page = await context.newPage();
        await page.addInitScript(installProfileProbe);
        await page.route('**/*', (route) =>
          new URL(route.request().url()).origin === 'http://127.0.0.1:4175'
            ? route.continue()
            : route.abort(),
        );
        await page.goto('http://127.0.0.1:4175/kimorel/');
        const pause = page
          .getByRole('group', { name: 'Animation controls', exact: true })
          .getByRole('button', { name: 'Pause', exact: true });
        const choose = async (query: string) => {
          await page
            .getByRole('searchbox', { name: 'Search by name' })
            .fill(query);
          await page
            .getByRole('list', { name: 'Movements' })
            .getByRole('button')
            .first()
            .click();
          await expect(pause).toBeEnabled();
        };
        // Ensure the target is a new load, even when squat was the initial selection.
        await choose('Dumbbell biceps curl');
        if (variant === 'v2') await choose(name!);
        else
          await page
            .getByRole('searchbox', { name: 'Search by name' })
            .fill(name!);
        const path = `/kimorel/assets/${variant === 'v2' ? 'character-v2' : 'exercises'}/${id}.glb`;
        const responsePromise = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === path && response.ok(),
        );
        const selectionStart = await page.evaluate(() => performance.now());
        if (variant === 'v2')
          await page
            .getByRole('checkbox', {
              name: 'Experimental character v2 (three-exercise pilot)',
            })
            .check();
        else
          await page
            .getByRole('list', { name: 'Movements' })
            .getByRole('button')
            .first()
            .click();
        await expect(pause).toBeEnabled();
        await page.locator('canvas').scrollIntoViewIfNeeded();
        const readyMs =
          (await page.evaluate(() => performance.now())) - selectionStart;
        const response = await responsePromise,
          body = await response.body();
        // A one-second real-time warmup is an explicit sampling condition, not a functional wait.
        await page.waitForTimeout(1000);
        const observation = await page.evaluate(() =>
          (
            globalThis as unknown as { __kimorelProfile: ProfileProbe }
          ).__kimorelProfile.sample(5000),
        );
        expect(
          observation.timelineUpdates,
          'The actual animation must advance during sampling',
        ).toBeGreaterThan(5);
        expect(
          observation.after.some(
            (entry) => entry.attached && !entry.contextLost && entry.draws > 0,
          ),
        ).toBe(true);
        const resource = await page.evaluate((url) => {
          const entries = performance.getEntriesByName(
            url,
          ) as PerformanceResourceTiming[];
          return entries.map((entry) => ({
            durationMs: entry.duration,
            transferBytes: entry.transferSize,
            encodedBodyBytes: entry.encodedBodySize,
            decodedBodyBytes: entry.decodedBodySize,
          }));
        }, response.url());
        const { intervals, heap, ...details } = observation;
        samples.push({
          exercise: id,
          variant,
          readyMs,
          asset: {
            bytes: body.byteLength,
            sha256: createHash('sha256').update(body).digest('hex'),
            loopbackResourceTiming: resource,
          },
          ...details,
          scheduling: frameStats(intervals),
          jsHeap: heapMetric(heap),
        });
      } finally {
        await context.close();
      }
    }
  }
  const report = {
    schema: 'kimorel.local-pilot-profile/v1',
    browserVersion: browser.version(),
    project: info.project.name,
    environment: {
      headless: true,
      renderingBackend:
        'Forced ANGLE SwiftShader software renderer from playwright.config.ts',
      physicalDevice: false,
      unmaskedHardwareIdentity: 'Not queried (privacy)',
      warmupMs: 1000,
      sampleTargetMs: 5000,
      cache:
        'Fresh browser context per sample; local loopback/OS caches may be warm',
    },
    limitations: [
      'Scheduling FPS is requestAnimationFrame cadence, NOT GPU completion or display presentation',
      'WebGL counters are live API objects/draw invocations, NOT byte sizes or Three.js geometries; injection adds overhead',
      'Only five common core draw methods counted; extension multi-draw is not instrumented',
      'Selection-to-ready includes UI/load/parse; ready control is not shader-completion proof',
      'No performance acceptance thresholds or physical-phone acceptance',
    ],
    threeGeometryMemory: {
      available: false,
      reason: 'No renderer.info hook added to the shipping viewer',
    },
    gpuMemory: {
      available: false,
      reason: 'No portable GPU-memory measurement API',
    },
    processMemory: {
      available: false,
      reason: 'Not sampled; JS heap does not represent browser process memory',
    },
    samples,
  };
  await mkdir('.cache/character-v2-profile', { recursive: true });
  await writeFile(
    `.cache/character-v2-profile/${info.project.name}.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  await info.attach('local-profile', {
    body: JSON.stringify(report),
    contentType: 'application/json',
  });
});
