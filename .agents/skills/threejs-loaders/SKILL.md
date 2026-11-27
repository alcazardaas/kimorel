---
name: threejs-loaders
description: 'Trigger: GLB loading, cache switching, error recovery, skinned clones and disposal. Protect Kimorel asset identity.'
license: MIT
metadata:
  author: 'CloudAI-X; Kimorel contributors'
  version: '1.0.0-kimorel'
---

## Activation Contract

Load for glb loading, cache switching, error recovery, skinned clones and disposal. Apply the local adoption policy before consulting historical examples.

## Hard Rules

- Verify APIs against the installed Three.js version in `package.json` and local package source; upstream examples target r186, not this project’s r187.
- Preserve canonical GLBs, joint names, masks, morph targets and contact semantics. Do not optimize or rewrite assets as a playback fix.
- No optional package installs, external asset/decoder URLs, renderer migration or auto-updates.
- Load only project-approved assets. Inspect referenced resources as well as the top-level GLB; a model URL does not authorize external textures, buffers or decoder downloads.
- Preserve existing cache and cancellation ownership; prevent stale responses from replacing a newer selection.
- Keep failed-load versus missing-clip recovery explicit; no silent placeholder or fallback claim without actual success.
- Dispose only resources no retained cache/instance uses. Generic disposal snippets are not ownership-aware.

## Decision Gates

| Situation               | Required action                                                               |
| ----------------------- | ----------------------------------------------------------------------------- |
| Skinned clone           | Verify skeleton-aware cloning and independent mixer state.                    |
| Cache hit               | Preserve shared resources until the last owner releases them.                 |
| New compression/decoder | Stop for authorization and version/source review; do not fetch a CDN example. |

## Execution Steps

1. Inspect `packages/react/src/Scene.tsx`, `playback.ts` and affected loading/recovery tests.
2. Verify GLB identity, expected clip and external resource behavior before adding it to the scene.
3. Check rapid switching, late success/failure, retry, unmount and stale-result disposal.
4. Report actual fallback/retry behavior and unresolved errors; preserve experimental-v2/v1 selection policy.

## Output Contract

Return changed paths, exact checks and observed outcomes, pending evidence, and rollback scope. Separate measured facts from assumptions; do not claim safety or approval from a skill.

## References

- [Adoption policy](../README.md)
- [Pinned upstream loader reference](../_sources/threejs-loaders.txt)
