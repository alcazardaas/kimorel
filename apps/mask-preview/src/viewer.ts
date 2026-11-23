import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  AmbientLight,
  DirectionalLight,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  createPlayback,
  disposeScene,
} from '../../../packages/react/src/playback';
import { applyMasks } from './masks';
import type { Bundle } from './load';

export type Progress = {
  time: number;
  duration: number;
  morph: number;
  displacement: number;
  draws: number;
};
/** Exclusively owns bundle after construction succeeds; no caches or shared geometry. */
export function createPreview(
  host: HTMLDivElement,
  bundle: Bundle,
  progress: (p: Progress) => void,
  fail: (e: Error) => void,
) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 1.5));
  renderer.domElement.setAttribute(
    'aria-label',
    'Animated anatomical draft surface',
  );
  renderer.domElement.setAttribute('role', 'img');
  const scene = new Scene();
  scene.background = new Color('#edf1f3');
  scene.add(bundle.gltf.scene);
  scene.add(new AmbientLight('#ffffff', 2));
  const light = new DirectionalLight('#ffffff', 2.5);
  light.position.set(3, 5, 4);
  scene.add(light);
  const camera = new PerspectiveCamera(36, 1, 0.01, 20);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0.95, 0);
  orbit.minDistance = 1.4;
  orbit.maxDistance = 5;
  const reset = () => {
    camera.position.set(2.3, 1.55, 3.4);
    orbit.target.set(0, 0.95, 0);
    orbit.update();
  };
  reset();
  host.append(renderer.domElement);
  // Dynamic stress poses may exceed the static glTF rest bounding sphere.
  bundle.mesh.frustumCulled = false;
  applyMasks(bundle.mesh, bundle.masks, 'all');
  let playback = createPlayback(
    bundle.gltf.scene,
    bundle.gltf.animations,
    'shoulder-elevation',
  );
  let playing = false,
    speed = 0.5,
    disposed = false,
    last = 0,
    lastReport = 0,
    frame = 0;
  const rest = new Vector3();
  let sample = 0;
  function resetSample() {
    playback.seek(0);
    sample = bundle.masks[0]!.weights.findIndex((w) => w > 0.9);
    bundle.mesh.getVertexPosition(sample, rest);
  }
  resetSample();
  const observer = new globalThis.ResizeObserver(() => {
    if (disposed) return;
    const { width, height } = host.getBoundingClientRect();
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    camera.updateProjectionMatrix();
    renderer.setSize(Math.max(1, width), Math.max(1, height));
  });
  observer.observe(host);
  const contextLost = (event: Event) => {
    event.preventDefault();
    playing = false;
    fail(new Error('WebGL context lost. Reload the draft preview.'));
  };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  const report = () => {
    bundle.gltf.scene.updateMatrixWorld(true);
    bundle.mesh.skeleton.update();
    const current = bundle.mesh.getVertexPosition(sample, new Vector3());
    progress({
      time: playback.action.time,
      duration: playback.duration,
      morph: Math.max(0, ...(bundle.mesh.morphTargetInfluences ?? [])),
      displacement: current.distanceTo(rest),
      draws: renderer.info.render.calls,
    });
  };
  const tick = (now: number) => {
    if (disposed) return;
    try {
      if (playing) playback.mixer.update(Math.min((now - last) / 1000, 0.1));
      last = now;
      renderer.render(scene, camera);
      if (now - lastReport > 100) {
        report();
        lastReport = now;
      }
      frame = globalThis.requestAnimationFrame(tick);
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  };
  frame = globalThis.requestAnimationFrame(tick);
  return {
    selectMask(id: string) {
      applyMasks(bundle.mesh, bundle.masks, id);
    },
    setClip(name: string) {
      playback.dispose();
      playback = createPlayback(
        bundle.gltf.scene,
        bundle.gltf.animations,
        name,
      );
      resetSample();
      playback.configure(playing, true, speed);
      report();
    },
    setPlaying(value: boolean) {
      playing = value;
      playback.configure(playing, true, speed);
      // Publish the stopped action time now, not the next throttled frame.
      report();
    },
    setSpeed(value: number) {
      speed = value;
      playback.configure(playing, true, speed);
    },
    seek(value: number) {
      playback.seek(value);
      report();
    },
    resetCamera: reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      globalThis.cancelAnimationFrame(frame);
      observer.disconnect();
      orbit.dispose();
      playback.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      disposeScene(bundle.gltf.scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
