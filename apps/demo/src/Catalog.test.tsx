// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { exercises } from '@kimorel/data';
import { Catalog } from './Catalog';

afterEach(cleanup);
const choose = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const movements = () => within(screen.getByRole('list', { name: 'Movements' }));

describe('Catalog', () => {
  it('combines filters, reports an empty state and resets all controls', () => {
    render(
      <Catalog
        exercises={exercises}
        selectedId={exercises[0]!.id}
        onSelect={vi.fn()}
      />,
    );
    expect(movements().getAllByRole('button')).toHaveLength(3);
    choose('Equipment', 'dumbbell');
    expect(movements().getAllByRole('button')).toHaveLength(1);
    choose('Muscle', 'quadriceps');
    expect(movements().queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('No movements match these filters.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain(
      '0 of 3 movements',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(movements().getAllByRole('button')).toHaveLength(3);
    for (const label of ['Category', 'Equipment', 'Muscle']) {
      expect((screen.getByLabelText(label) as HTMLSelectElement).value).toBe(
        '',
      );
    }
  });

  it('filters category and secondary muscle metadata through the core API', () => {
    render(
      <Catalog
        exercises={exercises}
        selectedId={exercises[0]!.id}
        onSelect={vi.fn()}
      />,
    );
    choose('Category', 'home');
    choose('Muscle', 'abdominals');
    expect(movements().getAllByRole('button')).toHaveLength(1);
    expect(movements().getByRole('button').textContent).toContain(
      exercises[1]!.name,
    );
  });

  it('does not select implicitly when filtering hides the current movement', () => {
    const onSelect = vi.fn();
    render(
      <Catalog
        exercises={exercises}
        selectedId={exercises[0]!.id}
        onSelect={onSelect}
      />,
    );
    choose('Equipment', 'dumbbell');
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain(
      `Still viewing ${exercises[0]!.name}`,
    );
    const button = movements().getByRole('button');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(
      exercises.find((exercise) => exercise.equipment.includes('dumbbell')),
    );
  });
});
