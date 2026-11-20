# Draft muscle semantics, without invented anatomy

This isolated CV2-06A foundation validates **21 legacy concepts and their references**, not an anatomical atlas. The seed deliberately contains **zero anatomical identity proposals, zero surface mappings and zero new exercise-role claims**. Every legacy concept has unknown side/depth, semantic-only representation and pending review. The application, public v1 API and all character artifacts remain unchanged.

## Validate the actual seed

```sh
pnpm --filter @kimorel/schemas build
node scripts/character-v2-muscles-qa.mjs
pnpm exec vitest run packages/schemas/src/muscles-v2.test.ts
node --test scripts/character-v2-muscles-qa.test.mjs
```

The CLI reports `draft-contract-only`, `anatomicalValidation: false`, `humanApproval: false` and `maskPayloadValidation: false`. It checks the actual frozen character SHA-256 and coverage of all 100 current exercises. No network, Blender, asset regeneration or approval operation occurs.

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
- Check real character/mask file hashes and declared vertex counts; reject symlinked file ancestors and unsafe paths. **Mask bytes are not decoded or judged anatomically here.** A valid declared mapping is not an authored, reviewed or runtime-ready mask.

The fictional identity/mask/reference records in tests are deliberately synthetic contract fixtures, not anatomy examples. No fixture becomes catalog data. Tests cover deep/unknown exclusion, stale character/version/hash bindings, role/source/side errors, unsupported promotion, unknown real exercise IDs and changed file bytes.

## What is still missing

1. Qualified evidence for anatomical identity decomposition, side, depth, partial visibility and proposed actions. The current 21 labels mix legacy concepts; they are not an approved canonical ontology.
2. Artist-authored bind-space surface masks with source permissions, topology-specific payload validation and neutral/deformed visual review. Existing v1 bounding boxes must not be copied onto v2 and presented as anatomy.
3. Evidence/review of task/phase-specific qualitative roles. No EMG, recruitment percentages, contraction or force is inferred from the animation.
4. Explicit versioned rendering adapters and acceptance before public/runtime adoption. The current renderer reads `_muscle_region` using the legacy region table; the frozen corrective GLB has no muscle-region attribute.

The detailed [CV2-06 plan](character-v2-plan.md#muscle-catalog-and-visualization-contract) names reference starting points, not approvals. This unit intentionally does not assign specific muscles to superficial/deep classes or paint unknown structures onto skin.

## Full verification and rollback

Run the focused commands above, then `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm format:check`, `pnpm character:check`, `pnpm validate:preview` and `git diff --check`. Python, Blender and browser checks are N/A: none of those boundaries change. Legacy/default/earlier draft files must remain byte-exact.

Rollback removes only the two new schema files, seed catalog, CLI/CLI tests and this document. Production anatomy/artist/device approval, actual mask authoring, muscle rendering, exercise pilot and 100-motion migration remain pending.
