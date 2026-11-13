import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SkeletonHelper } from 'three';
import { applyMuscleHighlights } from './highlights.js';
import type { Exercise, CameraPreset } from '@kimorel/core';
import { reviewCameraPosition } from './review-camera.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createPlayback, disposeScene } from './playback.js';
import { createViewerRenderer } from './renderer.js';
export interface SceneProps {
  url: string;
  clip: string;
  playing: boolean;
  loop: boolean;
  speed: number;
  restart: number;
  resetCamera: number;
  cameraTarget?: [number, number, number];
  cameraPosition?: [number, number, number];
  cameraPreset?: CameraPreset;
  showSkeleton?: boolean;
  showGrid?: boolean;
  showMuscles?: boolean;
  muscles?: Exercise['muscles'];
  seek?: { time: number; revision: number };
  onTimeline?: (time: number, duration: number) => void;
  onReady: () => void;
  onError: (error: Error) => void;
}
function Model(props: SceneProps) {
  const { invalidate, camera, gl } = useThree();
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const playback = useRef<ReturnType<typeof createPlayback> | null>(null);
  const callbacks = useRef(props);
  const lastProgress = useRef(0);
  const helper = useMemo(
    () => (gltf ? new SkeletonHelper(gltf.scene) : null),
    [gltf],
  );
  useEffect(() => () => helper?.dispose(), [helper]);
  useEffect(() => {
    callbacks.current = props;
  });
  useEffect(() => {
    let cancelled = false;
    let owned: GLTF | null = null;
    import('three/addons/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(props.url))
      .then((loaded) => {
        if (cancelled) {
          disposeScene(loaded.scene);
          return;
        }
        owned = loaded;
        try {
          playback.current = createPlayback(
            loaded.scene,
            loaded.animations,
            props.clip,
          );
          setGltf(loaded);
          callbacks.current.onTimeline?.(0, playback.current.duration);
          callbacks.current.onReady();
          invalidate();
        } catch (error) {
          callbacks.current.onError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      })
      .catch((error: unknown) => {
        if (!cancelled)
          callbacks.current.onError(
            error instanceof Error ? error : new Error(String(error)),
          );
      });
    return () => {
      cancelled = true;
      playback.current?.dispose();
      playback.current = null;
      if (owned) disposeScene(owned.scene);
    };
  }, [props.url, props.clip, invalidate]);
  useEffect(() => {
    playback.current?.configure(props.playing, props.loop, props.speed);
    invalidate();
  }, [gltf, props.playing, props.loop, props.speed, invalidate]);
  useEffect(() => {
    if (!gltf || !props.muscles) return;
    applyMuscleHighlights(
      gltf.scene,
      props.muscles,
      props.showMuscles ?? false,
    );
    invalidate();
  }, [gltf, props.muscles, props.showMuscles, invalidate]);
  useEffect(() => {
    if (!props.seek || !playback.current) return;
    const time = playback.current.seek(props.seek.time);
    callbacks.current.onTimeline?.(time, playback.current.duration);
    invalidate();
  }, [props.seek, gltf, invalidate]);
  useEffect(() => {
    if (props.restart) {
      playback.current?.restart();
      playback.current?.configure(
        callbacks.current.playing,
        callbacks.current.loop,
        callbacks.current.speed,
      );
      callbacks.current.onTimeline?.(0, playback.current?.duration ?? 0);
      invalidate();
    }
  }, [props.restart, invalidate]);
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.target.set(...(props.cameraTarget ?? [0, 0.9, 0]));
    controls.minDistance = 1.6;
    controls.maxDistance = 6;
    controls.maxPolarAngle = Math.PI * 0.48;
    const change = () => invalidate();
    controls.addEventListener('change', change);
    controls.update();
    return () => {
      controls.removeEventListener('change', change);
      controls.dispose();
    };
  }, [camera, gl, invalidate, props.resetCamera, props.cameraTarget]);
  useEffect(() => {
    camera.position.set(
      ...reviewCameraPosition(
        props.cameraTarget ?? [0, 0.9, 0],
        props.cameraPosition ?? [2.5, 1.7, 3.2],
        props.cameraPreset ?? 'three-quarter',
      ),
    );
    camera.lookAt(...(props.cameraTarget ?? [0, 0.9, 0]));
    invalidate();
  }, [
    camera,
    invalidate,
    props.resetCamera,
    props.cameraPosition,
    props.cameraTarget,
    props.cameraPreset,
  ]);
  useFrame((state, delta) => {
    if (!props.playing || !playback.current) return;
    playback.current.mixer.update(Math.min(delta, 0.1));
    if (
      state.clock.elapsedTime - lastProgress.current >= 0.1 ||
      !playback.current.action.isRunning()
    ) {
      callbacks.current.onTimeline?.(
        playback.current.action.time,
        playback.current.duration,
      );
      lastProgress.current = state.clock.elapsedTime;
    }
    if (playback.current.action.isRunning()) invalidate();
  });
  return gltf ? (
    <>
      <primitive object={gltf.scene} dispose={null} />
      {props.showSkeleton && helper && (
        <primitive object={helper} dispose={null} />
      )}
    </>
  ) : null;
}
export default function Scene(props: SceneProps) {
  return (
    <Canvas
      camera={{ position: [2.5, 1.7, 3.2], fov: 38 }}
      dpr={[1, 1.5]}
      frameloop="demand"
      gl={createViewerRenderer}
      fallback="Canvas rendering is not supported by this browser."
    >
      <color attach="background" args={['#e8ede8']} />
      <ambientLight intensity={1.8} />
      <directionalLight position={[3, 5, 4]} intensity={3} />
      <Model {...props} />
      {props.showGrid !== false && (
        <gridHelper args={[6, 24, '#b8c8b8', '#d5dfd5']} />
      )}
    </Canvas>
  );
}
