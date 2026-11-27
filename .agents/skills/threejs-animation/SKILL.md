---
name: threejs-animation
description: 'Trigger: skeletal animation, morph targets, mixer lifecycle, rep and hold clips. Review Kimorel animation behavior.'
license: MIT
metadata:
  author: 'CloudAI-X; Kimorel contributors'
  version: '1.0.0-kimorel'
---

## Activation Contract

Load for skeletal animation, morph targets, mixer lifecycle, rep and hold clips. Apply the local adoption policy before consulting historical examples.

## Hard Rules

- Verify APIs against the installed Three.js version in `package.json` and local package source; upstream examples target r186, not this project’s r187.
- Preserve canonical GLBs, joint names, masks, morph targets and contact semantics. Do not optimize or rewrite assets as a playback fix.
- No optional package installs, external asset/decoder URLs, renderer migration or auto-updates.
- Resolve clips by declared identity, preserving rep versus hold; never silently play the first clip or substitute a rep for a hold.
- Give independent animated instances separate mixers and skeletons; share resources only with explicit ownership.
- Preserve pause, speed, scrubbing, reduced-motion and hidden-tab lifecycle behavior; do not add a second render loop.

## Decision Gates

| Situation             | Required action                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Skinned instance      | Use verified skeleton-aware cloning, not a generic object clone.                                |
| Removed animated root | Stop actions, detach listeners and uncache its mixer bindings before releasing owned resources. |
| Procedural override   | Inspect existing mixer/update ordering; do not overwrite canonical pose evidence.               |

## Execution Steps

1. Inspect `packages/react/src/Scene.tsx` and `playback.ts`, declared clips, and existing lifecycle tests.
2. Check actual track names, duration, joint targets and numeric morph influences; distinguish action reset from duration recomputation.
3. Implement only authorized behavior and test missing clips, switches, pause/scrub and cleanup where affected.
4. Use actual exported clip duration for loop checks; engineering playback is not anatomical approval.

## Output Contract

Return changed paths, exact checks and observed outcomes, pending evidence, and rollback scope. Separate measured facts from assumptions; do not claim safety or approval from a skill.

## References

- [Adoption policy](../README.md)
- [Pinned upstream animation reference](../_sources/threejs-animation.txt)
