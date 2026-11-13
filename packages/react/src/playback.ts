import { AnimationMixer, LoopOnce, LoopRepeat, Mesh, Texture } from 'three';
import type { Object3D, AnimationClip, Material } from 'three';

export function createPlayback(
  root: Object3D,
  clips: AnimationClip[],
  name: string,
) {
  const clip = clips.find((candidate) => candidate.name === name);
  if (!clip || clip.duration <= 0)
    throw new Error(`Animation clip not found: ${name}`);
  const mixer = new AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  action.paused = true;
  return {
    mixer,
    action,
    configure(playing: boolean, loop: boolean, speed: number) {
      if (!Number.isFinite(speed) || speed <= 0 || speed > 4)
        throw new Error('Playback speed must be between 0 and 4');
      if (playing && !loop && action.time >= clip.duration)
        action.reset().play();
      action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
      action.clampWhenFinished = !loop;
      action.timeScale = speed;
      action.paused = !playing;
    },
    duration: clip.duration,
    seek(time: number) {
      if (!Number.isFinite(time)) throw new Error('Seek time must be finite');
      action.time = Math.max(0, Math.min(clip.duration, time));
      mixer.update(0);
      root.updateMatrixWorld(true);
      return action.time;
    },
    restart() {
      const paused = action.paused;
      action.reset().play();
      action.paused = paused;
      mixer.update(0);
      root.updateMatrixWorld(true);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    },
  };
}

/** Loaded scenes are exclusively owned by one viewer, never shared through a global cache. */
export function disposeScene(root: Object3D) {
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof Texture) textures.add(value);
    }
    if ('skeleton' in object)
      (
        object as Mesh & { skeleton: { dispose: () => void } }
      ).skeleton.dispose();
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}
