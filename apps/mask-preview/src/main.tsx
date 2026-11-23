import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { loadBundle, frozenHash } from './load';
import { createPreview } from './viewer';
import type { Progress } from './viewer';
import { palette } from './masks';
import { disposeScene } from '../../../packages/react/src/playback';
import './style.css';

function App() {
  const host = useRef<HTMLDivElement>(null),
    viewer = useRef<ReturnType<typeof createPreview> | null>(null);
  const [status, setStatus] = useState('Verifying draft files…'),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false);
  const [clips, setClips] = useState<string[]>([]),
    [clip, setClip] = useState('shoulder-elevation'),
    [selection, setSelection] = useState('all'),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState('0.5');
  const [progress, setProgress] = useState<Progress>({
    time: 0,
    duration: 0,
    morph: 0,
    displacement: 0,
    draws: 0,
  });
  useEffect(() => {
    const controller = new globalThis.AbortController();
    let cancelled = false;
    const fail = (e: Error) => {
      if (!cancelled) {
        viewer.current?.dispose();
        viewer.current = null;
        setError(e.message);
        setStatus('Draft unavailable');
        setReady(false);
      }
    };
    loadBundle(controller.signal)
      .then((bundle) => {
        if (cancelled) {
          disposeScene(bundle.gltf.scene);
          return;
        }
        try {
          viewer.current = createPreview(
            host.current!,
            bundle,
            setProgress,
            fail,
          );
          setClips(bundle.gltf.animations.map((c) => c.name));
          setReady(true);
          setStatus('Verified draft loaded');
        } catch (e) {
          disposeScene(bundle.gltf.scene);
          fail(e instanceof Error ? e : new Error(String(e)));
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          fail(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
      controller.abort();
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, []);
  return (
    <main>
      <header>
        <p className="eyebrow">ISOLATED DEVELOPMENT PREVIEW</p>
        <h1>Draft muscle surfaces</h1>
        <p className="badge">
          Anatomical review pending · coverage, not activation
        </p>
        <p>
          Four authored surface approximations on an experimental body. No
          clinical approval or default character replacement.
        </p>
      </header>
      <div className="layout">
        <section className="stage" aria-label="Draft inspection viewport">
          <div className="canvas" ref={host} />
          <p role="status">{status}</p>
          {error && <p role="alert">{error}</p>}
        </section>
        <section className="controls" aria-label="Inspection controls">
          <h2>Inspect the proposal</h2>
          <fieldset disabled={!ready}>
            <legend>Surface coverage</legend>
            <label>
              Mask selection
              <select
                value={selection}
                onChange={(e) => {
                  setSelection(e.target.value);
                  viewer.current?.selectMask(e.target.value);
                }}
              >
                <option value="all">All four masks</option>
                <option value="none">Neutral surface</option>
                {Object.keys(palette).map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <ul className="legend">
              {Object.entries(palette).map(([id, color]) => (
                <li key={id}>
                  <span style={{ background: color }} />
                  {id}
                </li>
              ))}
            </ul>
          </fieldset>
          <fieldset disabled={!ready}>
            <legend>Engineering stress animation</legend>
            <label>
              Stress clip
              <select
                value={clip}
                onChange={(e) => {
                  setClip(e.target.value);
                  viewer.current?.setClip(e.target.value);
                }}
              >
                {clips.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <div className="buttons">
              <button
                onClick={() => {
                  setPlaying(!playing);
                  viewer.current?.setPlaying(!playing);
                }}
              >
                {playing ? 'Pause' : 'Play'}
              </button>
              <button onClick={() => viewer.current?.resetCamera()}>
                Reset camera
              </button>
            </div>
            <label>
              Playback speed
              <select
                value={speed}
                onChange={(e) => {
                  setSpeed(e.target.value);
                  viewer.current?.setSpeed(Number(e.target.value));
                }}
              >
                <option value="0.25">0.25×</option>
                <option value="0.5">0.5×</option>
                <option value="1">1×</option>
              </select>
            </label>
            <label>
              Pose time
              <input
                aria-label="Pose time"
                type="range"
                min="0"
                max={progress.duration || 1}
                step="0.001"
                value={progress.time}
                onChange={(e) => viewer.current?.seek(Number(e.target.value))}
              />
            </label>
            <output aria-label="Playback time">
              {progress.time.toFixed(3)} / {progress.duration.toFixed(3)} s
            </output>
          </fieldset>
          <details>
            <summary>Exact draft and playback diagnostics</summary>
            <p>
              GLB SHA256 <code>{frozenHash}</code>
            </p>
            <p>26,939 vertices · 4 pending masks · 0 activation roles</p>
            <p
              data-testid="motion-proof"
              data-displacement={progress.displacement}
              data-morph={progress.morph}
              data-draws={progress.draws}
            >
              Sample skin displacement:{' '}
              {(progress.displacement * 1000).toFixed(2)} mm · corrective
              weight: {progress.morph.toFixed(3)} · draw calls: {progress.draws}
            </p>
          </details>
          <p className="limits">
            Orbit by dragging; pinch or scroll to zoom. Shape boundaries,
            underarm webbing and deformation still require anatomy/artist
            review. Stress clips are not prescribed exercise ranges.
          </p>
        </section>
      </div>
    </main>
  );
}
createRoot(globalThis.document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
