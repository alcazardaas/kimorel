---
name: threejs-performance
description: 'Trigger: rendering performance, draw calls, memory, mobile quality. Measure before optimizing Kimorel.'
license: MIT
metadata:
  author: 'CloudAI-X; Kimorel contributors'
  version: '1.0.0-kimorel'
---

## Activation Contract

Load for rendering performance, draw calls, memory, mobile quality. Apply the local adoption policy before consulting historical examples.

## Hard Rules

- Verify APIs against the installed Three.js version in `package.json` and local package source; upstream examples target r186, not this project’s r187.
- Preserve canonical GLBs, joint names, masks, morph targets and contact semantics. Do not optimize or rewrite assets as a playback fix.
- No optional package installs, external asset/decoder URLs, renderer migration or auto-updates.
- Report named device/browser, scene, viewport, pixel ratio, sample window and warmup. Separate file size, CPU timing, GPU estimates and measured device performance.
- Treat renderer resource counters as counts, not VRAM bytes. Do not label software-rendered browser results physical-mobile proof.
- Preserve skinning, masks, topology, animation and resource ownership. Do not merge/decimate/compress frozen characters or disable culling scene-wide.

## Decision Gates

| Evidence             | Next action                                                                    |
| -------------------- | ------------------------------------------------------------------------------ |
| No measurements      | Capture a scoped baseline before changing quality.                             |
| Fill-rate bottleneck | Compare bounded pixel-ratio/quality settings without changing asset contracts. |
| Resource growth      | Inspect ownership and repeated mount/switch/unmount disposal.                  |

## Execution Steps

1. Read existing performance evidence under `docs/architecture/character-v2-performance.md` and the affected viewer code.
2. Measure render calls/triangles after the relevant render; account for multiple passes and shadows.
3. Compare one authorized change against identical conditions; report tradeoffs and pending device coverage.
4. Recheck visual quality, repeated switching, pause/visibility and owned resource cleanup.

## Output Contract

Return changed paths, exact checks and observed outcomes, pending evidence, and rollback scope. Separate measured facts from assumptions; do not claim safety or approval from a skill.

## References

- [Adoption policy](../README.md)
- [Pinned upstream performance reference](../_sources/threejs-performance.txt)
