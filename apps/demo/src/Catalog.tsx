import { useState } from 'react';
import { categories, equipment, muscles, filterExercises } from '@kimorel/core';
import type { Exercise, ExerciseFilter } from '@kimorel/core';

interface CatalogProps {
  exercises: readonly Exercise[];
  selectedId: string;
  onSelect: (exercise: Exercise) => void;
}

export function Catalog({ exercises, selectedId, onSelect }: CatalogProps) {
  const [filter, setFilter] = useState<ExerciseFilter>({});
  const visible = filterExercises(exercises, filter);
  const selected = exercises.find((exercise) => exercise.id === selectedId);
  const active = Object.values(filter).some(Boolean);
  return (
    <>
      <fieldset className="catalog-filters">
        <legend>Filter movements</legend>
        {(
          [
            ['category', 'Category', categories],
            ['equipment', 'Equipment', equipment],
            ['muscle', 'Muscle', muscles],
          ] as const
        ).map(([key, label, options]) => (
          <label key={key}>
            {label}
            <select
              value={filter[key] ?? ''}
              onChange={(event) =>
                setFilter((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            >
              <option value="">All {label.toLowerCase()} options</option>
              {options.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('-', ' ')}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="button" disabled={!active} onClick={() => setFilter({})}>
          Reset filters
        </button>
      </fieldset>
      <p role="status" className="muted">
        {visible.length} of {exercises.length} movements
        {selected &&
          !visible.some((exercise) => exercise.id === selectedId) && (
            <>. Still viewing {selected.name}; it is outside these filters.</>
          )}
      </p>
      {visible.length === 0 && <p>No movements match these filters.</p>}
      <ul className="catalog" aria-label="Movements">
        {visible.map((exercise) => (
          <li key={exercise.id}>
            <button
              type="button"
              aria-pressed={selectedId === exercise.id}
              onClick={() => onSelect(exercise)}
            >
              <span className="number">
                {String(exercises.indexOf(exercise) + 1).padStart(2, '0')}
              </span>
              <span>
                <strong>{exercise.name}</strong>
                <small>
                  {exercise.movementPattern} · {exercise.equipment.join(', ')}
                </small>
              </span>
              <span aria-hidden="true">↗</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
