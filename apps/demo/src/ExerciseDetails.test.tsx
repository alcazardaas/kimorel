// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { exercises } from '@kimorel/data';
import { ExerciseDetails } from './ExerciseDetails';

afterEach(cleanup);

it('shows existing educational metadata and distinguishes review from approval', () => {
  const exercise = exercises[1]!;
  render(<ExerciseDetails exercise={exercise} />);
  const details = within(
    screen.getByRole('region', { name: `${exercise.name} details` }),
  );
  for (const text of [
    exercise.description,
    exercise.startingPosition,
    ...exercise.instructions,
    ...exercise.techniqueCues,
    ...exercise.commonMistakes,
  ]) {
    expect(details.getAllByText(text, { exact: false }).length).toBeGreaterThan(
      0,
    );
  }
  expect(
    details.getByText('Secondary muscles:', { exact: true }).parentElement
      ?.textContent,
  ).toContain(exercise.muscles.secondary.join(', '));
  expect(
    details.getByText('Metadata review:').parentElement?.textContent,
  ).toContain(
    'pending. This is not asset visual approval or clinical validation.',
  );
  expect(details.getByText(/Not medical advice/)).toBeTruthy();
});

it('updates details and omits empty optional lists when the exercise changes', () => {
  const { rerender } = render(<ExerciseDetails exercise={exercises[1]!} />);
  const exercise = { ...exercises[0]!, techniqueCues: [], commonMistakes: [] };
  rerender(<ExerciseDetails exercise={exercise} />);
  expect(
    screen.getByRole('region', { name: `${exercise.name} details` }),
  ).toBeTruthy();
  expect(screen.queryByText(exercises[1]!.description)).toBeNull();
  for (const name of [
    'Secondary muscles:',
    'Technique cues',
    'Common mistakes',
  ]) {
    expect(screen.queryByText(name)).toBeNull();
  }
  expect(
    screen.getByText(exercise.startingPosition, { exact: false }),
  ).toBeTruthy();
});
