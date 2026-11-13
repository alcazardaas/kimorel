// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { exercises } from '@kimorel/data';
import { ExerciseViewer } from './index.js';
import type { SceneProps } from './Scene.js';
const observed = vi.hoisted(() => ({
  props: null as SceneProps | null,
  failure: null as Error | null,
}));
vi.mock('./Scene.js', () => ({
  default: (props: SceneProps) => {
    if (observed.failure) throw observed.failure;
    observed.props = props;
    return (
      <>
        <button onClick={props.onReady}>Load mock GLB</button>
        <button onClick={() => props.onError(new Error('Missing clip'))}>
          Fail mock GLB
        </button>
      </>
    );
  },
}));
afterEach(() => {
  cleanup();
  observed.props = null;
  observed.failure = null;
  vi.restoreAllMocks();
});
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
