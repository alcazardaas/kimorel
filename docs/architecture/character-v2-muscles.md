# Draft muscle semantics, without invented anatomy

This isolated CV2-06A foundation validates **21 legacy concepts and their references**, not an anatomical atlas. The seed deliberately contains **zero anatomical identity proposals, zero surface mappings and zero new exercise-role claims**. Every legacy concept has unknown side/depth, semantic-only representation and pending review. The application, public v1 API and all character artifacts remain unchanged.

## Validate the actual seed

```sh
pnpm --filter @kimorel/schemas build
node scripts/character-v2-muscles-qa.mjs
pnpm exec vitest run packages/schemas/src/muscles-v2.test.ts
node --test scripts/character-v2-muscles-qa.test.mjs
```

The CLI reports `draft-contract-only`, `anatomicalValidation: false`, `humanApproval: false` and `maskPayloadValidation: true`, `validatedMaskPayloads: 0`. It checks the actual frozen character SHA-256 and coverage of all 100 current exercises. No network, Blender, asset regeneration or approval operation occurs.

## Three separate layers

| Layer                             | Meaning and current boundary                                                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy concepts                   | Stable `legacy-*` IDs alias all 21 existing filter/display labels. They are not silently classified as individual anatomical muscles or groups. Project-metadata references describe their origin, not anatomical evidence.                                             |
| Anatomical identities             | Separate draft IDs, kind, side, depth, visibility, proposed legacy-concept links and anatomy-reference citations. None are seeded. Citation syntax/references can be checked; source truth and qualified review cannot be manufactured.                                 |
| Surface mappings / exercise roles | Mapping proposals bind exact character ID/version/GLB hash, catalog/map versions, mesh/primitive vertex domain and mask-file hash. Role proposals use qualitative prime-mover/synergist/stabilizer terms with basis, sources and optional phase. Both arrays are empty. |

The new strict schema lives in `packages/schemas/src/muscles-v2.ts`, separate from the unchanged public `index.ts`. The read-only CLI imports its compiled internal module, following existing repository validator/build conventions. It reuses the installed Zod and legacy exercise/path schemas; no dependency or package export is added.

### Fail-closed policies

- Require exactly one concept for each canonical legacy muscle ID; reject duplicate IDs, orphaned references and contradictory role records.
- Preserve explicit side and version/hash compatibility. A bilateral identity may have a left/right mapping; a left identity cannot silently become bilateral or right-sided.
- Reject ordinary external-region mappings for deep, mixed, unknown-depth or unknown/ineligible-visibility identities. A separately declared layered-view proposal is not normal-skin exposure or an implemented cutaway.
- Keep every record pending and the catalog draft. `approved`, numeric recruitment/intensity fields and legacy `primary` used as a new anatomical role are rejected.
- Do not convert existing primary/secondary UI metadata into prime-mover/synergist claims. Existing highlighting and filters retain their original behavior.
- Check real character/mask file hashes and declared vertex counts; reject symlinked file ancestors and unsafe paths. **Sparse payload bytes are decoded and mechanically validated; they are not judged anatomically.** A valid payload is not a reviewed or runtime-adopted mask.

The fictional identity/mask/reference records in tests are deliberately synthetic contract fixtures, not anatomy examples. No fixture becomes catalog data. Tests cover deep/unknown exclusion, stale character/version/hash bindings, role/source/side errors, unsupported promotion, unknown real exercise IDs and changed file bytes.

## What is still missing

1. Qualified evidence for anatomical identity decomposition, side, depth, partial visibility and proposed actions. The current 21 labels mix legacy concepts; they are not an approved canonical ontology.
2. Artist-authored bind-space surface masks with source permissions and neutral/deformed visual review. The sparse payload pipeline below now provides topology-specific mechanical validation, not anatomical boundaries. Existing v1 bounding boxes must not be copied onto v2 and presented as anatomy.
3. Evidence/review of task/phase-specific qualitative roles. No EMG, recruitment percentages, contraction or force is inferred from the animation.
4. Explicit versioned rendering adapters and acceptance before public/runtime adoption. The current renderer reads `_muscle_region` using the legacy region table; the frozen corrective GLB has no muscle-region attribute.

The detailed [CV2-06 plan](character-v2-plan.md#muscle-catalog-and-visualization-contract) names reference starting points, not approvals. This unit intentionally does not assign specific muscles to superficial/deep classes or paint unknown structures onto skin.

## Full verification and rollback

Run the focused commands above, then `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm format:check`, `pnpm character:check`, `pnpm validate:preview` and `git diff --check`. Python, Blender and browser checks are N/A: none of those boundaries change. Legacy/default/earlier draft files must remain byte-exact.

Rollback of the semantic foundation removes its schema files, seed catalog, CLI/tests and this document; rollback of the sparse pipeline removes its separate schema/CLI/test modules and reverts integration edits. Production anatomy/artist/device approval, actual mask authoring, muscle rendering, exercise pilot and 100-motion migration remain pending.

## Sparse per-vertex authoring pipeline (CV2-06B)

The actual seed remains unchanged: no identities, mappings or roles were invented. The pipeline is exercised against the real 26,939-vertex GLB with explicitly **non-anatomical temporary fixtures**, not committed body paint.

`kimorel.sparse-muscle-mask/v1` payloads contain `status: draft-needs-review`, `purpose: authoring-proposal` (or `non-anatomical-test-fixture`), `anatomicalValidation: false`, a `binding`, and nonempty `weights` entries `{vertexIndex, weight}`. Binding copies the exact catalog mapping **except its mask file/hash**, avoiding a self-referential hash. Character/hash/versions, identity IDs, side, representation, mesh/primitive and vertex count must match; original catalog identity/source eligibility rules still apply. These are declared metadata bindings, not proof that selected vertices anatomically belong to the named identity or side.

- Indices are unique, integer and within the actual primitive POSITION domain.
- Assigned weights are finite, strictly positive and at most one; omit zero entries. These are **surface-coverage weights, never recruitment/activation measurements**.
- Unassigned dense weights are exactly zero. `materializeSparseMask` returns a deterministic `Float32Array` for later vertex-attribute consumers; no renderer adoption occurs here.
- Canonical JSON sorts vertex entries and set-like reference arrays. `serializeSparseMask` gives reproducible bytes for the catalog SHA-256.
- A one-million-vertex allocation guard bounds one dense array to 4 MB. This is input/memory safety, not a device-performance or model-budget acceptance.
- The catalog CLI now reads every declared payload, checks its file hash/binding/domain and materializes it. An empty catalog reports zero validated payloads; this does not imply an authored mask exists.

### Explicit non-overwriting export

Build schemas first. Author a **separate proposed catalog** and sparse proposal; do not modify the frozen seed. The catalog must already declare the mapping and intended output path. All operations remain draft and do not verify anatomy or external citation truth.

```sh
pnpm --filter @kimorel/schemas build
# Default: inspect only. Prints canonicalSha256 and catalogHashMatches; writes nothing.
node scripts/character-v2-mask-pipeline.mjs draft/catalog.json draft/proposal.json --root /absolute/local/workspace
# Manually put the reported hash in the proposed catalog mapping. Never auto-promote review.
# Create the output parent directory yourself, then explicitly request the separate file:
node scripts/character-v2-mask-pipeline.mjs draft/catalog.json draft/proposal.json --root /absolute/local/workspace --write pipeline/character-v2/masks/proposed.json
# Read-only complete catalog/payload check of that local authoring bundle:
node scripts/character-v2-muscles-qa.mjs draft/catalog.json --root /absolute/local/workspace
```

Writing requires the canonical hash to match the proposed catalog and the output to equal its mask path under `pipeline/character-v2/masks/`. Parent directories must exist and be real directories. Exclusive creation refuses existing files and symlink leaves; unsafe paths and symlink parents/root are rejected. The tool never overwrites a proposal, catalog, body asset or existing output, and never creates directories or updates review state. A failed write may leave a partial newly created draft file for manual inspection; it is never reported as verified.

The new internal modules are `packages/schemas/src/muscle-masks-v2.ts` and `scripts/character-v2-mask-pipeline.mjs`, each with focused tests. The temporary roundtrip verifies inspect→write→catalog validation→dense attribute counts against actual GLTFLoader geometry, deterministic bytes, and overwrite/path/invalid-payload failures. Python/Blender/browser remain N/A.

Sparse coverage weights must remain positive after Float32 conversion. Positive JSON numbers that round to zero (including the half-minimum tie) are rejected rather than silently dropped, even alongside normal weights. Positive Float32 subnormals remain valid; canonical JSON retains the supplied number and dense materialization uses standard Float32 rounding. This is support preservation, not a new activation threshold or anatomical claim.
