// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import Scene from './Scene.js';

// Real R3F Canvas, not a Scene/Canvas mock. Zero jsdom layout intentionally
// defers GPU creation, while React still mounts native canvas fallback content.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('does not report a WebGL failure just because native canvas fallback mounts', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const error = vi.fn();
  const { container } = render(
    <Scene
      url="/assets/exercises/bodyweight-squat.glb"
      clip="rep"
      playing={false}
      loop
      speed={1}
      restart={0}
      resetCamera={0}
      onReady={vi.fn()}
      onError={error}
    />,
  );
  expect(container.querySelector('canvas')).not.toBeNull();
  expect(error).not.toHaveBeenCalled();
});
