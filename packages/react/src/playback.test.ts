import { expect, it, vi } from 'vitest';
import {
  AnimationClip,
  Group,
  NumberKeyframeTrack,
  Mesh,
  BoxGeometry,
  MeshBasicMaterial,
} from 'three';
import { createPlayback, disposeScene } from './playback.js';
it('loads a named clip, pauses, changes speed, restarts and cleans the mixer', () => {
  const root = new Group();
  const clip = new AnimationClip('rep', 1, [
    new NumberKeyframeTrack('.position[x]', [0, 1], [0, 1]),
  ]);
  const playback = createPlayback(root, [clip], 'rep');
  playback.configure(true, true, 2);
  playback.mixer.update(0.25);
  expect(root.position.x).toBeCloseTo(0.5);
  playback.configure(false, true, 1);
  playback.mixer.update(0.2);
  expect(root.position.x).toBeCloseTo(0.5);
  playback.restart();
  expect(playback.action.time).toBe(0);
  playback.dispose();
  expect(playback.action.isRunning()).toBe(false);
});
it('rejects missing clips and invalid speeds', () => {
  expect(() => createPlayback(new Group(), [], 'rep')).toThrow(
    'clip not found',
  );
  const playback = createPlayback(
    new Group(),
    [new AnimationClip('rep', 1, [])],
    'rep',
  );
  expect(() => playback.configure(true, true, NaN)).toThrow('speed');
  playback.dispose();
});
it('disposes uniquely owned geometry and materials', () => {
  const geometry = new BoxGeometry();
  const material = new MeshBasicMaterial();
  const root = new Group();
  root.add(new Mesh(geometry, material), new Mesh(geometry, material));
  const geometryDispose = vi.spyOn(geometry, 'dispose');
  const materialDispose = vi.spyOn(material, 'dispose');
  disposeScene(root);
  expect(geometryDispose).toHaveBeenCalledOnce();
  expect(materialDispose).toHaveBeenCalledOnce();
});
it('seeks paused poses exactly, clamps frame steps and rejects invalid time', () => {
  const root = new Group();
  const playback = createPlayback(
    root,
    [
      new AnimationClip('rep', 1, [
        new NumberKeyframeTrack('.position[x]', [0, 1], [0, 1]),
      ]),
    ],
    'rep',
  );
  expect(playback.seek(0.5)).toBe(0.5);
  expect(root.position.x).toBeCloseTo(0.5);
  expect(playback.action.paused).toBe(true);
  expect(playback.seek(-1)).toBe(0);
  expect(playback.seek(10)).toBe(1);
  expect(root.position.x).toBeCloseTo(1);
  expect(() => playback.seek(NaN)).toThrow('finite');
  playback.dispose();
});
it('restart immediately evaluates the initial pose while remaining paused', () => {
  const root = new Group();
  const playback = createPlayback(
    root,
    [
      new AnimationClip('rep', 1, [
        new NumberKeyframeTrack('.position[x]', [0, 1], [0, 1]),
      ]),
    ],
    'rep',
  );
  playback.seek(0.7);
  playback.restart();
  expect(root.position.x).toBe(0);
  expect(playback.action.paused).toBe(true);
  playback.dispose();
});
