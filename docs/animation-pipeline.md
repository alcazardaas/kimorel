# Reproduce the three exercise previews

One editable canonical human, one 18-joint rig, one weight generator and one deterministic GLB exporter produce all three exercises. Original geometry, motion and equipment are CC0; source code is MIT. These are technical review previews, not approved clinical movement demonstrations.

```bash
pnpm assets:build
pnpm assets:preview
pnpm assets:qa
pnpm validate:preview
python3 -m unittest discover -s pipeline/tests -v
```

`pipeline/character/build.py` defines the surface, rig, weights, dumbbell geometry and binary export. `motions.py` defines shared quaternion math, forward kinematics and two-bone IK plus original four-second motion clips. `preview.py` renders the actual weighted skin and attached equipment into reproducible five-phase CPU contact sheets under `docs/reviews/`. These are not browser screenshots. Each sheet orders t=0,1,2,3,4 seconds: start, descent/flexion, bottom/top, ascent/extension, return.

## Motion constraints

| Clip    | Authoring constraints                                                                       | Exported-file QA                                                        |
| ------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Squat   | Fixed ankle contacts; sagittal leg IK; controlled pelvis height and torso lean              | Ankle and actual sole-skin drift; sampled skinned ground penetration    |
| Push-up | Rigid inclined trunk/legs rotate about fixed ankles; shoulder-to-wrist IK; horizontal palms | Both wrists and ankles; low skin contacts; sampled ground penetration   |
| Curl    | Stable upper-arm orientation; elbow flexion; props parented to hand grips                   | Foot contacts; grip hierarchy and equipment-origin attachment stability |

All exported clips require skin joints, finite normalized nonnegative skin weights, connected indexed human topology, finite animation/skinned positions, matching loop endpoints, no root drift and conservative authoring rotation bounds. The root is fixed; pelvis motion is allowed. QA samples 121 contact poses and every fourth pose for all skinned vertices. Limits are engineering constraints, NOT anatomical or clinical validation. Attachment checks do not establish that a hand visually grips a prop without intersections. Mesh self-intersections, normal quality, shoulder/pelvis deformation and contact plausibility still require visual review.

## Source and export boundary

No captured or third-party motion is used. No motion-capture dependency is required. Keep future verified source motion separate from processed motion and generated exercise GLBs. Never infer redistribution rights from download availability.

The direct standard-library Python GLB exporter is the current reproducible route. Blender is not installed here. The optional `export_blender.py` import/save bridge remains unexecuted; do not claim a verified `.blend` or Blender export. See [rig conventions](architecture/skeleton.md) and [character decision](architecture/character-selection.md).

## Approval

Run technical checks first, then inspect all phases in the browser. Follow [asset review instructions](asset-licensing.md). Source provenance, exported QA, human visual approval and clinical review remain separate decisions. `pnpm validate:data` is the strict release gate; passing preview validation never approves an asset.
