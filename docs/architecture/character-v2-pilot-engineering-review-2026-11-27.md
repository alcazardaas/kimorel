# Three-pilot engineering review — 2026-11-27

**Engineering checks pass; qualified artist/anatomy acceptance is still pending. Family migration remains blocked.** This is tooling-based engineering and static-image inspection, not a named qualified anatomical or clinical sign-off. No asset, approval flag or runtime default was changed.

## Exact inspected assets

| File                                                                                                                        |   Bytes | SHA256                                                             |
| --------------------------------------------------------------------------------------------------------------------------- | ------: | ------------------------------------------------------------------ |
| [bodyweight-squat.glb](../../pipeline/character-v2/exercise-pilot/bodyweight-squat.glb)                                     | 2136660 | `aa4d75481e1681078b6ba0122d2962937dc1b8515653091f4650c3f58f3b89c4` |
| [bodyweight-squat-comparison.png](../../pipeline/character-v2/exercise-pilot/bodyweight-squat-comparison.png)               | 1115779 | `9683f39655b9b18c789bd53d888e713b2715a97d448758be7a8850c425fc12cc` |
| [push-up.glb](../../pipeline/character-v2/exercise-pilot/push-up.glb)                                                       | 2136116 | `96b075f4a9868b8ea6e1d74cd2db347138f1363363d4953f98107d6f48170484` |
| [push-up-comparison.png](../../pipeline/character-v2/exercise-pilot/push-up-comparison.png)                                 | 1074304 | `07d0d4c92ad95aa8468e8edbe6f5912cb3089f7052c8e70f749c051b17e9846e` |
| [dumbbell-shoulder-press.glb](../../pipeline/character-v2/exercise-pilot/dumbbell-shoulder-press.glb)                       | 2149004 | `1013c7f16017c34e50df2288291b4458f9d91f171d62cd6649f4434dcc614c42` |
| [dumbbell-shoulder-press-comparison.png](../../pipeline/character-v2/exercise-pilot/dumbbell-shoulder-press-comparison.png) | 1087574 | `bdcb7d68009aeef3037f47a15611ea34eecfb7c4169e9c30dab6aa988540c9c4` |

The GLBs and sheets match their manifest hashes. The manifest still states `experimental-pilot-needs-review`, `humanApproval: false` and `anatomicalValidation: false`. Neutral-body SHA256 remains `c7b0bcd52e36f0f281cd13e990c65db9907e3a27ee162a1790837d7236a50571`. A changed asset invalidates this exact-hash review; do not transfer it to a regenerated file.

## Fresh numerical engineering evidence

Read-only `node scripts/character-v2-pilot-qa.mjs` passed on these actual exports. It samples all 121 authored times from 0 through 4 seconds, loads actual GLB skin/morph/rig data and compares against canonical trajectories plus explicitly declared contact adjustments. The thirteen focused positive/corruption tests also passed, including wrong rest-basis, frozen motion/morphs, detached props, rough weight fields and exporter tiny-weight pruning. These checks detect specified engineering defects, not all plausible anatomical errors.

| Exercise                | Maximum adjusted joint error | Maximum posed/rest edge stretch | Contact/grip observation                                                          |
| ----------------------- | ---------------------------: | ------------------------------: | --------------------------------------------------------------------------------- |
| Bodyweight squat        |                     0.778 µm |                         4.6164× | Sole drift ≤0.000381 mm; right sole height about 0.072 mm                         |
| Push-up                 |                     0.640 µm |                         4.8520× | Palm heights 2.040–2.379 mm; maximum palm drift 0.3355 mm                         |
| Dumbbell shoulder press |                     1.114 µm |                         5.9597× | Sampled handle-surface distance ≤0.001392 mm; head/equipment clearance 164.990 mm |

The engineering spike gate remains 6× across 78,222 rest edges ≥1 mm, at 121 samples per clip. Passing it is NOT anatomical acceptance, uniform deformation quality or collision-free proof for every possible point/time. The press is near that bound, so independent visual judgement is especially important. All clips retain the expected four-second `rep`; maximum loop-return error is below 0.000075 mm and morph-reference error below 2.86e-7. Exact native weight provenance passes; 3,687 distal digit vertices retain their original weights. Global digit-skin travel does not establish local finger physiology or grip force.

The joint-error column is against the DECLARED adjusted reference: all clips include a −8.360867 mm root datum; push-up additionally has an 11 mm wrist-target IK correction. Raw canonical position difference reaches 19.360943 mm in push-up. These adjustments are documented, not hidden tolerances. Palm values pass the configured floor-contact gate, but do not claim literal zero-gap physical contact. Numerical closest-surface handle distance alone does not certify a human-realistic finger wrap.

## What was actually inspected visually

The three existing comparison sheets were opened directly. Each has v1 on top and v2 below, front/side/three-quarter cameras at generator frame 61 (one near-midpoint pose; no exact time inferred here). `build_exercise_pilot.py:render_proof` reimports the exported GLB and renders that frame with matched v1/v2 camera fitting. No Blender or asset regeneration was performed for this review. These are static poses: **no video, full motion visual inspection, rear view or dedicated hand/foot close-up is claimed**.

| Area                     | Visible observation / review request                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Squat body and joints    | V2 exposes separated hand silhouettes and more defined torso/limb masses. Hip/thigh/knee masses remain strongly rounded; groin and shoulder/axillary folds are visible. Artist/anatomy reviewer should assess landmark placement, compression and silhouette, rather than treat muscle-like bulges as validated muscles. |
| Push-up body and support | Shown pose retains a long trunk silhouette with bent arms; hands/feet are framed near the floor reference. Shoulder, chest and hip masses remain pronounced. The sheet cannot resolve every finger contact or certify wrist/elbow/shoulder mechanics; inspect those close up and through the whole rep.                  |
| Press and grips          | Both loads, hands and feet are within frame and the head is visibly separated from the loads in these views. Chest/axillary ridges and rounded upper-arm/hip masses remain conspicuous. Hand-wrap, wrist alignment, shoulder-girdle coordination and rear silhouette need qualified close-up/temporal review.            |

No large curtain-like spike is apparent in these particular views. That limited observation does not close the visible fold/mass concerns, hidden intersections, intermediate-pose quality or the wider [pilot gate](./character-v2-plan.md#pilot-gate). Surface masks/activation were not inspected or approved; v2 muscle overlays remain disabled.

## Required acceptance handoff

A named qualified artist/anatomy reviewer must record review scope, date, these exact three GLB hashes, observed poses/views, corrections or explicit acceptance, and limitations. Required scope includes proportion/landmark judgement, shoulder/hip/elbow/wrist/hand/foot credibility and actual contact/grip through intermediate poses, rear views and close-ups. Qualified acceptance and clinical evidence are separate; this record provides neither. Named physical-device performance/interaction acceptance is also still pending; Chromium viewport/touch emulation is not a phone.

Until that evidence exists, keep the next-family export/activation task blocked and v1 as the default/fallback. The existing recovery task contains a conditional standing-lower-body scope; it is preparation, not an implemented migration.
