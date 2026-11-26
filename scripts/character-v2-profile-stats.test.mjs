import test from 'node:test';
import assert from 'node:assert/strict';
import { frameStats, heapMetric } from '../tests/browser/profile-metrics.ts';

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
