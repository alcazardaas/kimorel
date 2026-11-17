// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { exercises as fullCatalog } from '@kimorel/data';
// Pagination boundaries use a fixed-size fixture; browser coverage visits every real record.
const catalog = fullCatalog.slice(0, 25);
// Bounded fixture keeps these filter behavior assertions independent of catalog growth.
const exercises = catalog.slice(0, 3);
import { Catalog } from './Catalog';

afterEach(cleanup);
const choose = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const movements = () => within(screen.getByRole('list', { name: 'Movements' }));

describe('Catalog', () => {
  it('defaults to five results and navigates without changing selection', () => {
    const onSelect = vi.fn();
    render(
      <Catalog
        exercises={catalog}
        selectedId={catalog[0]!.id}
        onSelect={onSelect}
      />,
    );
    expect(movements().getAllByRole('button')).toHaveLength(5);
    expect(
      (screen.getByLabelText('Movements per page') as HTMLSelectElement).value,
    ).toBe('5');
    const previous = screen.getByRole('button', {
      name: 'Previous',
    }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen
        .getByRole('button', { name: 'Page 2' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(movements().getAllByRole('button')[0]!.textContent).toContain(
      catalog[5]!.name,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Page 5' }));
    expect(
      (screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(previous);
    expect(screen.getByRole('status').textContent).toContain('Page 4 of 5');
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(movements().getAllByRole('button')[0]!);
    expect(onSelect).toHaveBeenCalledWith(catalog[15]);
  });

  it('changes page size, resets the page and supports the complete catalog', () => {
    render(
      <Catalog
        exercises={catalog}
        selectedId={catalog[0]!.id}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    choose('Movements per page', '10');
    expect(movements().getAllByRole('button')).toHaveLength(10);
    expect(screen.getByRole('status').textContent).toContain(
      'Showing 1–10 · Page 1 of 3',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(movements().getAllByRole('button')).toHaveLength(5);
    for (const size of ['25', 'all']) {
      choose('Movements per page', size);
      expect(movements().getAllByRole('button')).toHaveLength(25);
      expect(screen.getByRole('status').textContent).toContain('Page 1 of 1');
    }
  });

  it('resets pagination for filters and reset, and paginates only matching results', () => {
    render(
      <Catalog
        exercises={catalog}
        selectedId={catalog[0]!.id}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Page 4' }));
    choose('Equipment', 'bodyweight');
    expect(screen.getByRole('status').textContent).toContain('Page 1 of');
    const matches = catalog.filter((exercise) =>
      exercise.equipment.includes('bodyweight'),
    );
    expect(screen.getByRole('status').textContent).toContain(
      `${matches.length} of 25 movements`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(movements().getAllByRole('button')[0]!.textContent).toContain(
      matches[5]!.name,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(screen.getByRole('status').textContent).toContain(
      'Showing 1–5 · Page 1 of 5',
    );
    choose('Equipment', 'barbell');
    expect(movements().queryAllByRole('button')).toHaveLength(0);
    expect(
      screen.queryByRole('navigation', { name: 'Catalog pages' }),
    ).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(
      '0 of 25 movements',
    );
  });

  it('searches names, resets pagination and preserves selection through empty results and reset', () => {
    const onSelect = vi.fn();
    render(
      <Catalog
        exercises={catalog}
        selectedId={catalog[0]!.id}
        onSelect={onSelect}
      />,
    );
    const search = screen.getByRole('searchbox', {
      name: 'Search by name',
    }) as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: 'Page 4' }));
    choose('Search by name', '  CuRL  ');
    expect(screen.getByRole('status').textContent).toContain('Page 1 of 1');
    expect(
      movements().getByRole('button', { name: /Dumbbell Biceps Curl/ })
        .textContent,
    ).toContain('Dumbbell Biceps Curl');
    expect(screen.getByRole('status').textContent).toContain(
      `Still viewing ${catalog[0]!.name}`,
    );
    choose('Equipment', 'barbell');
    expect(screen.getByText('No movements match these filters.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain(
      '0 of 25 movements',
    );
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(search.value).toBe('');
    expect(
      (screen.getByLabelText('Equipment') as HTMLSelectElement).value,
    ).toBe('');
    expect(screen.getByRole('status').textContent).toContain(
      'Showing 1–5 · Page 1 of 5',
    );
    expect(
      movements().getAllByRole('button')[0]!.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clamps the page when data shrinks without reviving a stale page later', () => {
    const props = { selectedId: catalog[0]!.id, onSelect: vi.fn() };
    const { rerender } = render(<Catalog {...props} exercises={catalog} />);
    fireEvent.click(screen.getByRole('button', { name: 'Page 5' }));
    rerender(<Catalog {...props} exercises={catalog.slice(0, 7)} />);
    expect(movements().getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toContain(
      'Showing 6–7 · Page 2 of 2',
    );
    rerender(<Catalog {...props} exercises={catalog} />);
    expect(screen.getByRole('status').textContent).toContain('Page 2 of 5');
    rerender(<Catalog {...props} exercises={[]} />);
    expect(screen.getByText('No movements match these filters.')).toBeTruthy();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

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
