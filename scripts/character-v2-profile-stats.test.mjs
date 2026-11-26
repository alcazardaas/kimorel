import test from 'node:test';
import assert from 'node:assert/strict';
import {
  frameStats,
  heapMetric,
  sampleDraws,
  profileProvenance,
  profileContextOptions,
} from '../tests/browser/profile-metrics.ts';

test('frame distribution uses nearest-rank percentiles without mutating samples', () => {
  const input = [40, 10, 30, 20];
  assert.deepEqual(frameStats(input), {
    available: true,
    samples: 4,
    meanMs: 25,
    medianMs: 20,
    p95Ms: 40,
    p99Ms: 40,
    maxMs: 40,
    schedulingFps: 40,
  });
  assert.deepEqual(input, [40, 10, 30, 20]);
  assert.equal(frameStats([20]).schedulingFps, 50);
});
test('missing frames are unavailable, not fabricated zero FPS; invalid intervals reject', () => {
  assert.equal(frameStats([]).available, false);
  for (const input of [[0], [-1], [NaN], [Infinity], [1e308, 1e308]])
    assert.throws(() => frameStats(input));
});
test('JS heap availability preserves genuine zero while rejecting missing or malformed data', () => {
  assert.equal(
    heapMetric({ usedJSHeapSize: 0, totalJSHeapSize: 1, jsHeapSizeLimit: 2 })
      .available,
    true,
  );
  for (const value of [
    undefined,
    null,
    {},
    { usedJSHeapSize: NaN },
    { usedJSHeapSize: -1, totalJSHeapSize: 1, jsHeapSizeLimit: 2 },
  ])
    assert.equal(heapMetric(value).available, false);
});

test('sample draw proof requires positive delta on the same attached non-lost context', () => {
  const before = [
    {
      contextId: 1,
      attached: true,
      contextLost: false,
      lossEvents: 0,
      draws: 100,
    },
  ];
  const after = [{ ...before[0], draws: 120 }];
  assert.deepEqual(sampleDraws(before, after), {
    contextId: 1,
    drawInvocations: 20,
  });
  for (const broken of [
    before, // Warmup already drew 100 times, but nothing during sampling.
    [{ ...after[0], draws: 99 }],
    [{ ...after[0], contextId: 2 }],
    [{ ...after[0], attached: false }],
    [{ ...after[0], contextLost: true }],
    [{ ...after[0], lossEvents: 1 }], // Lost and restored during the interval.
    [{ ...after[0], draws: NaN }],
    [after[0], after[0]],
  ])
    assert.throws(() => sampleDraws(before, broken));
  assert.throws(() => sampleDraws([], after));
});

test('provenance derives headed/headless from effective fixture and actual launch switches', () => {
  const args = [
    '--headless',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--enable-automation',
  ];
  assert.equal(profileProvenance('chromium', true, args).headless, true);
  assert.equal(
    profileProvenance('chromium', false, args.slice(1)).headless,
    false,
  );
  for (const [browser, mode, switches] of [
    ['chromium', false, args],
    ['chromium', true, args.slice(1)],
    ['chromium', true, args.slice(0, -1)],
    ['webkit', true, args],
    ['chromium', true, [...args, '--use-angle=default']],
    ['chromium', true, [...args, '--use-gl=desktop']],
    ['chromium', true, [...args, '--disable-gpu']],
    ['chromium', true, [...args, '--headless=false']],
    ['chromium', true, ['--headless', '--use-angle=swiftshader']],
  ])
    assert.throws(() => profileProvenance(browser, mode, switches));
  const result = JSON.stringify(
    profileProvenance('chromium', true, [...args, '--user-data-dir=<private>']),
  );
  assert.equal(result.includes('<private>'), false);
});

test('fresh profiling contexts preserve desktop and mobile project settings without mutating them', () => {
  const desktop = { viewport: { width: 1280, height: 720 } };
  assert.deepEqual(profileContextOptions(desktop), {
    ...desktop,
    screen: { ...desktop.viewport },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });
  const mobile = {
    viewport: { width: 412, height: 839 },
    screen: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: 'configured mobile emulation',
  };
  const result = profileContextOptions(mobile);
  assert.deepEqual(result, mobile);
  result.viewport.width = 999;
  assert.equal(mobile.viewport.width, 412);
});
test('unsupported or malformed project emulation settings fail rather than silently using desktop', () => {
  for (const options of [
    {},
    { viewport: null },
    { viewport: { width: 0, height: 839 } },
    { viewport: { width: 412, height: 839 }, deviceScaleFactor: NaN },
    { viewport: { width: 412, height: 839 }, deviceScaleFactor: -1 },
    { viewport: { width: 412, height: 839 }, hasTouch: 'yes' },
    {
      viewport: { width: 412, height: 839 },
      screen: { width: Infinity, height: 915 },
    },
  ])
    assert.throws(() => profileContextOptions(options));
});
