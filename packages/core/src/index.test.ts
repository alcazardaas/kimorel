import { describe, expect, it } from 'vitest';
import { findExercise, filterExercises, resolveAssetUrl } from './index.js';
import { exercises } from '@kimorel/data';
describe('exercise utilities', () => {
  it('finds stable IDs and handles unknown IDs', () => {
    expect(findExercise(exercises, 'bodyweight-squat')?.name).toBe(
      'Bodyweight Squat',
    );
    expect(findExercise(exercises, 'missing')).toBeUndefined();
  });
  it('combines equipment, category and muscle filters', () => {
    expect(
      filterExercises(exercises, {
        category: 'home',
        equipment: 'bodyweight',
        muscle: 'quadriceps',
      }).map((e) => e.id),
    ).toEqual(['bodyweight-squat', 'reverse-lunge']);
    expect(filterExercises(exercises, { equipment: 'barbell' })).toEqual([]);
  });
  it('resolves nested self-hosted asset paths', () => {
    expect(
      resolveAssetUrl('https://example.org/kimorel', 'exercises/squat.glb'),
    ).toBe('https://example.org/kimorel/exercises/squat.glb');
  });
  it.each([
    '../secret.glb',
    '/exercises/a.glb',
    'https://evil.test/a.glb',
    'exercises/%2e%2e/a.glb',
    'exercises/../a.glb',
  ])('rejects unsafe paths: %s', (file) => {
    expect(() =>
      resolveAssetUrl('https://example.org/assets/', file),
    ).toThrow();
  });
  it('rejects non-http asset bases', () =>
    expect(() => resolveAssetUrl('file:///tmp/', 'exercises/a.glb')).toThrow());
});
