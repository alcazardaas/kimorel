import { expect, it } from 'vitest';
import { reviewCameraPosition } from './review-camera.js';
it('preserves horizontal metadata framing for all review directions', () => {
  const target: [number, number, number] = [0, 0.35, 0];
  const original: [number, number, number] = [2.5, 1.5, 2.6];
  const front = reviewCameraPosition(target, original, 'front');
  const back = reviewCameraPosition(target, original, 'back');
  const side = reviewCameraPosition(target, original, 'side');
  expect(front[1]).toBe(1.5);
  expect(front[2]).toBe(-back[2]);
  expect(side[0]).toBe(front[2]);
  expect(reviewCameraPosition(target, original, 'three-quarter')).toBe(
    original,
  );
});
