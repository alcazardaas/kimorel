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
    ).toEqual([
      'bodyweight-squat',
      'reverse-lunge',
      'split-squat',
      'lateral-lunge',
      'supine-heel-slide',
      'straight-leg-raise',
    ]);
    expect(
      filterExercises(exercises, { equipment: 'barbell' }).map((e) => e.id),
    ).toEqual([
      'barbell-back-squat',
      'barbell-front-squat',
      'barbell-conventional-deadlift',
      'barbell-good-morning',
      'barbell-bench-press',
      'barbell-overhead-press',
      'barbell-bent-over-row',
      'hip-thrust',
    ]);
  });
  it('searches trimmed case-insensitive name substrings without mutating inputs', () => {
    const source = Object.freeze(exercises.slice(0, 3));
    const filter = Object.freeze({ nameQuery: '  wEiGhT sQ  ' });
    expect(filterExercises(source, filter)).toEqual([source[0]]);
    expect(filterExercises(source, filter)[0]).toBe(source[0]);
    expect(filter.nameQuery).toBe('  wEiGhT sQ  ');
    expect(source).toEqual(exercises.slice(0, 3));
    expect(filterExercises(source, {})).toEqual(source);
    for (const nameQuery of ['', '  \t ']) {
      const result = filterExercises(source, { nameQuery });
      expect(result).toEqual(source);
      expect(result).not.toBe(source);
    }
  });
  it('matches names only and combines search with all other criteria', () => {
    expect(filterExercises(exercises, { nameQuery: 'quadriceps' })).toEqual([]);
    expect(
      filterExercises(exercises, { nameQuery: 'bodyweight-squat' }),
    ).toEqual([]);
    expect(
      filterExercises(exercises, {
        nameQuery: 'squat',
        category: 'home',
        equipment: 'bodyweight',
        muscle: 'quadriceps',
      }).map((exercise) => exercise.id),
    ).toEqual(['bodyweight-squat', 'split-squat']);
    expect(
      filterExercises(exercises, { nameQuery: 'squat', equipment: 'dumbbell' }),
    ).toEqual([]);
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
