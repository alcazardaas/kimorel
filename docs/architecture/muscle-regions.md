# Broad muscle surface regions

Kimorel uses thirteen versioned **educational surface labels**, not anatomical segmentation or measured muscle activation. The original 18-joint skeleton, mesh positions, skin weights and motion curves are unchanged by this extension.

## One definition, two consumers

`packages/schemas/src/muscle-regions.json` owns the stable region keys, numeric codes, labels, source-muscle aliases and ordered bind-pose bounds. TypeScript derives the `MuscleRegion` key union directly from that JSON; the Python generator reads the same file. Do not maintain a second region table.

The regions are chest, deltoids, biceps, triceps, upper-back, latissimus-dorsi, abdominals, spinal-erectors, glutes, quadriceps, hamstrings, calves and lateral-hip. Existing exercise taxonomy aliases such as `pectoralis-major`, `erector-spinae` and `gluteus-maximus` map through each region's `muscles` array. Forearms, adductors, hands, face and other unmapped areas remain neutral. Missing mappings do not imply that a muscle is inactive.

## Mesh contract

Each canonical skin exports a scalar unsigned-short `_MUSCLE_REGION` per vertex. Zero means deliberately unassigned. The mesh's `extras.kimorelMuscleRegions` contains definition version and ID/code pairs. Three's GLTFLoader preserves this as `_muscle_region` and `userData`; QA rejects missing, unknown or mismatched codes and checks all thirteen regions have vertices. All thirteen clips use the same mapping.

Regions are assigned once in meter-based Y-up, +Z-forward rest space. Color follows the same indexed vertices and skinning as the mesh, so it does not slide over the surface during motion. No texture, second character, shader patch or per-exercise rendering branch is required. Export overhead is about 16.8 KB per human GLB.

## Viewer behavior

`<ExerciseViewer exercise="push-up" showMuscles review />` enables highlighting and review controls. Metadata supplies primary and secondary muscle arrays. Primary regions use strong coral; secondary regions use paler amber; primary wins if both refer to one region. These colors are categorical emphasis, **not activation percentages**.

The loaded scene is exclusively owned by one viewer. Its color buffer is reused on toggles; original material color/vertex-color state is restored when highlights are disabled. Equipment without the mapping is untouched. Normal scene cleanup disposes color geometry/material resources. Turning highlighting on does not reload or restart animation.

## Tradeoffs and remaining review

Ordered geometric bounds are deterministic and inexpensive, but labels are broad and boundaries can cross triangles, especially at shoulders/hips. This stylized mesh has no anatomical muscle topology. A human must inspect neutral and highlighted poses from front, side and back. Region boundaries are not clinical anatomy and must not be described as an activation simulation. Better future boundaries can reuse the contract through reviewed vertex masks without changing stable IDs or skeleton names.

Changing labels/export bytes invalidates any existing hash-bound approval. Current assets remain `needs-review`.

## Lateral-hip extension (version 1.1.0)

Code 13 adds an approximate lateral-hip surface for the existing hip-abductors taxonomy; it is not an alias for gluteus-maximus and does not isolate individual gluteal muscles. It precedes overlapping gluteal bounds in deterministic assignment order. This supports side-lying hip-abduction previews without fabricating precise anatomy. Every canonical human export is regenerated with the same labels; original positions, normals, indices, bones, weights and original three animation tracks are preserved. Region labels/extras and exact SHA identities intentionally change; previous hashes cannot authorize these bytes. All assets remain needs-review.
