import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { resolveAssetUrl } from '@kimorel/core';
import type { Exercise, CameraPreset } from '@kimorel/core';
import { getExercise } from '@kimorel/data';
import { reportViewerError } from './diagnostics.js';
const Scene = lazy(() => import('./Scene.js'));
export interface ExerciseViewerProps {
  exercise: string | Exercise;
  assetBaseUrl?: string;
  autoPlay?: boolean;
  loop?: boolean;
  controls?: boolean;
  playbackSpeed?: number;
  className?: string;
  /** Enable inspection controls without creating a second renderer. */
  review?: boolean;
  showMuscles?: boolean;
  onReady?: () => void;
  onError?: (error: Error) => void;
}
class ViewerBoundary extends Component<
  { children: ReactNode; onError?: ((error: Error) => void) | undefined },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    reportViewerError(error, 'scene-render', {
      componentStack: info.componentStack,
    });
    this.props.onError?.(error);
  }
  render() {
    return this.state.error ? (
      <p role="alert">
        The 3D viewer could not be loaded: {this.state.error.message}
      </p>
    ) : (
      this.props.children
    );
  }
}
function AnimatedViewer({
  exercise,
  assetBaseUrl = '/assets',
  autoPlay = false,
  loop,
  controls = true,
  playbackSpeed,
  review = false,
  showMuscles = false,
  onReady,
  onError,
}: Omit<ExerciseViewerProps, 'exercise'> & { exercise: Exercise }) {
  const [ready, setReady] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);
  useEffect(() => {
    let intersecting = true;
    const update = () => setActive(intersecting && !document.hidden);
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            intersecting = entry?.isIntersecting ?? true;
            update();
          });
    if (container.current) observer?.observe(container.current);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(
    playbackSpeed ?? exercise.animation?.defaultPlaybackSpeed ?? 1,
  );
  const [repeating, setRepeating] = useState(
    loop ?? exercise.animation?.loop ?? true,
  );
  const [restart, setRestart] = useState(0);
  const [resetCamera, setResetCamera] = useState(0);
  const [preset, setPreset] = useState<CameraPreset>(exercise.camera.preset);
  const [skeleton, setSkeleton] = useState(false);
  const [grid, setGrid] = useState(true);
  const [highlights, setHighlights] = useState(showMuscles);
  const [timeline, setTimeline] = useState({ time: 0, duration: 0 });
  const [seek, setSeek] = useState({ time: 0, revision: 0 });
  const [bookmark, setBookmark] = useState<number | null>(null);
  useEffect(() => setHighlights(showMuscles), [showMuscles]);
  const inspectTime = (time: number) => {
    setPlaying(false);
    setSeek((previous) => ({
      time: Math.max(0, Math.min(timeline.duration, time)),
      revision: previous.revision + 1,
    }));
  };
  useEffect(() => {
    if (playbackSpeed !== undefined) setSpeed(playbackSpeed);
  }, [playbackSpeed]);
  useEffect(() => {
    if (loop !== undefined) setRepeating(loop);
  }, [loop]);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setPlaying(autoPlay && !preference?.matches);
    update();
    preference?.addEventListener('change', update);
    return () => preference?.removeEventListener('change', update);
  }, [autoPlay]);
  if (!exercise.animation)
    return <p role="status">Example metadata — animation not available yet.</p>;
  let url: string;
  try {
    url = resolveAssetUrl(
      new URL(
        assetBaseUrl,
        typeof document === 'undefined'
          ? 'http://localhost/'
          : document.baseURI,
      ).href,
      exercise.animation.file,
    );
  } catch {
    return <p role="alert">Invalid asset base URL.</p>;
  }
  if (!Number.isFinite(speed) || speed <= 0 || speed > 4)
    return <p role="alert">Playback speed must be between 0 and 4.</p>;
  return (
    <>
      <div
        ref={container}
        style={{ height: 440, minHeight: 280 }}
        role="group"
        aria-label={`${exercise.name} animation`}
      >
        {error ? (
          <p role="alert">Unable to load animation: {error}</p>
        ) : (
          <ViewerBoundary onError={onError}>
            {!ready && <p role="status">Loading exercise animation…</p>}
            <Suspense fallback={null}>
              <Scene
                url={url}
                clip={exercise.animation.clip}
                playing={playing && active}
                loop={repeating}
                speed={speed}
                restart={restart}
                resetCamera={resetCamera}
                cameraPreset={preset}
                showSkeleton={skeleton}
                showGrid={grid}
                showMuscles={highlights}
                muscles={exercise.muscles}
                seek={seek}
                onTimeline={(time, duration) => setTimeline({ time, duration })}
                {...(exercise.camera.target
                  ? { cameraTarget: exercise.camera.target }
                  : {})}
                {...(exercise.camera.position
                  ? { cameraPosition: exercise.camera.position }
                  : {})}
                onReady={() => {
                  setReady(true);
                  onReady?.();
                }}
                onError={(failure) => {
                  reportViewerError(failure, 'asset-load', { url });
                  setError(failure.message);
                  onError?.(failure);
                }}
              />
            </Suspense>
          </ViewerBoundary>
        )}
      </div>
      {controls && (
        <div role="group" aria-label="Animation controls">
          <button
            disabled={!ready || !!error}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? 'Pause' : 'Play'}
          </button>{' '}
          <button
            disabled={!ready || !!error}
            onClick={() => {
              setRestart((value) => value + 1);
            }}
          >
            Restart
          </button>{' '}
          <button
            onClick={() => {
              setPreset(exercise.camera.preset);
              setResetCamera((value) => value + 1);
            }}
          >
            Reset camera
          </button>{' '}
          <label>
            Speed{' '}
            <select
              aria-label="Playback speed"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            >
              {[0.25, 0.5, 1, 1.5, 2].map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>{' '}
          <label>
            <input
              type="checkbox"
              checked={repeating}
              onChange={(event) => setRepeating(event.target.checked)}
            />{' '}
            Loop
          </label>
          <label>
            <input
              type="checkbox"
              checked={highlights}
              onChange={(event) => setHighlights(event.target.checked)}
            />
            Muscle highlights
          </label>
          {highlights && (
            <p>
              Primary: strong coral · Secondary: pale amber. Broad educational
              regions, not measured activation. Unmapped muscles are not
              colored.
            </p>
          )}
          {review && (
            <fieldset disabled={!ready || !!error}>
              <legend>Visual review</legend>
              <label>
                Timeline{' '}
                <input
                  aria-label="Animation timeline"
                  type="range"
                  min={0}
                  max={timeline.duration}
                  step={1 / 30}
                  value={timeline.time}
                  onChange={(event) => inspectTime(Number(event.target.value))}
                />
              </label>
              <output aria-label="Animation time">
                {timeline.time.toFixed(3)} / {timeline.duration.toFixed(3)} s
              </output>
              <button onClick={() => inspectTime(timeline.time - 1 / 30)}>
                Previous frame
              </button>
              <button onClick={() => inspectTime(timeline.time + 1 / 30)}>
                Next frame
              </button>
              <label>
                Camera{' '}
                <select
                  aria-label="Camera preset"
                  value={preset}
                  onChange={(event) =>
                    setPreset(event.target.value as CameraPreset)
                  }
                >
                  {(['front', 'side', 'back', 'three-quarter'] as const).map(
                    (value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={skeleton}
                  onChange={(event) => setSkeleton(event.target.checked)}
                />
                Skeleton
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={grid}
                  onChange={(event) => setGrid(event.target.checked)}
                />
                Ground grid
              </label>
              <button onClick={() => setBookmark(timeline.time)}>
                Remember pose
              </button>
              <button
                disabled={bookmark === null}
                onClick={() => bookmark !== null && inspectTime(bookmark)}
              >
                Recall pose
              </button>
              {bookmark !== null && (
                <span>Remembered: {bookmark.toFixed(3)} s</span>
              )}
            </fieldset>
          )}
          <p>
            Drag to orbit. Scroll or pinch to zoom. Animation is educational,
            not clinical guidance.
          </p>
        </div>
      )}
    </>
  );
}
export function ExerciseViewer(props: ExerciseViewerProps) {
  const exercise =
    typeof props.exercise === 'string'
      ? getExercise(props.exercise)
      : props.exercise;
  if (!exercise) return <p role="alert">Exercise not found.</p>;
  return (
    <section
      className={props.className}
      aria-label={`${exercise.name} preview`}
    >
      <AnimatedViewer
        {...props}
        exercise={exercise}
        key={`${exercise.id}:${exercise.animation?.file ?? ''}:${props.assetBaseUrl ?? ''}`}
      />
    </section>
  );
}
