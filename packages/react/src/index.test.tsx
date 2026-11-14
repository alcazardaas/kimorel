// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { exercises } from '@kimorel/data';
import { ExerciseViewer } from './index.js';
import type { SceneProps } from './Scene.js';
const observed = vi.hoisted(() => ({
  props: null as SceneProps | null,
  failure: null as Error | null,
  mounts: 0,
}));
vi.mock('./Scene.js', async () => {
  const { useEffect } = await import('react');
  return {
    default: (props: SceneProps) => {
      useEffect(() => {
        observed.mounts += 1;
      }, []);
      if (observed.failure) throw observed.failure;
      observed.props = props;
      return (
        <>
          <button type="button" onClick={props.onReady}>
            Load mock GLB
          </button>
          <button
            type="button"
            onClick={() => props.onError(new Error('Missing clip'))}
          >
            Fail mock GLB
          </button>
        </>
      );
    },
  };
});
afterEach(() => {
  cleanup();
  observed.props = null;
  observed.failure = null;
  observed.mounts = 0;
  vi.restoreAllMocks();
});

it('provides normal-mode scrubbing and camera presets without remounting the scene', async () => {
  render(<ExerciseViewer exercise="push-up" autoPlay />);
  expect(screen.getByLabelText('Animation timeline').matches(':disabled')).toBe(
    true,
  );
  fireEvent.click(await screen.findByText('Load mock GLB'));
  act(() => observed.props?.onTimeline?.(1, 4));
  const mounts = observed.mounts;
  fireEvent.change(screen.getByLabelText('Animation timeline'), {
    target: { value: '2' },
  });
  expect(observed.props?.seek?.time).toBe(2);
  expect(observed.props?.playing).toBe(false);
  fireEvent.change(screen.getByLabelText('Camera preset'), {
    target: { value: 'back' },
  });
  expect(observed.props?.cameraPreset).toBe('back');
  fireEvent.click(screen.getByRole('button', { name: 'Reset camera' }));
  expect(observed.props?.cameraPreset).toBe(exercises[1]!.camera.preset);
  expect(observed.mounts).toBe(mounts);
  for (const name of [
    'Previous frame',
    'Next frame',
    'Remember pose',
    'Recall pose',
  ]) {
    expect(screen.queryByRole('button', { name })).toBeNull();
  }
  expect(screen.queryByLabelText('Skeleton')).toBeNull();
  expect(screen.queryByLabelText('Ground grid')).toBeNull();
});

it('never submits a surrounding host form from standard or review buttons', async () => {
  const submit = vi.fn((event) => event.preventDefault());
  render(
    <form onSubmit={submit}>
      <ExerciseViewer exercise="push-up" review />
    </form>,
  );
  fireEvent.click(await screen.findByText('Load mock GLB'));
  act(() => observed.props?.onTimeline?.(1, 4));
  const controls = within(
    screen.getByRole('group', { name: 'Animation controls' }),
  );
  const buttons = controls.getAllByRole('button');
  expect(buttons).toHaveLength(7);
  for (const button of buttons) {
    expect(button.getAttribute('type')).toBe('button');
    fireEvent.click(button);
  }
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getAllByLabelText('Animation timeline')).toHaveLength(1);
  expect(screen.getAllByLabelText('Camera preset')).toHaveLength(1);
});

it('displays custom metadata and prop speeds without restarting the scene', async () => {
  const exercise = {
    ...exercises[1]!,
    animation: { ...exercises[1]!.animation!, defaultPlaybackSpeed: 0.75 },
  };
  const { rerender } = render(<ExerciseViewer exercise={exercise} />);
  fireEvent.click(await screen.findByText('Load mock GLB'));
  const mounts = observed.mounts;
  for (const speed of [0.75, 4, 0.1, 1]) {
    if (speed !== 0.75) {
      rerender(<ExerciseViewer exercise={exercise} playbackSpeed={speed} />);
    }
    const selector = screen.getByLabelText(
      'Playback speed',
    ) as HTMLSelectElement;
    expect(selector.value).toBe(String(speed));
    expect(
      (
        within(selector).getByRole('option', {
          name: `${speed}×`,
        }) as HTMLOptionElement
      ).selected,
    ).toBe(true);
    expect(observed.props?.speed).toBe(speed);
    expect(observed.props?.restart).toBe(0);
    expect(observed.mounts).toBe(mounts);
  }
  fireEvent.change(screen.getByLabelText('Playback speed'), {
    target: { value: '0.5' },
  });
  expect(observed.props?.speed).toBe(0.5);
  expect(screen.getAllByRole('option', { name: '1×' })).toHaveLength(1);
});

it.each([0, -1, 4.01, NaN, Infinity])(
  'rejects invalid playback speed %s',
  (playbackSpeed) => {
    render(<ExerciseViewer exercise="push-up" playbackSpeed={playbackSpeed} />);
    expect(screen.getByRole('alert').textContent).toContain(
      'Playback speed must be between 0 and 4',
    );
    expect(screen.queryByLabelText('Playback speed')).toBeNull();
  },
);
it('resolves stable IDs and self-hosted GLBs, loads and controls playback', async () => {
  const ready = vi.fn();
  render(
    <ExerciseViewer
      exercise="bodyweight-squat"
      assetBaseUrl="https://example.org/library"
      onReady={ready}
    />,
  );
  expect(screen.getByRole('status').textContent).toContain('Loading');
  fireEvent.click(await screen.findByText('Load mock GLB'));
  expect(ready).toHaveBeenCalledOnce();
  expect(observed.props?.url).toBe(
    'https://example.org/library/exercises/bodyweight-squat.glb',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(observed.props?.playing).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  expect(observed.props?.playing).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
  expect(observed.props?.restart).toBe(1);
  fireEvent.change(screen.getByLabelText('Playback speed'), {
    target: { value: '2' },
  });
  expect(observed.props?.speed).toBe(2);
  fireEvent.click(screen.getByLabelText('Loop'));
  expect(observed.props?.loop).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Reset camera' }));
  expect(observed.props?.resetCamera).toBe(1);
});
it('reports loading/clip failures and recovers on exercise switch', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = vi.fn();
  const { rerender } = render(
    <ExerciseViewer exercise="bodyweight-squat" onError={error} />,
  );
  fireEvent.click(await screen.findByText('Fail mock GLB'));
  expect(screen.getByRole('alert').textContent).toContain('Missing clip');
  expect(error).toHaveBeenCalledOnce();
  expect(log).toHaveBeenCalledWith(
    '[Kimorel viewer] asset-load',
    error.mock.calls[0]?.[0],
    { url: expect.stringContaining('bodyweight-squat.glb') },
  );
  expect(error.mock.calls[0]?.[0].message).toBe('Missing clip');
  rerender(<ExerciseViewer exercise={exercises[1]!} />);
  expect(screen.getByRole('status').textContent).toContain('Loading');
  fireEvent.click(await screen.findByText('Load mock GLB'));
  expect(observed.props?.url).toContain('push-up.glb');
  expect(observed.props?.cameraTarget).toEqual(exercises[1]!.camera.target);
});
it('handles unknown exercise IDs and no-asset examples without fake playback', () => {
  const { rerender } = render(<ExerciseViewer exercise="unknown" />);
  expect(screen.getByRole('alert').textContent).toContain('not found');
  rerender(
    <ExerciseViewer
      exercise={{ ...exercises[1]!, animation: null, example: true }}
    />,
  );
  expect(screen.queryByText('Play')).toBeNull();
});

it('preserves original scene errors and component stack instead of claiming no WebGL', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failure = new Error('Renderer configuration failed');
  observed.failure = failure;
  const onError = vi.fn();
  render(<ExerciseViewer exercise="bodyweight-squat" onError={onError} />);
  expect((await screen.findByRole('alert')).textContent).toContain(
    failure.message,
  );
  expect(onError).toHaveBeenCalledWith(failure);
  expect(log).toHaveBeenCalledWith('[Kimorel viewer] scene-render', failure, {
    componentStack: expect.stringContaining('ViewerBoundary'),
  });
  expect(screen.getByRole('alert').textContent).not.toContain(
    'WebGL is unavailable',
  );
});

it('reviews poses through the shared scene: timeline, frame stepping, camera and overlays', async () => {
  render(<ExerciseViewer exercise="push-up" review />);
  fireEvent.click(await screen.findByText('Load mock GLB'));
  // A real Scene reports the loaded clip duration and throttled progress.
  const { act } = await import('@testing-library/react');
  act(() => observed.props?.onTimeline?.(1, 4));
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next frame' }));
  expect(observed.props?.seek?.time).toBeCloseTo(1 + 1 / 30);
  expect(observed.props?.playing).toBe(false);
  fireEvent.change(screen.getByLabelText('Animation timeline'), {
    target: { value: '2' },
  });
  expect(observed.props?.seek?.time).toBe(2);
  fireEvent.change(screen.getByLabelText('Camera preset'), {
    target: { value: 'back' },
  });
  expect(observed.props?.cameraPreset).toBe('back');
  fireEvent.click(screen.getByLabelText('Skeleton'));
  fireEvent.click(screen.getByLabelText('Ground grid'));
  fireEvent.click(screen.getByLabelText('Muscle highlights'));
  expect(observed.props?.showSkeleton).toBe(true);
  expect(observed.props?.showGrid).toBe(false);
  expect(observed.props?.showMuscles).toBe(true);
  expect(observed.props?.muscles).toEqual(exercises[1]?.muscles);
  fireEvent.click(screen.getByRole('button', { name: 'Remember pose' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recall pose' }));
  expect(observed.props?.seek?.time).toBe(1);
  fireEvent.change(screen.getByLabelText('Playback speed'), {
    target: { value: '0.25' },
  });
  expect(observed.props?.speed).toBe(0.25);
  fireEvent.change(screen.getByLabelText('Playback speed'), {
    target: { value: '0.5' },
  });
  expect(observed.props?.speed).toBe(0.5);
});

it('does not autoplay when reduced motion is requested, while allowing explicit play', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  try {
    render(<ExerciseViewer exercise="bodyweight-squat" autoPlay review />);
    fireEvent.click(await screen.findByText('Load mock GLB'));
    expect(observed.props?.playing).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(observed.props?.playing).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
