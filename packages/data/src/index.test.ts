import { expect, it } from 'vitest';
import { exercises, getExercise, queryExercises } from './index.js';
it('registers three real animations through the shared catalog', () => {
  expect(exercises.length).toBe(3);
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
