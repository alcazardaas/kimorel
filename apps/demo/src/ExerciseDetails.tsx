import type { Exercise } from '@kimorel/core';

export function ExerciseDetails({ exercise }: { exercise: Exercise }) {
  return (
    <section className="description" aria-label={`${exercise.name} details`}>
      <h3>About this movement</h3>
      <p>{exercise.description}</p>
      <p>
        <strong>Difficulty:</strong> {exercise.difficulty} ·{' '}
        {exercise.laterality}
      </p>
      <p>
        <strong>Starting position:</strong> {exercise.startingPosition}
      </p>
      <p>
        <strong>Primary muscles:</strong> {exercise.muscles.primary.join(', ')}
      </p>
      {exercise.muscles.secondary.length > 0 && (
        <p>
          <strong>Secondary muscles:</strong>{' '}
          {exercise.muscles.secondary.join(', ')}
        </p>
      )}
      <p>
        <strong>Equipment:</strong> {exercise.equipment.join(', ')}
      </p>
      <h3>Movement instructions</h3>
      <ol>
        {exercise.instructions.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ol>
      {(
        [
          ['Technique cues', exercise.techniqueCues],
          ['Common mistakes', exercise.commonMistakes],
        ] as const
      ).map(
        ([heading, items]) =>
          items.length > 0 && (
            <section key={heading} aria-label={heading}>
              <h3>{heading}</h3>
              <ul>
                {items.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </section>
          ),
      )}
      <p>
        <strong>Metadata review:</strong> {exercise.review.status}. This is not
        asset visual approval or clinical validation.
      </p>
      <p className="muted">
        Educational example only. Not medical advice or a treatment
        prescription.
      </p>
    </section>
  );
}
