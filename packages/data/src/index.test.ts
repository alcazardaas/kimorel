import { expect, it } from 'vitest';
import { exercises, getExercise, queryExercises } from './index.js';
it('registers twenty-five real animations through the shared catalog', () => {
  expect(exercises.length).toBe(25);
  expect(new Set(exercises.map((e) => e.animation?.file)).size).toBe(25);
  expect(
    exercises.every(
      (e) =>
        !e.example &&
        e.animation?.clip === (e.animation?.kind === 'hold' ? 'hold' : 'rep') &&
        e.review.status === 'pending',
    ),
  ).toBe(true);
  expect(getExercise('bodyweight-squat')?.animation?.clip).toBe('rep');
  expect(getExercise('bodyweight-squat')?.example).toBe(false);
  expect(getExercise('push-up')?.animation?.clip).toBe('rep');
  expect(getExercise('push-up')?.example).toBe(false);
  expect(getExercise('dumbbell-biceps-curl')?.equipment).toEqual(['dumbbell']);
  expect(getExercise('missing')).toBeUndefined();
  expect(queryExercises({ muscle: 'triceps' }).map((e) => e.id)).toEqual([
    'push-up',
  ]);
});

it('maps every registered primary muscle to an explicit broad surface region', async () => {
  const { muscleRegionDefinition } = await import('@kimorel/schemas');
  const mapped = new Set(
    Object.values(muscleRegionDefinition.regions).flatMap(
      (region) => region.muscles,
    ),
  );
  for (const exercise of exercises) {
    for (const muscle of exercise.muscles.primary)
      expect(mapped.has(muscle), `${exercise.id}: ${muscle}`).toBe(true);
  }
});
