# Verified character-pipeline contract map

Derived from the implementation at adoption base `927e6fb`, inspected through CodeGraph and project engineering documents. Reinspect live implementation before changing it; this is not a replacement exporter or a new tolerance specification.

## Immutable inputs and identity

- `scripts/character-baseline.mjs` with `pipeline/character-v2/v1-baseline.json`: read-only preservation of original 100 IDs, 420 artifacts and 34 source inputs. Run `node scripts/character-baseline.mjs`; do not use capture/update to erase mismatches.
- `pipeline/character-v2/catalog_motion.py`: `input_contract`, `checked_file`, `verify_hashes`, `inventory`, `canonical`, and `frames`. Reject unsafe/symlink inputs; bind cache, neutral body, original native proof and source helpers by exact hash.
- `pipeline/character/motions.py` and `motion-profiles.json`: unique canonical motion registry, semantic names, Y-up/meters/+Z-forward, clip/kind consistency. A hold is not a repetition; compare catalog and source identities rather than guessing names.
- Original processed cache: `exercise-pilot/source.blend`; neutral: `exercise-pilot/character.glb`; native proof: `exercise-pilot/native-weight-proof.json`, all relative to `pipeline/character-v2/`. Read exact expected hashes from the adapter and manifest, not an arbitrary regenerated file.

## Lossless weights and export

- `pipeline/character-v2/pilot_motion.py::restore_export_weights`: exact native position mapping, unique semantic joint names, at most four positive native influences, Float32 slot restoration; inactive/non-skin bytes remain exact. This is an existing narrow export adapter, not general permission to patch GLBs.
- `pipeline/character-v2/build_exercise_pilot.py`: matrix/coordinate conversion, declared root and push-up contact corrections, slotted rig/morph actions, exporter and restoration helpers. Reuse only within current authority; do not call its main function during catalog migration.
- `pipeline/character-v2/build_catalog.py`: new isolated catalog variant and hash-bound source/adapter invocation; immutable processed-body reuse, independent marker action slots, explicit export selection and restoration. Current implementation supports the first batch, not unrestricted export of every inventory row.
- `pipeline/character-v2/groin_weights.py`: bounded derived collar only. Original native proof, not historically pruned exported GLB weights, supplies original tiny influences inside the authorized field. Keep exterior and support-boundary proof intact.

## Independent checks

| Scope                       | Existing command                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------- |
| Frozen v1                   | `node scripts/character-baseline.mjs`                                                 |
| Original three pilots       | `node scripts/character-v2-pilot-qa.mjs`                                              |
| Pilot negative fixtures     | `node --test scripts/character-v2-pilot-qa.test.mjs`                                  |
| First derived catalog batch | `node scripts/character-v2-catalog-qa.mjs`                                            |
| Catalog negative fixtures   | `node --test scripts/character-v2-catalog-qa.test.mjs`                                |
| Pure canonical adapter      | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest pipeline/tests/test_catalog_motion.py` |

Select checks that match the actual authorized change. Read CLI behavior first: a QA tool may publish reports or masks, so these commands are not a blanket read-only execution grant. Existing independent checks, not generic Blender profiles, decide engineering conformity. This skill adoption does not run authoring/export or rerun unrelated QA.

For the current body, independent GLTFLoader QA checks exact 26,939-position topology, 50 unique semantic joints, native proof and actual exported animation. The pilot/catalog checks sample 121 points across four seconds and all 78,222 rest edges of at least 1 mm; the whole-mesh elongation limit remains 6×. Keep these unchanged in this pipeline; future authorized topology changes need a new explicit contract, never a silent baseline refresh.

Contact tests are exercise/phase specific: calf forefoot support permits heel rise; lunges have different stance requirements; push-up palms/toes and rigid equipment grips require actual skinned-surface evidence. Old v1 vertex indices do not identify v2 contact surfaces. Derive limits from the appropriate existing validator/profile; never impose universal flat feet or generic ground-zero transforms.

## Review and rollout

Read `docs/architecture/character-v2-exercise-pilot.md`, `character-v2-catalog-migration.md`, `character-v2-pilot-engineering-review-2026-11-27.md` and `character-selection.md`. Earlier documents contain historical constraints; current explicit task authority governs scope without turning engineering results into anatomical acceptance.

Open actual exported-GLB reimport views at declared sample times; record absent temporal views/closeups. A static sheet is not a full-motion review. Preserve exact-hash human review, anatomy/clinical and physical-device limitations. The current ALL100 inventory tracks pending work: three original pilots plus three new standing candidates do not make 100 exported clips or authorize default rollout. Restore v1 selection if a later explicitly authorized rollout regresses; never overwrite v1 assets.
