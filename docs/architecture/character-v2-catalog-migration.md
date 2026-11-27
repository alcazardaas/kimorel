# Experimental catalog migration

The ALL100 migration reuses one immutable processed v2 body and the existing canonical motion registry. It does **not** repeat body-weight projection per exercise. Only actual exported clips that pass independent engineering checks may enter the later v2-default rollout; original v1 assets remain available for rollback. Anatomical and human approval remain false.

## First batch

`reverse-lunge`, `standing-calf-raise`, and `lateral-lunge` are the next exports. The original squat, push-up, and shoulder-press pilot outputs remain untouched. A complete 100-ID inventory records canonical source/profile hashes, rep/hold identity, migration batch, and pending/exported status. Inventory coverage is not export completion.

The entry point is `pipeline/character-v2/build_catalog.py`. It imports proven matrix retarget/export/camera helpers read-only, never the old pilot generator's main function or the 8192-sample solve. The adapter accepts all 100 canonical motions; this exporter accepts the three unloaded standing clips plus faithful skin-only copies of the three existing pilots for regression. Props, elastic skins, grip, support, and hold-specific review belong to subsequent batches in `odd/tasks/character-v2.md`.

## Controlled generation

1. Run `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest pipeline/tests/test_catalog_motion.py`.
2. Compute SHA-256 of `build_catalog.py` and `catalog_motion.py`; pass those exact hashes as `--source-sha` and `--adapter-sha` to native Blender. Use `--background --python-exit-code 1 --python pipeline/character-v2/build_catalog.py -- --source-sha <hash> --adapter-sha <hash> --field-sha <hash> --ids reverse-lunge standing-calf-raise lateral-lunge bodyweight-squat push-up dumbbell-shoulder-press`.
3. The generator rejects any existing `pipeline/character-v2/catalog-v2-groin-1` destination. A failure leaves evidence in place: do not automatically delete or overwrite it. Reconcile the actual failure before authorizing another output attempt.
4. Run `node scripts/character-v2-catalog-qa.mjs` and `node --test scripts/character-v2-catalog-qa.test.mjs`. Both require real generated assets; missing assets fail rather than silently skip.

The source-ready command is supplied with exact hashes before the parent-owned native run. The immutable input contract checks the 100 original exercises, 420 artifacts, 34 source inputs, cached body, and hash-bound pilot helpers. It rechecks them after exports and renders. No baseline refresh is permitted.

## Independent engineering proof

For the three new motions, the checker loads the **original v1 GLBs** and new v2 GLBs independently with Three.js; the original-three regression candidates use their immutable, previously verified contact-corrected pilot GLBs as trajectory truth, rather than accepting exporter-produced canonical-frame JSON as truth. Every one of the 121 samples checks semantic positions/orientations, pose-derived morph envelopes, actual skinned geometry, loop closure, and a whole-mesh maximum edge elongation of 6x for rest edges at least 1 mm. Neutral topology, geometry, corrective deltas, and all named skin weights must match the derived neutral. The analytic derivation uses the independently hash-bound original native-weight proof: the old neutral GLB had pruned sub-0.0001 influences, so it is not a lossless input to the collar. Exact old-GLB exterior weights remain required. No weight tolerance was relaxed to conceal that distinction.

Contact checks are phase-specific: reverse-lunge requires the planted left foot while its right foot follows the canonical swing; lateral-lunge requires both feet; calf raise requires floor support through the forefoot with actual heel rise, not a frozen flat-foot assumption. Actual calf pivot markers are compared with the frozen source markers. Surface floor tolerance remains ±8 mm with less than 8 mm drift. Any support or deformation failure is reported with measured diagnostics before changing the body, retarget, or thresholds.

Matched front/side/quarter sheets reimport both actual GLBs at Blender frame 61. They are static engineering evidence, not video inspection or anatomical acceptance. The exact same body/cache/source/clip hashes bind the manifest and QA. The generated manifest deliberately retains canonical generator bytes.

## Rollback and remaining work

Remove the new catalog adapter, exporter, field, checks, tests, and both catalog attempt outputs to roll back this unit; existing v1, original pilot assets, app defaults, and public viewer APIs are unchanged. No generated asset is marked approved by export or QA. Current batch evidence and remaining ALL100 batches are tracked in the existing recovery task; later rollout must preserve per-exercise v1 fallback and explicit user rollback.

## First actual attempt and causal correction

The first native run completed in about 21.3 seconds, but engineering QA **rejected** both lunges: the same 5.930 mm groin edge stretched 28.502x (reverse) and 23.792x (lateral). Its adjacent weights jumped between 92% right-thigh and left-thigh ownership. Semantic trajectories and planted-floor contacts agreed, isolating inherited cross-midline skinning rather than a motion error. The calf export also exposed separate marker actions; these must share the single `rep` action. The failed `catalog-v2` attempt remains intact, not silently replaced.

The authorized candidate is `catalog-v2-groin-1`. A reference-bound analytic field spans the measured cross-midline groin seam, blending both thigh semantics with a pelvis collar. Its smooth support is zero outside |X| < 180 mm, Y 650–1100 mm, |Z| < 230 mm, with a fully replaced core covering the observed seam. It preserves every exterior weight exactly, uses at most four normalized slots through continuous sparsification, and records every support boundary edge. Reapplication uses the immutable input, not iterative resmoothing. The body geometry, topology, and corrective deltas do not change. The new neutral GLB, native weights, derived `.blend`, field source, and original cache each receive distinct provenance hashes.

All six actual candidate clips must pass 121-frame checks with the unchanged 6x and contact bounds. For the original three regression candidates, only native skin accessors are replaced in copies of their existing GLBs; every byte outside joint/weight accessors remains identical. This retains their proven contact IK, finger grip, equipment, and exact real animation tracks while the original pilot assets remain untouched. New three use canonical retarget export. CPU in-memory preflight is diagnostic only, never a substitute for native asset acceptance. The derived command additionally requires `--field-sha <groin_weights.py hash>` and all six IDs.

## Observed engineering evidence — 2026-11-27

The derived native run completed in about **41.1 seconds**, exit 0. Independent binding and all six 121-frame checks passed against these exact assets. The manifest still says `exported-needs-independent-qa` because generation cannot award its own QA or approval; this section records the separate observed proof. There are **six engineering-checked candidate motions, not 100 migrated exercises**; 94 remain pending and the public viewer/default is unchanged.

| Candidate               | Maximum edge ratio (bound 6x) | SHA-256                                                            |
| ----------------------- | ----------------------------: | ------------------------------------------------------------------ |
| bodyweight-squat        |                      4.616387 | `798288c6dbbc9bdbbbc36c190d1abd682a998716922eb7fd3ef7d878214ba040` |
| push-up                 |                      4.851956 | `467de31b3dec6f09fa3178fbbe28d682217d424c3c9212648d3e66da04c2dca9` |
| dumbbell-shoulder-press |                      5.959737 | `dc505472c211b100e4c89cbaff7b88d7868c500b327973540d1477a777cf755a` |
| reverse-lunge           |                      4.279123 | `86f5ccd1fbb2b011c54826d71903be5d048c7defe59a95e4cb6b8bc5ad88b707` |
| standing-calf-raise     |                      1.603524 | `7ac6a13f79714201dd4f9ae780a05c3b17fa87128921c0920fbfc80a97566f43` |
| lateral-lunge           |                      3.308720 | `ca8b327182d0f2be60f2f795335cebc3b39e0ea6e1b86ff8fc1acc2c3f1ceefa` |

Derived neutral SHA-256: `679001b03a0bcb858d43839c2c007c43e553bb82b367e82667d6d9abda5b75dc`. Derived native source: `53463aaaad1d13b997fa59eb1e4c847f824e86a754e8db70fb76c84fc24c671b`. Derived native proof: `d56a83fe5879cad8c0995c9bbeb55c888dcd87f3ba826a104e699a96839d28b4`. Original source/neutral/proof hashes remain pinned separately in the manifest.

The collar modifies 2347 native vertices and records **679 boundary edges**. The checker independently verifies every boundary by coordinate pair (glTF normal splits can change vertex indices), its length and post-field gradient, the lossless native input, and exact unedited exterior. No global projection or repeated local solver was used.

Across the three new clips, maximum joint error was 0.700 µm and maximum morph-envelope error 1.27×10⁻⁷. Existing-three trajectories/morphs and all non-skin bytes are preserved. Calf actual surface support ranges −4.614 to +1.729 mm with at most 6.340 mm drift, inside the unchanged ±8 mm/8 mm bounds; actual heel rise is 50.500 mm. This tolerance is an engineering limit, not a claim of mathematically exact contact.

All six matched front/side/quarter sheets at Blender frame 61 were visually inspected. Gross poses, source matching, contacts and equipment remain recognizable; the former groin separation is reduced. Surface contours/correctives remain draft (including angular thigh/hip shapes), and slight calf floor penetration remains within the measured bound. These static sheets do not establish continuous visual quality, qualified anatomy, safe exercise technique, physical-device performance or muscle activation.
