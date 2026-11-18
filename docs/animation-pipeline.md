# Reproduce the original exercise previews

One editable canonical human, a preserved 18-joint rig plus an opt-in 20-joint upper-quarter rig, one weight generator and one deterministic GLB exporter produce the technical exercise catalog. Original geometry, motion and equipment are CC0; source code is MIT. These are technical review previews, not approved clinical movement demonstrations.

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

## Optional upper-quarter pilot

The original fifty assets retain the canonical 18-joint rig and surface labels v1.2.0 byte-for-byte. Four additional previews opt into `upper-quarter-v2`: standing dumbbell shoulder press, wrist curl, reverse wrist curl and supine serratus punch. Two appended clavicle joints preserve existing limb indices while providing explicit shoulder-girdle elevation/protraction. Hierarchical evaluation follows parents rather than numeric order. This simplified girdle is not an anatomically segmented scapula or a measured activation model; hands remain stylized mittens without individual fingers.

The exporter emits every explicitly authored translation channel, not only pelvis translation. CPU diagnostics use the same hierarchy and translation semantics. New clips use the additive surface definition v1.3.0 (approximate forearm and lateral-chest/serratus surfaces); old mappings remain unchanged. The renderer recognizes both sets of stable codes. QA requires the versioned clavicle hierarchy, wrist rotation, shoulder articulation and declared translation excursion, with negative fixtures that remove those channels. Global contact/ground tolerances remain unchanged. Forearm pronation is an authored whole-segment orientation, not a distributed anatomical twist rig.

These four clips, their thumbnails and their new exact hashes remain unapproved previews. Supine serratus punch uses no external load. Wrist previews keep elbows and wrist origins stationary while rotating the hands; they do not imitate biceps curls. Original artifacts must remain unchanged when regenerating the full catalog.

## Six additional dumbbell motions

Unit B adds a two-dumbbell bench pullover, bent-over reverse fly, lying and standing overhead triceps extensions, a one-dumbbell side bend, and side-lying dumbbell external rotation. Pullover uses a shoulder arc with constant elbow bend; triceps extensions keep the upper arms stationary while bending the elbows. External rotation twists the humerus around its long axis without moving the bent elbow; it is not a disguised elbow curl.

The original `flat-bench` prop is1.5meters long, distinct from the existing short seat. Its front edge stays behind the descending thighs, a raised head pad supports the back of the head, and exported QA samples both back and head skin patches against their actual physical faces. Profiles declare stationary supports, hand travel ranges, upper-arm rotation maxima and explicit loaded hand sides. The exporter, CPU renderer and QA agree on unilateral loads; no unused second dumbbell is attached. Opt-in dumbbell clearance QA verifies the actual twelve-sided equipment geometry and samples skinned non-grip vertices against its three convex volumes; only the intended loaded-hand grip patch is exempt. It caught a side-bend load/thigh collision that attachment-origin checks alone missed. Deliberate frozen-motion, moving-upper-arm, missing-bench, wrong-load and body-penetrating-grip fixtures must fail. This sampled surface check is not a complete self-collision or anatomical grip proof.

These six clips opt into region1.4.0, adding broad posterior-shoulder and lateral-trunk surfaces for rotator-cuff and oblique metadata. Earlier1.2.0/1.3.0 definitions and all54 prior assets remain unchanged. Surface labels are educational approximations, not deep-muscle segmentation or activation measurements. The external-rotation muscle classification is consistent with [AAOS shoulder conditioning guidance](https://www.orthoinfo.org/bodypart/shoulder/rotator-cuff-and-shoulder-conditioning-program/), which identifies the infraspinatus and teres minor; neither that reference nor the software checks clinically validates these animations. All new exact-hash assets remain needs-review.

## Shared rigid-bar capability

Eight additional previews use one original 1.5-meter bar with paired plates, not two renamed dumbbells. Both hands are solved against separate fixed grip points on that single independent scene load. Rack-specific declared grip spans keep the front-rack elbows forward rather than forcing them above the head; the markers cannot animate independently to fake contact. The optional hip pad is original reusable geometry with a matte surface. The exporter and CPU renderer evaluate the same equipment transform authoring function, including the moving bar and attached pad. Existing sixty assets and region definitions are preserved.

Back/front squats have different rack positions, trunk angles and depth. The conventional deadlift is a vertical floor pull with a moderate stance and toe/knee-out timing; good morning is a shallow-knee hip hinge; the row holds its hinge. Bench press uses the existing full-length bench/head support. Overhead press clears the head before moving the bar over the body. Hip thrust uses stationary upper-back bench support and a padded hip load. These are manually authored stylized motions, not measured biomechanics or clinical instruction.

Shared-bar QA checks all 121 authored poses: exact shaft/plate/pad vertices and triangle topology, invariant local grip markers, both real hand contacts, rigid meter scale, triangle-to-shaft clearance including the head, and declared rack/pad/floor contacts. A conservative shaft/pad envelope rejects penetration beyond 3 mm; source poses are adjusted rather than changing earlier tolerances. Plates are proven horizontally outside the entire skinned human extent for these fixed-span, level-bar profiles. This is not a general rotated-landmine or arbitrary-grip contract; anchored bars need their own anchor and grip evidence. Deliberate corrupted exports cover missing/independent grips, frozen equipment, malformed geometry/topology, a head entering the bar, floor penetration and missing/moved padding. Ordinary human support QA remains unchanged.

The clearance test uses actual skinned triangles rather than only vertices, because a thin shaft can cross a face without containing a vertex. It is still sampled engineering evidence, not continuous collision prevention, grip anatomy, force simulation or release approval. The remaining landmine/band/hanging capabilities are not implemented by this unit.

## Anchored landmine previews

`motion_landmine.py` authors a right-hand press and steady-hinge row around a fixed pivot in an original grounded anchor. The independently animated 1.8 m rigid shaft carries one plate proximal to the distal palm grip. CPU diagnostics and GLB animation use the same transform function. `landmine-qa.mjs` checks exact geometry/topology, per-frame anchor/pivot and marker invariants, actual skinned triangle clearance against rotated finite shaft/plate envelopes and actual load vertices above ground. Only the loaded palm patch can touch the distal shaft; the plate is never exempt. Positive and deliberately corrupted exports exercise these engineering constraints. No clinical validation or general self-collision proof is implied. Existing shared-bar pad follow-up remains separate.

## Deforming elastic-band previews

The first five band clips use a closed original tube with two independent endpoint joints and longitudinal weights. Standard GLTF skinning stretches its centerline while retaining its radius; no runtime-specific deformation code is required. Anchored clips attach to a real grounded post, while pull-apart joins the two actual palm markers. The CPU renderer evaluates the same endpoint transforms and skin equation. Row, forward chest press, two-hand horizontal pull-apart, high face pull and stationary-elbow humeral rotation have distinct joint goals. Existing seventy assets remain byte-identical.

Band QA independently checks exact tube geometry/topology, weights and inverse binds; per-sample endpoint attachment, local palm marker invariants, physical post location, unit transforms, declared rest-length/stretch range and actual skinned centerline. Triangle clearance includes the head/body and ground. Only the terminal10cm at a declared loaded palm is excluded for that palm's triangles; the remaining band stays checked. Corrupted exports must reject missing or frozen joints, endpoint drift, altered weights/binds/geometry, scale, anchor motion, over-stretch and skin penetration. Constant radius is a visualization simplification, not volume-conserving elasticity. These are sampled visualization constraints, not a material/force model, injury guidance or clinical validation. New exact hashes remain needs-review.

## Limb-attached bands and the 83-preview checkpoint

Eight further actions add internal rotation, a two-hand Pallof press, triceps pushdown, seated hamstring curl, terminal knee extension, hip adduction and the two ankle directions. Lower-limb endpoints bind to physical hollow shin/knee cuffs or a forefoot loop with a pull tab, never renamed hand markers. The forefoot tab places the band exit beyond the toe so a low forward anchor does not cut through the raised foot. Pallof press has a real independent handle with two separately checked palm contacts. CPU diagnostics and exported GLTF use the same attachment offsets and transforms.

New attachment QA checks exact strap/handle vertices and topology, declared bone parents and local offsets, actual skinned surface proximity and body penetration, two-hand contact, band travel and ground clearance. Cuff fitting uses the deformed human surface rather than joint centers: the current rigid visualization cuffs remain within the 25 mm surface-proximity tolerance and the 3 mm penetration bound. These tolerances are engineering approximations, not measured fit or a force-transmission model. Negative exports include missing/moved cuffs, hand substitutions, geometry/topology corruption, scale, invalid binds, displaced anchor roots and broken handle grips. The new limb contract explicitly rejects non-finite deformation inputs and requires independent anchor roots; previously recorded legacy-band review follow-ups remain separate.

Seated hand rests are kept low, hip adduction preserves constant hip-to-ankle reach rather than adding knee flexion, and ankle actions hold the ankle origin while rotating the forefoot oppositely. New clips alone use surface definition v1.5.0, adding broad medial-thigh/adductor and anterior-lower-leg/tibialis-anterior labels. All 75 previous assets and surface labels remain unchanged. Highlights are approximate surfaces, not deep-muscle segmentation, activation measurements or clinical validation. All new exact-hash assets remain needs-review.

## Final catalog: hanging, rolling and mobility

The final 17 clips complete 100 distinct original previews. Grounded high/low frames provide real bilateral hand contact for pull-up, inverted row, dead hang and hanging knee raise. Hanging profiles use an explicit physical grip/palm/shaft contract rather than relaxing the ordinary ground-contact threshold. Bench dip and pike push-up retain declared stable supports.

The ab wheel is an independently animated rigid wheel and axle with matching CPU/GLTF transforms. Exported QA checks both fixed palm grips, actual sampled geometry against the floor, unit root transforms and rotation equal to travel divided by radius; knees remain planted. A polygonal wheel approximates a circular tire, not tire deformation or force dynamics.

Wall-slide forearms remain parallel to the real wall and actual forearm skin must remain near its face. Cervical motions articulate neck/head rather than rocking the trunk, chin tuck exports an explicit small neck translation, and scapular retraction translates the optional girdle joints. Only the new cervical clips use surface definition 1.6 with a broad neck label; all prior asset bytes and region definitions are preserved. These are stylized educational motions, not anatomical segmentation, exercise prescriptions or clinical approval.
