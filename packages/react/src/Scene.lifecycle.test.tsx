// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import {
  AnimationClip,
  AnimationMixer,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Texture,
} from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import Scene from './Scene.js';
import type { SceneProps } from './Scene.js';

const pending = vi.hoisted(() => ({
  loads: [] as {
    url: string;
    resolve: (value: GLTF) => void;
    reject: (error: Error) => void;
  }[],
  controlDisposals: [] as ReturnType<typeof vi.fn>[],
}));

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    loadAsync(url: string) {
      return new Promise<GLTF>((resolve, reject) =>
        pending.loads.push({ url, resolve, reject }),
      );
    }
  },
}));
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { Vector3 } = await import('three');
  return {
    OrbitControls: class {
      target = new Vector3();
      dispose = vi.fn();
      constructor() {
        pending.controlDisposals.push(this.dispose);
      }
      addEventListener() {}
      removeEventListener() {}
      update() {}
    },
  };
});
vi.mock('@react-three/fiber', async () => {
  const { Children, isValidElement } = await import('react');
  const { PerspectiveCamera } = await import('three');
  const state = {
    invalidate: vi.fn(),
    camera: new PerspectiveCamera(),
    gl: { domElement: document.createElement('canvas') },
  };
  return {
    // Run the real Model effects with a fake renderer boundary, not a GPU.
    Canvas: ({ children }: { children: import('react').ReactNode }) => (
      <>
        {Children.toArray(children).filter(
          (child) => isValidElement(child) && typeof child.type === 'function',
        )}
      </>
    ),
    useThree: () => state,
    useFrame: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  pending.loads = [];
  pending.controlDisposals = [];
  vi.restoreAllMocks();
});

function resource() {
  const texture = new Texture();
  const material = new MeshBasicMaterial({ map: texture });
  const geometry = new BoxGeometry();
  const scene = new Group();
  scene.add(new Mesh(geometry, material));
  const gltf = {
    scene,
    scenes: [scene],
    animations: [new AnimationClip('rep', 1, [])],
    cameras: [],
    asset: { version: '2.0' },
    parser: {},
    userData: {},
  } as unknown as GLTF;
  const disposed = [
    vi.spyOn(texture, 'dispose'),
    vi.spyOn(material, 'dispose'),
    vi.spyOn(geometry, 'dispose'),
  ];
  return { gltf, disposed };
}
function props(url = '/first.glb'): SceneProps {
  return {
    url,
    clip: 'rep',
    playing: false,
    loop: true,
    speed: 1,
    restart: 0,
    resetCamera: 0,
    onReady: vi.fn(),
    onError: vi.fn(),
  };
}

it('disposes a late GLTF after unmount without firing callbacks', async () => {
  const callbacks = props();
  const { unmount } = render(<Scene {...callbacks} />);
  await waitFor(() => expect(pending.loads).toHaveLength(1));
  unmount();
  const loaded = resource();
  await act(async () => pending.loads[0]!.resolve(loaded.gltf));
  for (const dispose of loaded.disposed) expect(dispose).toHaveBeenCalledOnce();
  expect(callbacks.onReady).not.toHaveBeenCalled();
  expect(callbacks.onError).not.toHaveBeenCalled();
});

it('cleans loaded resources, mixer bindings and orbit controls on unmount', async () => {
  const stop = vi.spyOn(AnimationMixer.prototype, 'stopAllAction');
  const uncache = vi.spyOn(AnimationMixer.prototype, 'uncacheRoot');
  const callbacks = props();
  const { unmount } = render(<Scene {...callbacks} />);
  await waitFor(() => expect(pending.loads).toHaveLength(1));
  const loaded = resource();
  await act(async () => pending.loads[0]!.resolve(loaded.gltf));
  expect(callbacks.onReady).toHaveBeenCalledOnce();
  expect(callbacks.onError).not.toHaveBeenCalled();
  unmount();
  for (const dispose of loaded.disposed) expect(dispose).toHaveBeenCalledOnce();
  expect(stop).toHaveBeenCalledOnce();
  expect(uncache).toHaveBeenCalledWith(loaded.gltf.scene);
  expect(pending.controlDisposals).toHaveLength(1);
  expect(pending.controlDisposals[0]).toHaveBeenCalledOnce();
});

it('reports missing clips and releases the owned resource when the failed scene is removed', async () => {
  const callbacks = { ...props(), clip: 'missing' };
  const { unmount } = render(<Scene {...callbacks} />);
  await waitFor(() => expect(pending.loads).toHaveLength(1));
  const loaded = resource();
  await act(async () => pending.loads[0]!.resolve(loaded.gltf));
  expect(callbacks.onError).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Animation clip not found: missing' }),
  );
  expect(callbacks.onReady).not.toHaveBeenCalled();
  unmount();
  for (const dispose of loaded.disposed) expect(dispose).toHaveBeenCalledOnce();
});

it('ignores stale completion after replacement and retains the current resource until unmount', async () => {
  const callbacks = props();
  const { rerender, unmount } = render(<Scene {...callbacks} />);
  await waitFor(() => expect(pending.loads).toHaveLength(1));
  rerender(<Scene {...callbacks} url="/second.glb" />);
  await waitFor(() => expect(pending.loads).toHaveLength(2));
  const current = resource();
  await act(async () => pending.loads[1]!.resolve(current.gltf));
  const stale = resource();
  await act(async () => pending.loads[0]!.resolve(stale.gltf));
  for (const dispose of stale.disposed) expect(dispose).toHaveBeenCalledOnce();
  for (const dispose of current.disposed)
    expect(dispose).not.toHaveBeenCalled();
  expect(callbacks.onReady).toHaveBeenCalledOnce();
  expect(callbacks.onError).not.toHaveBeenCalled();
  unmount();
  for (const dispose of current.disposed)
    expect(dispose).toHaveBeenCalledOnce();
});

it('ignores a rejected request after unmount', async () => {
  const callbacks = props();
  const { unmount } = render(<Scene {...callbacks} />);
  await waitFor(() => expect(pending.loads).toHaveLength(1));
  unmount();
  await act(async () =>
    pending.loads[0]!.reject(new Error('Late network failure')),
  );
  expect(callbacks.onReady).not.toHaveBeenCalled();
  expect(callbacks.onError).not.toHaveBeenCalled();
});
