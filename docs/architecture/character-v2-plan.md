# Anatomy-informed character v2: detailed implementation plan

> **Status: planning proposal only.** Creating this document does not authorize implementation, asset replacement, dependency installation, publication, or approval of generated assets. All implementation checkboxes below are intentionally unchecked.

Build a higher-quality original character in Blender, retain standard GLB delivery and the existing React Three Fiber/Three.js viewer, and migrate the 100 exercise previews through a versioned, reversible pipeline. Improve body structure, coordinated movement, deformation, hands, muscle-region visualization, and physical contact together; a denser mesh alone is not the objective.

## Contents

- [Purpose, scope, and authorization](#purpose-scope-and-authorization)
- [Current implementation and migration constraints](#current-implementation-and-migration-constraints)
- [Roles and evidence ownership](#roles-and-evidence-ownership)
- [Reference body and anatomical landmarks](#reference-body-and-anatomical-landmarks)
- [Body structure and rig requirements](#body-structure-and-rig-requirements)
- [Muscle catalog and visualization contract](#muscle-catalog-and-visualization-contract)
- [Mesh topology, skinning, and corrective deformation](#mesh-topology-skinning-and-corrective-deformation)
- [Versioned asset architecture](#versioned-asset-architecture)
- [Blender authoring and export pipeline](#blender-authoring-and-export-pipeline)
- [Motion retargeting and equipment adaptation](#motion-retargeting-and-equipment-adaptation)
- [Three-exercise vertical pilot](#three-exercise-vertical-pilot)
- [Migration of the complete catalog](#migration-of-the-complete-catalog)
- [Validation and evidence requirements](#validation-and-evidence-requirements)
- [Performance, accessibility, and browser acceptance](#performance-accessibility-and-browser-acceptance)
- [Work breakdown and delivery gates](#work-breakdown-and-delivery-gates)
- [Risks and proposed decisions](#risks-and-proposed-decisions)
- [Final definition of done](#final-definition-of-done)
- [Sources and reference limitations](#sources-and-reference-limitations)

## Purpose, scope, and authorization

### Intended outcome

Deliver an anatomy-informed educational character whose proportions, joint behavior, deformation, visible muscle regions, and equipment contacts remain credible throughout the exercise catalog. The first release should use one internally consistent neutral adult reference body with moderate surface definition and readable hands and feet. Preserve an extension path for other body shapes without claiming that this first body is universal.

The recommended first deliverable is a reviewed body specification, a versioned mesh/rig/export contract, and three exported pilot exercises: squat, push-up, and shoulder press. The full migration follows only after the pilot demonstrates the complete production path.

### In scope

- Original body modeling and deformation-oriented topology.
- A coordinated control rig and a separate export deformation skeleton.
- Painted weights, twist distribution, and justified corrective shapes.
- Anatomical muscle identities, reviewed surface masks, and qualitative exercise roles.
- Versioned semantic joints, contacts, and equipment attachments.
- Reproducible export, retargeting, diagnostics, validation, and provenance.
- Gradual migration of all 100 exercises while retaining v1 fallback.

### Out of scope for the first v2 release

- A force, tissue, injury-risk, or clinical simulation.
- Measured muscle recruitment, EMG percentages, or activation inferred from animation.
- Photorealistic skin, facial performance, hair, or clothing simulation.
- A complete anatomical atlas or automatic patient-specific body fitting.
- Deep-muscle cutaway production before the surface character is proven.
- A new browser engine or exercise-specific runtime IK system.
- Automatic promotion of assets from `needs-review` to approved.

Anatomical plausibility, motion quality, source permissions, technical validity, and clinical claims require different evidence. None should be inferred from another. Existing technical previews are a regression baseline, not a clinical gold standard.

## Current implementation and migration constraints

The following repository components were inspected when preparing this plan. Historical milestone descriptions in their documentation must be read in context; the catalog now contains 100 technical previews.

| Verified existing component                                       | Responsibility                                                                                  | Implication for v2                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`build.py`](../../pipeline/character/build.py)                   | Procedural human surface, generated weights, skeleton, equipment integration, direct GLB export | Preserve it as v1 source; do not silently replace its outputs with Blender assets   |
| [`motions.py`](../../pipeline/character/motions.py)               | Quaternion math, forward kinematics, two-bone IK, motion-family dispatch                        | Introduce semantic mapping rather than copying numeric bone indices                 |
| [`preview.py`](../../pipeline/character/preview.py)               | CPU diagnostics from the procedural character and equipment transforms                          | Add a v2-aware exported-asset diagnostic path; do not reuse v1 geometry assumptions |
| [`export_blender.py`](../../pipeline/character/export_blender.py) | Optional import/save bridge                                                                     | Not an established production Blender authoring/export pipeline                     |
| [`Scene.tsx`](../../packages/react/src/Scene.tsx)                 | Generic GLB loading and animation playback                                                      | Retain this generic runtime boundary                                                |
| [`highlights.ts`](../../packages/react/src/highlights.ts)         | Metadata-driven region highlighting                                                             | Preserve/version the custom region-attribute contract                               |
| [`glb-qa.mjs`](../../scripts/glb-qa.mjs)                          | Exported geometry, motion, support, and equipment checks                                        | Extend through explicit rig/version adapters, not relaxed legacy rules              |

The preserved baseline has an 18-joint skeleton and an optional 20-joint variant that appends clavicle joints. Bone rest orientations, numeric indices, mesh names, contact markers, region codes, and some QA assumptions are coupled to that implementation. A prettier GLB with different joints is therefore not a safe drop-in replacement.

### Compatibility rules

1. Preserve all 100 exercise IDs, names, filter behavior, and documented movement semantics.
2. Preserve v1 source and generated bytes unless a separate explicitly authorized change says otherwise.
3. Retain runtime meters, right-handed coordinates, +Y up, +Z forward, and anatomical left/right. Record the Blender-to-glTF conversion explicitly.
4. Keep the exercise root in place; distinguish allowed pelvis motion from unintended locomotion.
5. Preserve clip duration, hold/repetition kind, and loop semantics unless a reviewed motion correction changes them.
6. Identify character, rig, region schema, source, and exporter versions independently.
7. Never select a v2 rig adapter merely because an asset has familiar joint names.
8. Keep a tested v1 fallback until each migrated family has passed its gates.

Existing conventions are documented in [skeleton v1](skeleton.md), [character selection](character-selection.md), and the [animation pipeline](../animation-pipeline.md). Their old Blender-environment statements are historical evidence, not a fresh installation check; the implementation phase must inventory the actual toolchain again.

## Roles and evidence ownership

| Role                       | Owns                                                                   | Must not imply                                             |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| Product owner              | Visual direction, intended audience, scope, final adoption             | That accepting a plan implements it                        |
| Character artist           | Proportions, silhouette, topology, surface detail, hand/foot shape     | Clinical correctness from artistic quality                 |
| Technical artist           | Rig, weights, twist behavior, corrective shapes, authoring controls    | Export equivalence from Blender appearance alone           |
| Developer                  | Semantic adapters, export automation, validation, viewer compatibility | Anatomical approval from passing tests                     |
| Anatomy-qualified reviewer | Landmark, joint-behavior, and muscle-label plausibility                | Patient-specific suitability or measured recruitment       |
| QA reviewer                | Reproducible evidence, negative fixtures, devices, regression coverage | That sampled checks establish continuous collision freedom |
| Asset approver             | Permission and visual approval for exact asset identities              | Approval of different regenerated bytes                    |

One person may fill multiple roles, but the evidence must still name the perspective, asset version, review date, observed limitations, and outcome. Clinical review is a separate requirement only if future product claims enter that domain. Automation can support modeling and verification; it cannot supply missing anatomical judgment.

## Reference body and anatomical landmarks

### Reference package

Create an original or permissioned reference package before detailed modeling. Include front, rear, side, and three-quarter views in a reproducible neutral pose. Record the source and redistribution terms of every scan, photograph, illustration, texture, or motion reference. Reading a public anatomy page does not grant permission to copy its images into CC0 assets.

Record stature, arm span, limb lengths, shoulder/pelvis width, rib-cage depth, hand/foot dimensions, and neutral alignment. Use a consistent individual/reference specification rather than combining unrelated idealized ratios. Do not enforce one head-count proportion, physique, or sex-specific shape as the universal body.

| Region          | Landmarks to establish                                                 | Review evidence                                       |
| --------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| Shoulder girdle | Clavicle ends, acromia, scapular spine and inferior angles             | Front/rear alignment and believable scapular position |
| Torso           | Sternum, rib-cage outline, spinal midline                              | Orthographic silhouette and trunk segmentation        |
| Pelvis          | Iliac crests, anterior/posterior pelvic landmarks, greater trochanters | Pelvic orientation and hip-center rationale           |
| Arms            | Elbow epicondyles, radial/ulnar wrist landmarks, knuckles              | Segment lengths and joint placement                   |
| Legs            | Patellae, tibial crests, malleoli                                      | Knee/ankle orientation and alignment                  |
| Hands/feet      | Palm surfaces, thumb base, heel, forefoot, toes                        | Grip and support landmark placement                   |

Maintain a landmark sheet with semantic name, side, rest-space position, reference basis, reviewer, and confidence/limitation note. A landmark is not automatically a joint center or a contact point; keep those concepts explicit. The [pectoral-girdle reference](https://openstax.org/books/anatomy-and-physiology-2e/pages/8-1-the-pectoral-girdle) provides anatomical context, not a ready-made rig specification.

### Reference acceptance

- [ ] Front, rear, and side views agree on proportions and joint locations.
- [ ] Segment lengths and coordinate conventions are recorded.
- [ ] There is no unexplained asymmetry or impossible rest alignment.
- [ ] The silhouette remains credible without lighting tricks or muscle textures.
- [ ] A reviewer can distinguish skeletal landmarks, rig joints, and contact landmarks.
- [ ] Every incorporated reference has documented permissions.

## Body structure and rig requirements

### Separate anatomy, controls, and deformation

An anatomical bone is a physical structure. An artist control is an authoring convenience. An export joint is a transformation used to deform or position an asset. They need not have a one-to-one relationship. A virtual spine joint may approximate distributed vertebral motion; additional twist joints may improve skin deformation without representing additional anatomical bones.

Choose the export skeleton from observed movement/deformation needs, not a target bone count. Document each joint's semantic role, rest transform, parent, permitted authoring behavior, and export status. Do not add joints solely to make the rig appear sophisticated.

### Pelvis, spine, and rib cage

Separate root placement, pelvic orientation, lumbar contribution, thoracic contribution, and chest orientation. Distribute flexion/extension, lateral bending, and rotation rather than making one waist joint do all work. Preserve coherent rib-cage and pelvic silhouettes while allowing the torso to move between them.

Test pelvic tilting, trunk rotation, side bend, cat-cow, deep squat, and floor transitions. Reject apparent torso stretching used to rescue an unreachable limb, a collapsing waist, or an unexplained discontinuity between pelvis and chest. The chosen segmentation is an animation approximation, not a claim to reproduce every vertebra.

### Shoulder complex

Represent clavicular and scapular participation in reaching, protraction/retraction, and overhead elevation separately from humeral motion. The sternoclavicular and acromioclavicular joints differ from the functional scapulothoracic interface. A chest-fixed upper-arm attachment is not enough for the intended quality; see the [anatomical discussion of the scapulothoracic interface](https://pmc.ncbi.nlm.nih.gov/articles/PMC6732935/).

Use explicit shoulder-girdle controls, reviewed coordination curves, and upper-arm twist helpers where necessary. Do not force every reach through a universal fixed 2:1 scapulohumeral ratio: primary research shows coordination varies during overhead reach. [Shoulder-coordination study](https://pmc.ncbi.nlm.nih.gov/articles/PMC2841046/)

Review front, side, and rear overhead reach, cross-body reach, push-up support, hanging, pressing, and external rotation. Reject arm-to-torso webbing, a crushed shoulder cap, a rigidly immobile scapular area, or corrective bulges that move the hand off its grip.

### Elbow, forearm, wrist, and hand

Keep elbow bending, humeral internal/external rotation, and forearm pronation/supination distinguishable. Distribute forearm twist instead of concentrating it at the wrist or one vertex ring. Provide stable bending planes and preserve elbow/forearm volume.

Provide wrist flexion/extension and radial/ulnar deviation, articulated finger chains, and thumb opposition. Finger controls must reflect the functional differences between finger joints and the thumb; do not treat every digit as an identical chain. The palm must remain a usable support surface rather than collapsing when the fingers curl. Movement terminology is grounded in [types of body movement](https://openstax.org/books/anatomy-and-physiology-2e/pages/9-5-types-of-body-movements).

Build reusable grip presets for dumbbells, barbells, hanging bars, band handles, and the wheel axle, plus a flat supported palm. Separate palm/finger/thumb contact patches. A hand-origin coincidence is not sufficient: inspect finger wrap, thumb placement, contact clearance, and wrist orientation under actual movement.

### Hip, knee, ankle, and foot

Distinguish hip flexion/extension, abduction/adduction, and femoral rotation from pelvic compensation. Preserve groin/gluteal contours during deep flexion and lateral motion. Use thigh twist helpers and corrective deformation only where required by demonstrated problems.

Treat the knee as a deliberately constrained approximation, not an unrestricted ball joint. Maintain plausible patellar surface behavior and volume through flexion, kneeling, and loaded support. Do not force all coupled behavior into a rigid hinge without reviewing the intended motions. [Selected synovial joints](https://openstax.org/books/anatomy-and-physiology-2e/pages/9-6-anatomy-of-selected-synovial-joints)

Separate ankle dorsiflexion/plantarflexion from hindfoot inversion/eversion where required. Add heel, forefoot, toe, and arch landmarks or controls rather than treating the foot as a rigid block. Test calf raises, squats, step-ups, push-up support, ankle rocks, and both band ankle directions.

### Neck and head

Distribute cervical motion and distinguish head nod, neck rotation, lateral flexion, and small authored retraction from trunk compensation. Chin tuck must not be represented by moving the whole body. Review neck contours from multiple views; avoid apparent neck dislocation or excessive local stretching.

No universal numerical anatomical range-of-motion limits are specified by this plan. Any such limits require a stated population, motion definition, source, and qualified review. Existing software contact tolerances are engineering rules, not medical limits.

### Isolated deformation test set

Before retargeting exercise clips, create neutral-to-extreme-to-neutral joint sweeps and combined stress poses. Cover shoulder elevation/rotation, cross-body reach, elbow flexion, forearm twist, wrist deviation, grip closure, spinal bending/twist, hip flexion/rotation, knee flexion, ankle/forefoot behavior, and cervical motion. Include loaded contact poses, not only unsupported character poses. Capture the exported GLB from the same cameras and lighting as v1.

## Muscle catalog and visualization contract

### Three distinct data layers

1. **Muscle identity:** an anatomical entity or explicitly named group.
2. **Render region:** a visible surface mask, separate muscle mesh, or other defined representation.
3. **Exercise involvement:** a reviewed qualitative role in a particular task or phase.

Do not infer one layer from another. One visible region may represent several muscles; a muscle may be partly exposed or have no honest normal-skin surface patch. A colored patch is not proof of force, contraction, or recruitment.

### Minimum semantic coverage

| Area           | Coverage to define and review                                                                                               | Representation caution                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Shoulder       | Anterior/middle/posterior deltoid; supraspinatus, infraspinatus, teres minor, subscapularis                                 | Rotator-cuff structures do not all have equivalent superficial visibility |
| Chest/back     | Pectoralis major subdivisions, latissimus dorsi, upper/middle/lower trapezius, rhomboids, serratus anterior                 | Distinguish anatomical subdivisions from convenient UI groups             |
| Upper arm      | Biceps brachii, brachialis, brachioradialis, triceps heads                                                                  | Do not make one generic arm stripe stand for all roles                    |
| Forearm        | Pronator/supinator and wrist/finger flexor/extensor groups                                                                  | Decide grouped versus individual coverage explicitly                      |
| Trunk          | Rectus abdominis, external/internal obliques, transversus abdominis, erector spinae, deeper stabilizing groups              | Deep layers must not be mislabeled as exposed skin                        |
| Hip            | Gluteus maximus/medius/minimus, iliopsoas and other reviewed hip-flexor groups, adductors                                   | Surface silhouette and deep anatomy are different representations         |
| Thigh          | Rectus femoris and vasti; semitendinosus, semimembranosus, biceps femoris long/short heads                                  | Preserve distinctions relevant to reviewed educational descriptions       |
| Lower leg/foot | Gastrocnemius, soleus, tibialis anterior/posterior, fibularis groups, long toe flexors/extensors; optional intrinsic groups | Avoid assigning hidden structures to a misleading front/back patch        |
| Neck           | Sternocleidomastoid, posterior groups, deep anterior flexors                                                                | Deep flexors are not an ordinary superficial neck stripe                  |

Use the [upper-limb](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs), [lower-limb](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-6-appendicular-muscles-of-the-pelvic-girdle-and-lower-limbs), [trunk](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-4-axial-muscles-of-the-abdominal-wall-and-thorax), and [neck/back](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-3-axial-muscles-of-the-head-neck-and-back) references as anatomical starting points. Layer assignments and final masks still require review; this table is a proposed coverage checklist, not an approved atlas.

### Proposed muscle record

Each record should carry a stable identifier, display name, side, parent group, depth/layer, reviewed anatomical actions, sources, review status, and representation type. Each mask mapping should identify its character/region version, corresponding muscle IDs, and known approximation. Bilateral semantics must be explicit even if a UI initially presents one grouped label.

Exercise involvement should support prime mover, synergist, and stabilizer roles, optionally phase-specific. Record the review basis instead of inventing percentages. Roles vary with posture, task, and load; animation alone cannot establish them. [Muscle interactions](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-1-interactions-of-skeletal-muscles-their-fascicle-arrangement-and-their-lever-systems)

### Visualization tiers

| Tier                            | First-release position      | Rules                                                                                                |
| ------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| A: external surface regions     | Required                    | Approximate external areas, clearly labeled; artist-authored masks follow anatomy                    |
| B: superficial muscle view      | Subsequent scoped increment | Authored muscle boundaries and reviewer-approved visibility, not rectangles on skin                  |
| C: deep-muscle educational view | Deferred                    | Explicit cutaway, isolated geometry, or diagram mode; never pretend normal skin exposes deep muscles |

Replace bounding-box region assignment for v2 with authored masks or vertex attributes. Preserve the existing custom attribute/version contract through an adapter; the current exported `_MUSCLE_REGION` is consumed by the renderer as `_muscle_region`. Do not reuse legacy codes with different meanings. Keep masks stable in bind space under deformation, exclude equipment, test left/right consistency, and restore neutral materials correctly when highlights are disabled.

### Muscle acceptance

- [ ] Every displayed label resolves to a reviewed semantic record.
- [ ] Surface boundaries are reviewed in neutral and deformed poses.
- [ ] Deep or partly exposed structures have an honest representation policy.
- [ ] Primary/secondary display precedence is deterministic and tested.
- [ ] Exercise filters use correct body-region and muscle metadata.
- [ ] Highlights do not imply activation measurement or clinical guidance.

## Mesh topology, skinning, and corrective deformation

### Modeling sequence

Begin with a low-detail blockout. Approve the silhouette and landmarks before adding definition. Then retopologize for shoulder/axilla, elbow, wrist, thumb base, groin/gluteal fold, knee, ankle, and neck bending. Spend geometry where it improves silhouette, contact, or deformation; do not use polygon count as a quality score.

Maintain clean normals and deliberate triangulation. Reject degenerate faces, invalid indices, accidental duplicate shells, holes that break intended continuity, and unexpected disconnected human pieces. Document any intentionally separate geometry, such as eyes or an optional educational layer, rather than allowing topology tests to accept arbitrary disconnected components.

### Weight-painting workflow

Automatic binding is a starting point only. Paint weights through the isolated motion suite, checking front/rear/side views after each joint family. Normalize influences and inspect anatomical neighborhoods. Ensure opposite limbs do not capture each other's vertices, hand motion does not pull the torso, and pelvic motion does not drag inappropriate arm surfaces.

Use the influence count supported by the chosen export/runtime contract and test it explicitly. Do not silently discard weights during export. Distribute twist through justified helpers; adding joints without repainting weights will not fix deformation.

### Corrective-shape policy

First correct proportions, topology, joint centers, and weights. Add pose-dependent shapes only for residual problems such as overhead shoulder collapse, deep elbow/hip/knee flexion, wrist bending, or thumb opposition. Maintain a small corrective catalog recording trigger, affected region, intended improvement, dependencies, and export test.

Correctives must not create grip drift, move a planted sole, change apparent limb length, or hide penetrating equipment. Validate combinations; individually good shapes can over-correct when blended. Do not assume Blender drivers survive GLB export. Bake or otherwise export the evaluated morph weights through a verified path.

### Visual rejection checklist

- [ ] No shoulder webbing, crushed shoulder cap, or torso tearing during elevation.
- [ ] No candy-wrapper forearm twist or collapsing elbow crease.
- [ ] No ballooning knee, severe groin collapse, or inverted gluteal contour.
- [ ] No floating mitten grip or anatomically implausible thumb wrap.
- [ ] No unstable muscle-mask boundaries or lighting that conceals defects.
- [ ] No corrective-induced contact drift or unexplained mesh stretching.

## Versioned asset architecture

### Proposed layout: not created by this plan

```text
assets/source/character-v2/
  character.blend
  reference-manifest.json

pipeline/character-v2/
  rig-map.json
  export.py
  validation-profiles.json
  export-settings.json

docs/architecture/
  character-v2.md
```

These names are proposed implementation artifacts. The present document is the plan, not evidence that those assets or tools exist. Choose generated-output locations only after reviewing the current registry and URL contracts; keep v1 and v2 paths distinct and avoid creating a second exercise identity for a character variant.

### Contracts to define before modeling is finalized

| Contract            | Required content                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Rig identity        | Version, semantic joints, hierarchy, rest pose/orientations, deform helpers              |
| Coordinate boundary | Blender units/axes, glTF conversion, anatomical left/right, root policy                  |
| Contacts            | Palm, finger, heel, sole, forefoot, knee, forearm, seated/back/head landmarks or patches |
| Equipment           | Attachment frames, grip offsets, support surfaces, cuffs, handles, wheels, anchors       |
| Animation           | Clip identity, duration, cycle/hold kind, interpolation, loop policy, morph channels     |
| Regions             | Stable codes, muscle mappings, representation depth, mask generation                     |
| Provenance          | Source hashes, tool versions/settings, generated hashes, permissions, approval state     |

Selection must validate compatible character/rig/region versions rather than infer them from filenames. Unsupported variants should fail honestly or use a documented v1 fallback, not render with the wrong adapter. Preserve generic viewer playback and keep authoring-specific logic out of runtime exercise branches.

## Blender authoring and export pipeline

### Authoring rig versus export rig

The artist rig may contain IK controls, constraints, drivers, grip presets, and convenience handles. The export skeleton should contain only the deformation and attachment transforms needed by the runtime. Bake evaluated motion and required morph animation. Exclude unused controls, actions, cameras, lights, and unrelated scene objects through an explicit export collection/manifest.

Pin the tested Blender version, exporter version, export settings, sampling policy, and source revision. This plan does not claim that a particular Blender release is installed or that the optional bridge has been executed. Establish that evidence during implementation.

### Export equivalence is a release requirement

glTF skinning uses linear blending. Blender's Preserve Volume mode uses quaternion-based deformation, so a pleasing Blender viewport pose is not sufficient proof of the browser result. Corrective shapes can help only if their evaluated animation is exported and played correctly. [glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html), [Blender Armature modifier](https://docs.blender.org/manual/en/latest/modeling/modifiers/deform/armature.html)

Perform a minimal export spike before relying on a corrective-driver architecture: one bent limb, one twist, one corrective, one clip, and one contact marker. Compare source evaluation with the GLB in Three.js. Verify action/shape-key export behavior against the pinned toolchain rather than assuming constraints or drivers are portable. [Blender glTF exporter](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html), [Three.js animation system](https://threejs.org/manual/pages/animation-system.html)

### Proposed production steps

1. Validate source version, reference permissions, and export collection.
2. Verify units, transforms, hierarchy, rest pose, and declared semantic joints.
3. Evaluate controls and bake deformation-joint/morph channels.
4. Export a self-contained GLB with named clip and compatible metadata.
5. Parse the actual exported geometry, skin, transforms, and animation independently.
6. Run topology, finiteness, contact, clearance, loop, and semantic tests.
7. Produce neutral/highlighted diagnostics from the exported asset.
8. Run the browser and physical-device proof appropriate to the release stage.
9. Record hashes, tool settings, review evidence, and exact asset identity.

Keep v1 CPU diagnostics intact. A v2 diagnostic path must consume the v2 exported mesh, weights, skeleton, morphs, and equipment; calling the old procedural surface while displaying a Blender asset would produce misleading evidence. Do not approve a `.blend` render as though it were a browser GLB screenshot.

Repeated exports must demonstrate the determinism actually supported by the toolchain. If bytes differ, identify whether geometry, channels, ordering, metadata, or environment causes the difference. Canonical-content comparison may supplement exact hashes, but never claim byte identity without observing it. Exact release hashes still identify what humans approved.

## Motion retargeting and equipment adaptation

### Retarget intent, not bone numbers

Create a semantic rest-space mapping between v1 and v2. A different joint orientation or parent hierarchy changes the meaning of local rotations. Transfer movement goals and timing, then re-solve contacts for the new segment lengths. Do not scale the entire character or stretch bones to make old endpoint coordinates appear reachable.

For each exercise, document the moving segments, intended stable supports, equipment contacts, motion phases, permitted compensations, and hold/repetition semantics. Preserve duration and loop policy unless a separately reviewed motion correction changes them.

### Per-exercise workflow

1. Resolve the source clip and compatible semantic mapping.
2. Transfer pelvis/trunk intent and limb trajectories into the new rest space.
3. Re-solve feet, palms, knees, forearms, and other declared supports.
4. Refit grip aperture, wrist orientation, finger wrap, and equipment offsets.
5. Refit bands/cuffs/handles to actual deformed skin, not joint centers.
6. Check all required phases and intermediate poses for penetration and drift.
7. Apply reviewed corrective deformation without breaking contacts.
8. Export and validate the independent GLB result.
9. Review muscle regions and body-region metadata for this actual movement.
10. Record evidence and retain the v1 fallback until family acceptance.

### Equipment-specific obligations

| Equipment/support | Required v2 proof                                                                  |
| ----------------- | ---------------------------------------------------------------------------------- |
| Dumbbells         | Finger/thumb wrap, actual grip patch, wrist orientation, body clearance            |
| Shared barbell    | Both fixed grips, shaft/head clearance, rack position, plate separation            |
| Bench/box/wall    | Actual skin-to-surface support, correct dimensions, no hidden hovering             |
| Landmine          | Fixed physical pivot, distal contact bounds, rotated load and shaft clearance      |
| Bands             | Endpoint attachment, finite skinning, stretch bounds, true anchor position         |
| Cuffs/handles     | Deformed-surface fit, independent hand contacts, inherited world transforms        |
| Hanging frame     | Bilateral palm/bar support and body clearance; ordinary ground rules unchanged     |
| Ab wheel          | Axle grips, planted support patches, tire/floor geometry, travel/rotation relation |

## Three-exercise vertical pilot

The pilot must exercise the entire source-to-browser path, not only display a neutral character.

| Exercise                | Structural/deformation focus                        | Contact and visualization focus                            |
| ----------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| Bodyweight squat        | Pelvis, hip, knee, ankle, groin and gluteal shape   | Sole/heel support, coherent lower-limb masks               |
| Push-up                 | Shoulder girdle, elbow, wrist, trunk shape          | Actual palm/finger support, equipment-free floor clearance |
| Dumbbell shoulder press | Overhead girdle/humerus coordination, forearm twist | Real bilateral grips, head clearance, shoulder/arm masks   |

Use consistent cameras, neutral lighting, timing, and framing for v1/v2 comparisons. Include front, rear, side, and close-up views where defects may hide. Do not declare success because one three-quarter camera looks attractive.

### Pilot gate

- [ ] Structural landmarks and proportions have review evidence.
- [ ] Isolated/combined deformation tests pass in exported GLB.
- [ ] The three motions are visibly improved without contact regression.
- [ ] Hands, feet, shoulders, and hips remain credible at intermediate poses.
- [ ] Muscle labels remain attached and honest about depth/approximation.
- [ ] Toolchain, source, settings, hashes, and permissions are recorded.
- [ ] v1 selection/fallback and existing viewer behavior remain intact.
- [ ] Desktop/mobile performance is measured on named configurations.
- [ ] Artist, anatomy, technical, and exact-asset review outcomes are separate.

If this gate fails, improve the body, rig, or export path before batch migration. Do not spread a failing skeleton across the catalog and plan to repair it afterward.

## Migration of the complete catalog

Use the registry's existing 100 IDs as the inventory. Reconcile every exercise to one migration row containing source/v2 asset IDs, family, contacts, special risks, QA result, visual/anatomy status, and fallback. A count of 100 alone cannot prove that all required identities or distinct motions are present.

| Family                | Representative stress cases                          | Main acceptance risks                                       |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Standing lower body   | Squat, lunge, hinge, calf raise, lateral transfer    | Hip/knee/foot deformation and support                       |
| Floor/quadruped       | Planks, bridge, bird dog, cat-cow                    | Palm/knee/forearm patches and trunk coordination            |
| Seated/supported      | Sit-to-stand, knee extension, bench movements        | Seat/back/head contacts and transitions                     |
| Upper-body loads      | Curls, raises, presses, external rotation            | Elbow isolation, twist, grips and shoulder shape            |
| Shared/anchored loads | Barbell and landmine movements                       | Two-hand constraints, rack shape and pivot invariants       |
| Bands                 | Hand loads, Pallof handle, limb cuffs, ankle actions | Endpoint semantics, stretch, fit, body-region labels        |
| Hanging/rolling       | Pull-up, dead hang, knee raise, wheel rollout        | Suspended support, skin clearance and no-slip approximation |
| Mobility              | Wall slide, cervical actions, hip rotation           | Genuine articulation rather than whole-body aliases         |

Migrate and accept one family at a time after the pilot. Every family requires actual exported diagnostics, positive/negative tests, browser switching, revised hashes, and explicit human outcomes. Keep source motion, retargeted motion, and generated delivery assets separate. Never rename an animation or mirror a side solely to satisfy a catalog count.

## Validation and evidence requirements

### Layered checks

| Layer            | Required evidence                                                           | Does not establish                                     |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| Structure        | Valid indexed topology, finite data, legal hierarchy, explicit versions     | Anatomical plausibility                                |
| Deformation      | Reviewed stress poses and exported GLB comparisons                          | Correct exercise instruction                           |
| Motion           | Distinct trajectories, declared phases, finite channels, loop/hold behavior | Measured biomechanics                                  |
| Physical contact | Actual skin/triangle contacts, equipment frames, penetration checks         | Continuous collision freedom or force transfer         |
| Semantics        | Correct IDs, body regions, muscles and qualitative roles                    | Measured recruitment                                   |
| Runtime          | Loading, controls, highlighting, recovery, cleanup                          | Physical-device coverage from emulation alone          |
| Human review     | Named reviewer, scope, exact hashes and limitations                         | Approval of regenerated or clinically different assets |

### Required negative fixtures

Corrupt exported assets deliberately: inject NaN/infinity into matrices or channels; remove a required joint; break hierarchy; change skin weights; degenerate a face; freeze a moving joint; move a contact marker; scale/reparent equipment; animate a supposedly fixed attachment; mislabel a region; and move a palm triangle outside its allowed contact exemption. Each fixture must fail for the intended reason.

Validate effective world transforms as well as local transforms. A scaled or translated parent can invalidate apparently correct mesh-local geometry. Keep contact exemptions spatially limited to their declared patch; do not exempt an entire limb from clearance. Check actual skinned surfaces because valid joint centers can hide hovering knees or penetrating cuffs.

### Existing baseline follow-ups

Before implementation, reconcile the latest recovery/review evidence and current code. Earlier review notes identified pad-animation invariants, contact-exemption bounds, standalone inherited transforms, finite band data, anchor world transforms, and lower-body metadata coverage. These are baseline follow-ups to triage, not assumed fixes or evidence that the new plan is already implemented. Assign each an owner and regression test; do not silently close it because a new character appears correct.

### Planned verification commands

The inspected repository pins Node through `.nvmrc` to `26.13.1` and pnpm through `package.json` to `10.15.0`. Recheck those files when implementation starts. The following are future implementation checks, not commands executed to create this documentation:

```bash
nvm use
python3 -m unittest discover -s pipeline/tests -v
pnpm assets:build
pnpm assets:preview
pnpm test
pnpm lint
pnpm typecheck
pnpm assets:qa
pnpm validate:preview
pnpm build
pnpm format:check
git diff --check
pnpm test:browser
pnpm validate:data
```

The existing asset-build/preview commands target the current pipeline. Implementation must extend or add documented v2 commands before claiming that this chain exports Blender sources. `assets:hashes` already exists for current generated review identities; hashes do not approve assets.

Run source-mutating normalization before freezing verification evidence. Repeat the relevant v2 exports and compare hashes/content as declared. Serialize browser proof after builds: rebuilding its served output concurrently can cause misleading missing-asset failures. Preserve logs and report failed, skipped, unavailable, or pending checks honestly. Strict data validation must continue rejecting unapproved assets until the appropriate human decision is recorded.

## Performance, accessibility, and browser acceptance

Measure v1 and the pilot on named desktop and physical mobile devices before setting budgets. Record GLB bytes, triangle/joint counts, draw calls, load/decode time, frame-time distribution, memory, and behavior after repeated switching. Select target devices, conditions, and acceptable limits explicitly; this plan does not invent a universally correct polygon or bone count.

Use neutral materials and only the texture detail that improves readability. Compare skinning/morph costs as well as geometry costs. Add levels of detail or compression only after measuring a need and validating masks, animation, compatibility, and decoding costs. Do not hide poorer motion quality with stronger lighting or lower test resolution.

Browser acceptance must include all 100 v2 clips, v1 fallback, play/pause/replay, timeline/speed/loop controls, camera reset, highlights, filters/search, keyboard operation, reduced motion, error recovery, self-hosted asset paths, disposal, and repeated exercise switching. Test both highlighted and neutral modes. Physical device/GPU behavior and long-running leaks need their own evidence; viewport emulation does not establish them.

## Work breakdown and delivery gates

All tasks below are planned and unchecked. Estimate effort after the reference body, export spike, and artist availability are known; no fixed calendar promise is justified yet. The critical path is reference approval → structural model → deformation/export proof → pilot → family migration.

| ID     | Work unit and deliverables                                                                    | Owner                                 | Dependency                   | Acceptance gate                                |
| ------ | --------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------- | ---------------------------------------------- |
| CV2-01 | Freeze v1 inventory, hashes, motion semantics, permissions, known follow-ups, device baseline | Developer + QA                        | Implementation authorization | Reproducible fallback and complete inventory   |
| CV2-02 | Reference package, measurements, landmarks, intended style and body specification             | Artist + anatomy reviewer             | CV2-01                       | Structural reference accepted                  |
| CV2-03 | Rig, coordinate, contact, version and region contracts; minimal export spike                  | Technical artist + developer          | CV2-02                       | Source-to-GLB assumptions demonstrated         |
| CV2-04 | Neutral blockout and deformation-oriented topology                                            | Artist                                | CV2-02/03                    | Multiview proportions/topology accepted        |
| CV2-05 | Control/export rigs, painted weights, twist distribution and corrective catalog               | Technical artist                      | CV2-04                       | Exported isolated/combined stress suite passes |
| CV2-06 | Muscle identity catalog, reviewed surface masks and role metadata policy                      | Anatomy reviewer + artist + developer | CV2-02/04                    | Honest, versioned semantic/render mappings     |
| CV2-07 | Automated bake/export, semantic adapters, diagnostics, provenance and negative fixtures       | Developer + technical artist          | CV2-03/05/06                 | Reproducible independently validated exports   |
| CV2-08 | Squat/push-up/shoulder-press vertical pilot with equipment refit                              | Full review team                      | CV2-07                       | Pilot checklist accepted                       |
| CV2-09 | Family-by-family 100-ID migration with fallback and evidence                                  | Artist + developer + QA               | CV2-08                       | Each family independently accepted             |
| CV2-10 | Physical-device/performance proof, exact-asset review, adoption and rollback rehearsal        | Product + QA + asset approver         | CV2-09                       | Final definition of done satisfied             |

### Per-unit recovery and review record

- [ ] Record authorized scope, owner, dependencies, and expected artifacts before work.
- [ ] Keep tests, behavior, documentation, and rollback boundary together.
- [ ] Record source/export settings and observed checks, not only a completion checkbox.
- [ ] Separate implementation completion from anatomical, visual, and release approval.
- [ ] Preserve completed/unrelated work if a later finding requires a scoped correction.
- [ ] Use the repository's effective review policy without inventing approval or enabling it automatically.
- [ ] Keep work reviewable through coherent units; never remove tests or compress code to fit a cosmetic line target.

Rollback should select the prior character version and restore its registry/provenance references, not rewrite or destroy the original source. Rehearse that path before changing the default character. Publication, remote transfer, and release remain separate explicit decisions.

## Risks and proposed decisions

### Risk register

| Risk                                            | Early signal                                          | Planned mitigation                                                  |
| ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| Better Blender viewport, worse browser skinning | Pilot GLB differs during twist/elevation              | Export spike and GLB-based gates before full modeling commitment    |
| New proportions break equipment reach           | Hands/feet drift or cuffs intersect                   | Semantic retargeting and contact/equipment refit                    |
| Anatomy detail becomes misleading               | Deep muscles painted as superficial patches           | Separate semantic catalog and representation tiers                  |
| Added complexity degrades mobile performance    | Frame/load/memory regression                          | Measured device budget and staged optimization                      |
| Unclear asset rights                            | Missing reference/source permissions                  | Provenance gate before incorporation                                |
| QA accepts malformed data                       | NaN, inherited transform, or exemption mutations pass | Independent world/finite/surface checks with negative fixtures      |
| Full migration hides a weak foundation          | Many clips need the same shoulder repair              | Stop at pilot gate and fix the shared cause                         |
| V1 compatibility is lost                        | Old clips require new indices or masks                | Explicit version adapters and frozen baseline comparison            |
| Effort is underestimated                        | Artist/anatomy/export capacity missing                | Resource review after reference/export spike; no premature schedule |

### Proposed defaults requiring review before implementation

| Decision          | Recommended default                                  | Reason / tradeoff                                             |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| Visual direction  | Neutral anatomy-informed adult, moderate definition  | Readable and achievable without photorealistic scope          |
| Runtime           | Existing React Three Fiber/Three.js and standard GLB | Avoid engine migration while improving the actual asset       |
| Authoring         | Original Blender mesh/rig with automated export      | More artistic control; requires skilled modeling and rigging  |
| First muscle mode | Surface regions plus semantic catalog                | Honest initial scope; detailed cutaways remain later work     |
| Skeleton size     | Determined by stress tests                           | Bone count is not an accuracy metric                          |
| Migration         | Three-clip pilot, then movement families             | Detect shared problems before multiplying them                |
| Body diversity    | One consistent reference body first                  | Keep a versioned extension path without universal-body claims |
| Clinical claims   | None in this release                                 | Requires a separate evidence and review program               |

Unresolved choices are not permission to choose silently during implementation. Record consequential departures from these defaults with their rationale, owner, evidence, affected gates, and rollback implications.

## Final definition of done

- [ ] The reference body, landmarks, and intended audience are documented and reviewed.
- [ ] The mesh is visibly improved in neutral and deformed multiview evidence.
- [ ] Joint coordination, hands, feet, twist, spine, pelvis, and neck satisfy the stress suite.
- [ ] Muscle identities, depth, regions, and exercise roles have reviewable mappings.
- [ ] Exported GLB, not only the source scene, passes technical and visual gates.
- [ ] All 100 original exercise identities have accepted v2 assets and distinct intended motion.
- [ ] Actual skin support and equipment contact/clearance are independently checked.
- [ ] All applicable positive and corrupted-export tests pass without relaxed legacy rules.
- [ ] v1 remains reproducible/selectable and rollback has been rehearsed.
- [ ] Source, toolchain, settings, permissions, hashes, and limitations are recorded.
- [ ] Desktop and physical-mobile performance meet explicitly agreed budgets.
- [ ] Viewer controls, search, filters, highlights, accessibility, and cleanup remain correct.
- [ ] Exact generated assets have appropriate human visual/anatomy outcomes.
- [ ] Remaining baseline follow-ups are resolved or explicitly tracked with truthful status.
- [ ] Release validation and release authorization are recorded separately from preview success.
- [ ] No clinical or activation claim exceeds the evidence actually obtained.

## Sources and reference limitations

Repository sources are linked near the verified implementation table. Anatomical references support terminology and planning constraints; they do not clinically validate a particular mesh or animation. Technical specifications describe format/tool behavior; the chosen Blender/exporter/runtime combination still requires a local production proof. No source text or illustration is copied into the planned character by this document.

| Source                                                                                                                                                                               | Intended use                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| [OpenStax: pectoral girdle](https://openstax.org/books/anatomy-and-physiology-2e/pages/8-1-the-pectoral-girdle)                                                                      | Structural landmarks and girdle context                |
| [OpenStax: body movements](https://openstax.org/books/anatomy-and-physiology-2e/pages/9-5-types-of-body-movements)                                                                   | Movement terminology                                   |
| [OpenStax: selected synovial joints](https://openstax.org/books/anatomy-and-physiology-2e/pages/9-6-anatomy-of-selected-synovial-joints)                                             | Joint structure and knee considerations                |
| [OpenStax: muscle interactions](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-1-interactions-of-skeletal-muscles-their-fascicle-arrangement-and-their-lever-systems) | Qualitative muscle-role distinctions                   |
| [OpenStax: neck and back](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-3-axial-muscles-of-the-head-neck-and-back)                                                   | Neck/back muscle reference                             |
| [OpenStax: trunk layers](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-4-axial-muscles-of-the-abdominal-wall-and-thorax)                                             | Trunk muscle layering                                  |
| [OpenStax: upper-limb muscles](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs)                                       | Shoulder/arm coverage                                  |
| [OpenStax: lower-limb muscles](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-6-appendicular-muscles-of-the-pelvic-girdle-and-lower-limbs)                            | Hip/leg coverage                                       |
| [Scapulothoracic anatomical discussion](https://pmc.ncbi.nlm.nih.gov/articles/PMC6732935/)                                                                                           | Functional articulation distinction                    |
| [Primary shoulder-coordination study](https://pmc.ncbi.nlm.nih.gov/articles/PMC2841046/)                                                                                             | Avoiding a universal fixed coordination ratio          |
| [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)                                                                                          | Skinning, transforms, animation and delivery contracts |
| [Blender Armature modifier](https://docs.blender.org/manual/en/latest/modeling/modifiers/deform/armature.html)                                                                       | Preserve Volume/export equivalence risk                |
| [Blender glTF exporter](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html)                                                                                           | Export/bake feature verification                       |
| [Three.js animation system](https://threejs.org/manual/pages/animation-system.html)                                                                                                  | Runtime skeletal/morph animation integration           |

The next implementation decision is whether to authorize CV2-01 through CV2-03: baseline, reference body, and export/rig contract. This document itself authorizes none of those changes.
