# Experimental three-exercise v2 pilot

This separate export unit retargets the original `bodyweight-squat`, `push-up` and `dumbbell-shoulder-press` motions onto a fresh stabilized v2 body. It does not replace any of the 100 v1 assets, edit the exercise registry or approve anatomy. The opt-in exercise viewer is a later integration unit.

## Current gate

**Verified export unit: production engineering, canonical repeat and full checks pass.** All three actual exports pass all 121 sampled frames, the unchanged 6× whole-mesh limit, canonical joints, pose-derived morphs, physical contacts, grip and loop checks. The independent exported skin gradient is **24.000056/m**, below the unchanged 24.01/m Float32 gate. Thirteen focused positive/negative fixtures pass.

| Exercise                | Maximum edge ratio | Neutral → posed worst edge |
| ----------------------- | ------------------ | -------------------------- |
| Bodyweight squat        | 4.616387×          | 7.264 → 33.532 mm          |
| Push-up                 | 4.851956×          | 7.264 → 35.243 mm          |
| Dumbbell shoulder press | 5.959737×          | 4.797 → 28.586 mm          |

Independent native-weight provenance verifies 11,038 exported active vertices covering 10,644 unique native vertices. The exact 4,166 changed native digit-bearing indices map to 4,560 exported indices through seam duplication; 3,687 distal digit vertices retain their original weights exactly. Press distal skin travel is 0.422 m. Twelve new draft mask payloads and three exercise-specific catalogs were transactionally published only after actual acceptance, with exact domains, hashes and unchanged seed sparse weights verified.

Parent visual readback of all three restored comparison sheets passes engineering framing/spike checks. This is **not anatomy, clinical or physical-device acceptance**. Draft review statuses remain pending; the v1 registry and default viewer are unchanged. Opt-in viewer integration is a separate next unit. One complete normal same-source repeat passed the canonical geometry, animation, comparison-sheet and mask-binding checks; full tests, lint, typechecking, build, formatting, character validation and preview validation also pass.

## Historical failed candidates (superseded)

The following records preserve earlier rejected snapshots, not the current production engineering result.

**Earlier partial candidate: not accepted at that time.** Actual native exports and matched v1/v2 comparison sheets exist. Parent visual readback confirms the severe underarm curtains are absent after the single causal weighting correction, but the unchanged whole-mesh 6× deformation gate fails all three exercises:

| Exercise                | Maximum edge ratio | Neutral → posed edge | Worst neutral region             |
| ----------------------- | ------------------ | -------------------- | -------------------------------- |
| Bodyweight squat        | 6.935×             | 5.006 → 34.720 mm    | Inner shoulder collar, Y 1.228 m |
| Push-up                 | 6.512×             | 5.006 → 32.601 mm    | Inner shoulder collar, Y 1.228 m |
| Dumbbell shoulder press | 10.429×            | 2.492 → 25.989 mm    | Shoulder, Y 1.429 m              |

These are distinct from the rejected first export's 40×, 401 mm underarm curtain. They still FAIL the declared acceptance bound. No tolerance was increased; the subsequently authorized hip/elbow causal correction was applied once, no mask bundle was published and no repeatability acceptance was performed. The generated manifest's `experimental-pilot-needs-review` and `humanApproval: false` describe an unaccepted candidate, not success. The next decision is whether to authorize additional body topology/skin-deformation work before pilot acceptance. The exercise registry and default viewer remain unchanged.

### Verified causal correction, remaining failure

The originally failing hip edge improves from 8.893× to **2.970×** maximum across all 121 samples. The original elbow edges improve from 6.515× to **1.046×** (push-up) and 10.936× to **1.094×** (press). These improvements do not exempt the newly exposed worst edges in the table above.

The new hip target projects displacement differences to at most 2 m/m across neutral edges ≥1 mm, editing only its original nonzero support plus two mesh rings and keeping a fixed zero exterior. It retains **93.19% of original squared-displacement energy**, with 3,819 support vertices; pose-derived activation is unchanged. The preceding elbow-only candidate modified 1,838 vertices using continuous same-side upper-arm/forearm/hand segment distances, with a smooth original-weight collar, safe four-slot sparsification and exact digit exclusion. Canonical pose curves, props and contact corrections are unchanged. The prepared source now supersedes that elbow-only path with the coherent whole-arm revision below; actual export proof is still required.

## Motion and coordinate contract

The original authoring functions use meters, +Y up, +Z forward and identity rest bone orientations. The v2 Blender armature uses nonidentity local rest orientations and different clavicle pivot locations. The new generator evaluates the canonical semantic **world** transforms, composes each with the v2 rest orientation and derives the actual parent-local basis. It never copies node indices or raw v1 local quaternion curves into the v2 rig.

For canonical upper-quarter motion, the shoulder center retains its source world trajectory even though the v2 clavicle head is medial to the legacy pivot. Added digit chains inherit the retargeted hand; the press applies the original draft hand-closure proposal, while squat and push-up retain open digits. A draft closed pose is not proof of a real grip: actual skin-to-handle measurements remain mandatory.

Each exported exercise must contain a true four-second `rep`, 121 authored samples at 30 Hz and no stress-clip alias. Shoulder and hip morph influences are baked from the actual relative humeral/thigh orientation in each retargeted pose. These engineering angle envelopes are not measured muscle activation, individualized technique or clinical range-of-motion rules. Combined-pose corrective shapes still require qualified review.

The prepared whole-arm revision replaces both stitched shoulder/elbow weight writers with one compact C2 semantic partition: chest, clavicle, upper arm, forearm and hand. Segment radii are 0.13/0.17/0.13/0.13 m, with a 0.28 m trunk support; separated clavicle/forearm supports keep at most three arm influences plus chest. Original trunk weights transition before arm mass begins. Distal digits and the zero-support exterior remain exact. The approved proximal-palm exception below removes the remaining wrist/grip discontinuity.

Deterministically ordered, bounded convex projections constrain the entire semantic arm/collar field to **24 L1 weight/m**, with a 0.0024 construction residual allowance and 0.01 exported Float32 allowance. The initially proposed 20/m bound was explicitly changed after immutable digit endpoints proved a minimum 21.897/m requirement along their 45.325 mm mesh path. This changes an engineering construction target, **not the unchanged 6× posed-edge acceptance gate**. Preflight measured 24.0000024/m over 6,478 support vertices; native export acceptance remains to be verified. The shoulder corrective is rebuilt under this field and gradient-regularized while retaining nonzero energy. The hip and sole fixes remain intact. Historical sources, generated variants and masks are not rewritten.

## Contact and equipment gates

| Exercise                | Required exported proof                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Bodyweight squat        | Canonical pelvis/leg motion, planted sole/heel surfaces and loop closure                                                      |
| Push-up                 | Canonical trunk/elbow motion, stationary semantic wrist/ankle targets, actual palm/finger/toe floor support and clearance     |
| Dumbbell shoulder press | Coordinated clavicle/upper-arm motion, two rigid canonical-dimension dumbbells, actual hand/handle contact and head clearance |

Canonical dumbbells are original project geometry; their handle axis is local X, radius 16 mm and their grip offsets are the original hand-space values. Comparing joints alone cannot prove the new hand surfaces meet these handles. Contact thresholds are explicit engineering acceptance criteria, not anatomical measurements. Any root/IK correction must be documented with its measured reason and resulting canonical trajectory difference, not hidden by relaxed tolerances.

### Declared bounded contact corrections

The first exported diagnostics measured a neutral sole at Y = 8.360867 mm, squat sole drift of approximately 20 mm and push-up foot penetration of approximately 42 mm under inherited calf influences. The new body alone blends original skin weights toward each semantic foot below Y = 0.25 m, with full foot ownership below Y = 0.13 m. The original neutral vertex positions remain exact; only this local skin field changes. Every exercise receives the same negative neutral-sole root datum, including equipment and expected trajectory references.

The measured push-up palm height reached 19.1182 mm before this root datum. A declared 11 mm downward wrist-target correction uses the original two-bone IK solver and preserves segment lengths. The contract retains every original canonical pose plus only the six adjusted arm joints; QA reports raw canonical differences separately from error against the declared adjusted reference. The floor tolerance stays ±8 mm with less than 8 mm drift: these corrections do not relax it. Actual corrected contact export diagnostics pass: sole drift below 0.001 mm, push-up palms between −3.26 and −0.077 mm with 3.18 mm maximum drift, handle gap below 0.0014 mm and head clearance 164.99 mm. These contact results alone did not accept the first pilot: severe outer-collar deformation was detected visually and is being corrected.

### Whole-mesh deformation sanity

All 78,222 unique neutral edges of at least 1 mm are measured in actual skinned geometry at every one of the 121 exercise samples, including the outer collar missed by the historical patch-only metric. Maximum posed/rest edge elongation must stay at or below 6×, an explicit engineering spike detector rather than anatomical acceptance. QA records the worst vertices, neutral location, time and lengths. A deliberately reintroduced adjacent chest/arm ownership annulus must fail this gate. Exact remote skin weights outside the shoulder and foot support regions are also compared with the frozen body. Qualified visual/anatomy review remains necessary even when this numerical bound passes.

## Reproduce

Only the parent/user-approved native Blender route may generate this bundle. No downloads, new binary or permission bypass is part of this unit.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python pipeline/character-v2/build_exercise_pilot.py
node scripts/character-v2-pilot-qa.mjs
node --test scripts/character-v2-pilot-qa.test.mjs
python3 -m unittest discover -s pipeline/tests -v
```

The explicitly rejected first pilot can be regenerated once with `-- --rebuild-failed-pilot`, bound to that failed manifest identity. This is not an overwrite route for historical variants.

Generation exclusively targets the new `pipeline/character-v2/exercise-pilot/` variant and refuses to replace a completed manifest unless explicitly invoked with `-- --repeat` and matching generator/helper hashes. Exported GLBs are imported again for matched v1/v2 front, side and three-quarter comparison sheets; final visual review must include the floor/grip regions, not only an attractive camera. Exact neutral positions, index order and vertex domain must be established before any mask coverage can be rebound to new asset hashes. Old pending mask contours and review status do not become approved by reuse.

## Limits and rollback

Existing neutral underarm webbing, automatic topology and uncertain anatomical surface boundaries remain visible. Independent engineering proof is separate from artist/anatomy approval, exact-asset human review and physical-device performance. No public API, default viewer, v1 fallback selection or migration of the remaining catalog is implemented by this export unit.

Rollback removes the new pilot generator/helper/tests/QA/document and isolated pilot outputs plus the bounded joint-order correction. No legacy source or previous generated body/mask is removed. If contact or pose proof fails, retain the diagnostic result as partial and do not promote the pilot or start batch migration.

## Proximal palm correction (implemented and verified)

The recovered actual whole-arm candidate passed squat (4.616387×) and push-up (4.851956×) across all 121 frames. Press failed the unchanged 6× gate at 7.432844× on vertices 7260/7324. Both vertices retained their frozen digit-bearing weights; morph removal did not change the failure. An identical-weight diagnostic reduced their posed edge from 9.740138 mm to 1.211087 mm, identifying skin-weight discontinuity rather than joint motion.

The new-pilot-only exception uses a smooth compact bind-space collar: Y rises from zero at 0.89 m to full at 0.925 m, remains full through 0.99 m, then falls to zero at 1.02 m; absolute X ramps 0.36–0.40 m and falls 0.50–0.54 m; absolute Z falls 0.07–0.11 m. Only original digit-bearing vertices inside this collar become eligible. Initial four-slot sparse blending retains hand/digit proportions, the existing 24/m semantic projection remains unchanged, and reconstruction distributes projected hand mass through those proportions. Full proximal support removes unrelated digit-base contamination; distal support remains exactly zero. The contract records every changed digit-bearing index and the preserved distal count. No grip keys, canonical joints, geometry, hip target, sole correction or historical asset changes are authorized.

Pure boundary tests passed before native execution. Production regeneration, exact changed-index readback, distal travel/contact proof, negative fixtures, all-three 121-frame acceptance, mask binding and the normal same-source repeat have now passed, as recorded in the current gate and repeat sections.

### Construction convergence (not posed acceptance)

The first proximal-palm native build stopped before export at 24.145208/m after 2,048 sweeps. A read-only actual frozen-GLB diagnostic reached 24.004357/m after 4,096 sweeps. Parent approved one bounded increase to 8,192 sweeps, without changing the 24/m bound or 0.0024 final residual allowance. The corrected full-field diagnostic passed at 24.000003928/m in 421.59 seconds, using the entire cap (strict early termination was not reached). All reconstructed named weights are normalized with at most four influences. It changed 4,560 original digit-bearing vertices inside the compact collar and preserved 3,687 zero-support digit vertices exactly. These are seam-expanded frozen-GLB indices; regenerated native contract indices require separate readback. Actual posed exercise acceptance remains pending.

Partial-support regression also prevents digit weights being classified both as hand mass and trunk mass during reconstruction. Numeric digit names belong only to the hand partition; otherwise later chest reconstruction would overwrite them.

### Faithful skin export (implemented and verified)

The exported 24.042774/m failure is **not** a missing triangulation constraint. Exact coordinates map the failing exported edge to an existing native edge, whose stored Float32 gradient is 24.000013/m. Blender 5.2.4 drops bone influences ≤0.0001; dropping the native ring influence 0.000083143510 and renormalizing reproduces the exported failure.

The new-pilot exporter therefore restores only approved active-field `JOINTS_0`/`WEIGHTS_0` slots from actual native named weights, using exact bind-coordinate mapping and semantic skin-joint mapping. Missing or ambiguous mappings, invalid sparse weights, unsupported accessor layouts and overlapping buffers fail closed. All geometry, topology, animations, morphs, props and inactive/distal raw bytes remain untouched. Tiny positive weights are retained; the Blender installation is not patched and no gate changes.

A generated `native-weight-proof.json` is bound to the actual saved source blend and generator/helper hashes. Independent QA maps every exported vertex back to this proof and compares active native named weights against actual neutral and exercise skin accessors. A negative fixture repeats exporter-style tiny-weight pruning and must be rejected. This supplements, rather than replaces, the unchanged exported adjacency, all-121-frame deformation, canonical motion, corrective and physical-contact checks.

An explicit one-shot `--restore-export-weights` mode verifies the exact failed manifest, retarget contract and all recorded failed source/GLB/image hashes before loading the failed native blend, restoring its exports, rerendering and rehashing. It avoids repeating the expensive unchanged construction solve. The normal generator applies the same restoration immediately after every export. The required complete normal same-source repeat passed after actual acceptance; recovery mode alone was not treated as repeatability proof.

## Normal same-source repeat result

The parent executed the full normal generator once after guarded recovery. All four GLBs, all three composed comparison sheets, all fifteen mask/catalog files and the three generator/helper source hashes are byte-identical. Eighteen individual render PNG file hashes differ because Blender embeds runtime/date/render metadata; independently decoded pixels match the unchanged comparison-sheet tiles exactly (maximum channel difference zero for all eighteen views). This is pixel repeatability, not a claim of twenty-five byte-identical render/asset files.

The saved blend binary and provenance hashes change between recovery and normal generation. Native weight proof records are identical; only its source-blend hash changes. Removing the native-proof reference from the repeated retarget contract reproduces the exact original canonical contract hash, proving joint, contact and corrective data unchanged. Production independent QA and all thirteen focused fixtures pass again after the normal repeat. No second construction repeat or Blender installation change was used.

## Verification handoff

Final checks pass: 137 Vitest tests, 105 Node tests, 105 Python tests, lint, typecheck, build, format check, character check, preview validation and `git diff --check`. The focused pilot suite passes all thirteen cases after repeat. Historical tracked assets and seed masks/catalogs remain unchanged. This verified export unit is ready for its parent-owned work-unit commit; no commit, review, UI integration or default change was performed by the implementation worker.

## Try the opt-in catalog viewer

Run `pnpm dev`, select **Bodyweight squat**, **Push-up** or **Dumbbell shoulder press**, then enable **Experimental character v2**. V1 remains the initial/default character for every selection. Unsupported exercises stay on v1; a failed v2 load automatically returns to v1 with a notice. Uncheck and check again to retry. Playback uses the actual four-second `rep` clip, not a stress-pose alias.

The demo serves/builds only the three allowlisted, SHA256-pinned GLBs under `assets/character-v2/`. Source blends, masks and unrelated pipeline files are not copied. No v1 catalog or asset bytes are replaced. The selector resets when changing exercise; no preference is persisted. The existing viewer owns loading, late-load disposal, animation cleanup and renderer teardown when switching variants.

V2 reuses play/pause, restart, loop, speed, timeline and camera controls. Legacy muscle-region highlighting is explicitly disabled for v2 through the viewer’s default-preserving `muscleHighlights` opt-out; it is not a v2 surface-mask implementation. The original-v1 identity block is labeled separately; the experimental viewer exposes its own exact hash. V2 muscle overlays, anatomical/clinical approval and physical-device acceptance remain pending. To roll back, remove the demo adapter, its allowlisted serving/copy step and accompanying tests; retain the verified pilot exports and all v1 assets.
