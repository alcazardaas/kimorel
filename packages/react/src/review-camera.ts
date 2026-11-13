import type { CameraPreset } from '@kimorel/core';
/** Preserve metadata framing distance/elevation while orbiting around its target. */
export function reviewCameraPosition(
  target: [number, number, number],
  position: [number, number, number],
  preset: CameraPreset,
): [number, number, number] {
  if (preset === 'three-quarter') return position;
  const radius = Math.hypot(position[0] - target[0], position[2] - target[2]);
  return [
    target[0] + (preset === 'side' ? radius : 0),
    position[1],
    target[2] + (preset === 'front' ? radius : preset === 'back' ? -radius : 0),
  ];
}
