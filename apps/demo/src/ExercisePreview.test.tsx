// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { exercises } from '@kimorel/data';
import type { ExerciseViewerProps } from '@kimorel/react';
import { ExercisePreview } from './ExercisePreview';
import { pilotExercise } from './pilot';

const views = vi.hoisted(() => [] as ExerciseViewerProps[]);
vi.mock('@kimorel/react', () => ({
  ExerciseViewer: (props: ExerciseViewerProps) => {
    views.push(props);
    return <p>Mock owned viewer</p>;
  },
}));
afterEach(() => {
  cleanup();
  views.length = 0;
});
const squat = exercises.find((e) => e.id === 'bodyweight-squat')!;
const current = () => views.at(-1)!;
const toggle = () => fireEvent.click(screen.getByRole('checkbox'));

it('starts with original identity and uses a separate rep descriptor only on opt-in', () => {
  const before = JSON.stringify(squat);
  render(<ExercisePreview exercise={squat} review={false} />);
  expect(current().exercise).toBe(squat);
  toggle();
  const draft = current().exercise;
  expect(typeof draft).not.toBe('string');
  if (typeof draft === 'string') throw new Error('Expected descriptor');
  expect(draft.animation?.file).toBe('character-v2/bodyweight-squat.glb');
  expect(draft.animation?.clip).toBe('rep');
  expect(draft.muscles).toBe(squat.muscles);
  expect(current().muscleHighlights).toBe(false);
  expect(JSON.stringify(squat)).toBe(before);
  expect(screen.getByRole('status').textContent).toContain('pending');
  toggle();
  expect(current().exercise).toBe(squat);
});

it('limits the pilot to exactly three supported exercises', () => {
  expect(
    exercises
      .filter((e) => pilotExercise(e))
      .map((e) => e.id)
      .sort(),
  ).toEqual(['bodyweight-squat', 'dumbbell-shoulder-press', 'push-up']);
  const unsupported = exercises.find((e) => !pilotExercise(e))!;
  render(<ExercisePreview exercise={unsupported} review />);
  expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(
    true,
  );
  expect(current().exercise).toBe(unsupported);
});

it('falls back once on failure and permits an explicit fresh retry', () => {
  render(<ExercisePreview exercise={squat} review />);
  toggle();
  const stale = current().onError!;
  fireEvent.click(screen.getByRole('checkbox'));
  act(() => stale(new Error('late response')));
  expect(current().exercise).toBe(squat);
  toggle();
  act(() => current().onError!(new Error('missing asset')));
  expect(current().exercise).toBe(squat);
  expect(screen.getByRole('status').textContent).toContain('could not load');
  toggle();
  toggle();
  expect(current().exercise).not.toBe(squat);
});

it('ignores old failures after a new opt-in or unmount', () => {
  const view = render(<ExercisePreview exercise={squat} review />);
  toggle();
  const stale = current().onError!;
  toggle();
  toggle();
  act(() => stale(new Error('old load')));
  expect(current().exercise).not.toBe(squat);
  view.unmount();
  expect(() => current().onError?.(new Error('late unmounted'))).not.toThrow();
});
