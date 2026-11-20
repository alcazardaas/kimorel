# Localized, baked corrective-shape proposal

This separate engineering candidate adds shoulder/hip corrective morph targets to the frozen connected draft. Targets are automated posed-surface proposals, **not** artist-approved anatomy, general-purpose correctives or production acceptance. The application still uses v1.

## Review path

1. Inspect `pipeline/character-v2/correctives/corrective-ablation-sheet.png`: shoulders in the first row, hips in the second; columns are frozen baseline, new morph OFF, new morph ON. Camera, light and bone pose are identical within each row.
2. Inspect `context-sheet.png` for neutral and whole-body context. Every image is rendered after importing the actual exported GLB.
3. Open `source.blend` to inspect editable shape keys and `review-mask-*` vertex groups. `manifest.json` records parameters, toolchain, input/source hashes and original-project CC0 provenance with needs-review status.
4. Read `qa-report.json` for actual Three.js morph-plus-skin playback, baseline ablation and local surface metrics.

## Method and boundary

| Stage          | Engineering choice                                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input          | Read the frozen `deformation/source.blend`; never overwrite previous outputs or source                                                                                                                            |
| Neutral        | Keep the existing neutral coordinates, topology, joint centers, weights, separated digits and connected wrists                                                                                                    |
| Support        | Compact spherical masks around semantic left/right upper-arm or thigh joint centers; shoulder radius 0.21 m, hip radius 0.20 m                                                                                    |
| Posed proposal | Masked Jacobi neighbor relaxation at the known stress peak, 32 iterations at step 0.65, maximum 0.028 m posed travel                                                                                              |
| Rest delta     | Invert each vertex's blended **linear** skin matrix; do not inverse-transform a displacement as a translated point; cap rest delta at 0.055 m and reject near-singular matrices                                   |
| Activation     | Smooth engineering angle curves, shoulder onset/peak 25°/65°, hip 20°/55°; no claim of medical range-of-motion                                                                                                    |
| Export         | Bake morph weights every source frame into shared rig/shape-key action slots alongside unchanged bone channels, with explicit stashed shape-key NLA associations for exporter discovery; no runtime drivers or IK |

The helper keeps remote vertices exactly fixed, tapers the patch boundary and limits displacement. Parameters are reviewable constants in `corrective_geometry.py`; editable masks and keys remain in the source file. These choices smooth selected sharp posed artifacts, not a muscle model or anatomically derived tissue simulation. No wrist correction is included.

The [Blender glTF animation documentation](https://docs.blender.org/manual/en/5.0/addons/import_export/scene_gltf2.html) describes shape-key animation and action-slot merging. Shared action slots/high-level insertion follow the [primary Blender 5.2.3 API examples](https://github.com/blender/blender/blob/v5.2.3/doc/python_api/rst/info_quickstart.rst). Actual generation is pinned to the separately approved official Blender 5.2.4 LTS binary; only real export/import/playback establishes support here.

## Observed engineering result

The exported GLB has two real corrective targets and seven existing bone clips. Shoulder and hip clips include baked morph-weight channels; their peak influences are approximately one. Actual Three.js ablation moves local skin by approximately 28 mm, while morph OFF matches the frozen connected draft exactly. Neutral coordinates, 18 legacy centers, 50 joints, 53,086 triangles, separated digits and the single closed surface remain preserved.

| Local diagnostic       | Shoulder before → after | Hip before → after |
| ---------------------- | ----------------------- | ------------------ |
| Mean neighbor residual | 3.558 → 0.504 mm        | 5.671 → 1.309 mm   |
| Residual reduction     | 85.84%                  | 76.92%             |
| Normal-turn P95        | 27.06° → 9.35°          | 25.61° → 15.19°    |

This visibly softens the selected sharp point/fold, **not** all underarm webbing or hip folds. Smoothing redistributes local edge lengths substantially (hip P95 length ratio 2.59, maximum 12.83 versus an already compressed posed baseline). These are proposed shapes requiring artist assessment, not evidence of production deformation quality.

The first export contained targets but omitted shoulder/hip morph-weight tracks; its images were **not valid correction evidence**. Inspection of the installed official exporter showed that non-active shape-key actions need explicit NLA associations. The corrected export and independent playback—not the source viewport or target existence—establish the result above.

## Proof interpretation

Independent QA reuses the previous read-only connected-draft validator for finite skin data, closed manifold/digit topology, 50 joints, 18 preserved legacy centers, triangle budget, seven stress loops and non-target skin stability. Additional checks cover:

- Finite raw morph position/normal deltas and baked morph-weight accessors, including sparse accessors.
- Real Three.js animation of morph influences **and** skinning; missing/frozen tracks are failures.
- Exact neutral-coordinate correspondence and morph-OFF equality to the frozen bone-skinned baseline, within declared floating-point tolerances.
- Bounded support and actual posed skin change in the intended shoulder/hip regions, with no remote hand/leg/torso corrections.
- Local neighbor-residual and triangle-normal-turn comparisons at the same exported stress pose, plus neutral return.
- Both neutral endpoints compared against morph OFF **and** the frozen baseline, so equal nonzero endpoint corrections cannot pass.
- Every weight key, linear segment interior and cubic Hermite component extrema sampled across all clips; unrelated target activation rejected away from the midpoint too. Temporary morph-OFF samples restore animated weights to avoid contaminating subsequent plateau samples.

The authored 28 mm posed cap and existing 28.1 mm check apply at the sampled peak pose, not uniformly across interpolation. Whole-playback displacement uses the independently measured rest-delta envelope: nonnegative normalized weights and actual orthonormal skin/bind/world matrices are verified before applying the convex rigid-blend norm bound. Interior maxima are reported separately; they are not hidden by increasing the peak tolerance. The frozen shoulder asset reaches approximately 28.112 mm at an interior sample. Its independently checked rest-delta envelope is approximately 33.197 mm. The committed `qa-report.json` remains the prior unit's historical midpoint receipt; run the QA CLI without redirecting over that file for current extended playback diagnostics.

Neighbor residual is the distance from a vertex to its adjacent-vertex mean. Normal turn is the angle between adjacent triangle normals. These are same-topology artifact diagnostics, **not** anatomical quality, cross-section volume, no-collapse or clinical proof. Natural joint folds are not inherently defects; visual review must judge whether the proposed change actually helps.

Negative fixtures exercise missing/frozen morph channels, NaN deltas/weights, remote-region edits, corrupted reference joints and failed morph loops. The morph-OFF ablation matters: simply containing morph targets is insufficient evidence of value.

## Reproduce

Use the parent-approved native execution route; the sandbox background binary previously crashed before Python. Do not install another binary or bypass permissions.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python pipeline/character-v2/build_correctives.py
node scripts/character-v2-correctives-qa.mjs > pipeline/character-v2/correctives/qa-report.json
pnpm exec prettier --write pipeline/character-v2/correctives/manifest.json pipeline/character-v2/correctives/qa-report.json
node --test scripts/character-v2-correctives-qa.test.mjs
python3 -m unittest discover -s pipeline/tests -v
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
pnpm character:check
pnpm validate:preview
git diff --check
```

Two unchanged-source generator runs produced byte-identical GLB and both assembled sheets. Editable `.blend` and nine individual PNG byte hashes varied; no blanket binary-determinism claim is made. All 13 latest binary artifact hashes match the manifest. Normalize generated JSON receipts as shown above before the check-only formatting gate.

## Still pending

Artist/anatomy review, painted production weights and corrective sculpting, arbitrary pose combinations, self-collision/contact, physical-device budgets, muscle maps, the three-exercise pilot and 100-motion v2 migration remain pending. No approval is inferred from engineering diagnostics.

Rollback removes only `build_correctives.py`, `corrective_geometry.py`, their new Python/Node tests and QA script, this document and `correctives/` outputs. Existing v1, prototype, deformation artifacts/source and default behavior remain unchanged.
