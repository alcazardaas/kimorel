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
  const [pageSize, setPageSize] = useState('5');
  const [page, setPage] = useState(1);
  const visible = filterExercises(exercises, filter);
  const size =
    pageSize === 'all' ? Math.max(1, visible.length) : Number(pageSize);
  const pageCount = Math.max(1, Math.ceil(visible.length / size));
  const currentPage = Math.min(page, pageCount);
  // Persist the clamp so a later dataset expansion does not restore a stale page.
  if (page !== currentPage) setPage(currentPage);
  const start = (currentPage - 1) * size;
  const pageItems = visible.slice(start, start + size);
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
              onChange={(event) => {
                setPage(1);
                setFilter((current) => ({
                  ...current,
                  [key]: event.target.value,
                }));
              }}
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
        <button
          type="button"
          disabled={!active}
          onClick={() => {
            setFilter({});
            setPage(1);
          }}
        >
          Reset filters
        </button>
      </fieldset>
      <label className="catalog-page-size">
        Movements per page
        <select
          value={pageSize}
          onChange={(event) => {
            setPageSize(event.target.value);
            setPage(1);
          }}
        >
          {[5, 10, 25].map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
          <option value="all">All</option>
        </select>
      </label>
      <p role="status" className="muted">
        {visible.length} of {exercises.length} movements
        {visible.length > 0 && (
          <>
            {' '}
            · Showing {start + 1}–{start + pageItems.length} · Page{' '}
            {currentPage} of {pageCount}
          </>
        )}
        {selected &&
          !visible.some((exercise) => exercise.id === selectedId) && (
            <>. Still viewing {selected.name}; it is outside these filters.</>
          )}
      </p>
      {visible.length === 0 && <p>No movements match these filters.</p>}
      <ul className="catalog" aria-label="Movements">
        {pageItems.map((exercise) => (
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
      {visible.length > 0 && (
        <nav className="catalog-pagination" aria-label="Catalog pages">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map(
            (number) => (
              <button
                type="button"
                key={number}
                aria-label={`Page ${number}`}
                aria-current={currentPage === number ? 'page' : undefined}
                onClick={() => setPage(number)}
              >
                {number}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={currentPage === pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </>
  );
}
