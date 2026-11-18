# Character v2: preserved v1 engineering baseline

CV2-01A/B starts the [character v2 plan](character-v2-plan.md) by freezing the current delivery assets and their legacy inputs. **It does not implement a new body, approve anatomy, or satisfy the physical-device/human portion of CV2-01.** The existing character remains the runtime default.

## Read-only preservation check

```bash
nvm use
pnpm character:check
```

The default CLI only reads files. It compares the current protected corpus against [`v1-baseline.json`](../../pipeline/character-v2/v1-baseline.json), including independently recomputed IDs, motion semantics, permissions, regions, rig names and file metrics. A failure never refreshes hashes, regenerates assets or approves anything.

The baseline records source revision `9974c997545e3701ae5a636172a7f3e85a35a2da`. That is the captured starting revision, not a requirement that future `HEAD` stay unchanged. No capture timestamp, machine name, absolute directory or unobserved runtime measurement is embedded.

## Observed file inventory

| Measurement                           |                 Captured value | Meaning / limitation                                            |
| ------------------------------------- | -----------------------------: | --------------------------------------------------------------- |
| Unique exercise IDs / motion profiles |                      100 / 100 | Existing technical previews, not validated exercise instruction |
| Provenance / review identity records  |                      220 / 220 | All original CC0-1.0 and `needs-review`; not asset approval     |
| GLB / PNG artifacts                   |                      120 / 300 | Delivery assets plus 200 diagnostic sheets                      |
| Total artifact bytes                  |                     76,939,780 | File storage, not GPU memory or network throughput              |
| Protected files                       |                            454 | 420 artifacts and 34 legacy source/contract inputs              |
| Neutral-human position vertices       |                          8,200 | Declared mesh-position accessor total                           |
| Neutral-human indexed triangles       |                         16,396 | Triangle-mode primitive index counts / 3                        |
| Neutral-human skin joints             |                             18 | Not a complete anatomical skeleton                              |
| Human skin inventory                  | 51 × 18 joints, 50 × 20 joints | Includes the rest character and 100 exercise characters         |
| Band skin inventory                   |         13 × 2 endpoint joints | Equipment deformation, not additional human joints              |
| Region definition versions            |            1.2.0 through 1.6.0 | Approximate educational surfaces, not activation data           |

Animation durations are read from the actual GLB float time buffers, not assumed from a four-second authoring convention. Each exercise preserves its registered asset/clip reference, hold/repetition kind, loop flag, rig selection, region version and profile digest. File hashes protect all bytes, including details not summarized in the inventory. Metrics do not replace the independent exported-geometry/contact validators.

## Exactly what is frozen

- Immediate `.glb` / `.png` files in `assets/characters`, `assets/equipment`, `assets/exercises`, `assets/thumbnails`, and `docs/reviews`.
- Immediate Python/JSON v1 authoring files in `pipeline/character`.
- Immediate `muscle-regions*.json` definitions in `packages/schemas/src`.
- `.nvmrc`, the v1 skeleton convention, the original-asset dedication, exercise registry, provenance manifest, and generated review identity file.
- The package-manager declaration, without freezing unrelated package scripts, UI source, or all of `package.json`.

All selected paths must be regular files with non-symlink parents. The checker rejects removals, additions inside these legacy scopes, changed bytes, duplicate identities, stale review hashes, malformed baseline data and path traversal. It recomputes derived claims instead of trusting edited summary values.

New files outside the selected v1 scopes, such as `pipeline/character-v2/` or a distinct versioned output directory, do not invalidate this preservation check. That does **not** exempt new assets from the project's independent provenance validation: `validate-data.mjs` currently requires a provenance record for every asset-directory file. Future `.blend` sources and v2 exports must integrate with that rule explicitly.

Shared registry/provenance files are deliberately frozen byte-for-byte for this first unit. A later version-aware registry adapter or authorized v1 correction must introduce an explicit preservation-policy/version change with a reviewed diff; it must not erase this snapshot merely to make checks green. Keep old snapshots and their source revisions available. This is accidental-drift detection, not a signature or a security boundary against an actor who can change both the repository and baseline.

## Capture is explicit and cannot overwrite

Initial capture was performed with:

```bash
node scripts/character-baseline.mjs \
  --capture pipeline/character-v2/v1-baseline.json \
  --source-revision 9974c997545e3701ae5a636172a7f3e85a35a2da
```

This command is not a repair instruction. It refuses an existing destination, requires an explicit repository-relative output and full revision, rejects symlink output parents, and never modifies delivery assets. There is no force/refresh flag. Capture mode cannot be combined with check mode. A separately authorized future snapshot must use a distinct reviewed path.

For a different existing snapshot, `--baseline <relative-path>` selects a read-only comparison. `--root <directory>` exists for controlled fixture trees and alternate local checkouts. Outputs and protected paths cannot escape the selected root.

## Toolchain and permissions

- `.nvmrc`: Node 26.13.1; `package.json`: pnpm 10.15.0.
- Existing tests use Vitest plus `node --test scripts/*.test.mjs`; Python authoring tests use standard-library unittest.
- Prior M2/viewer/ODD records leave TDD unconfigured. This unit uses ordinary regression checks and makes no strict RED/GREEN claim.
- Blender was not found in PATH or `/Applications/Blender.app/Contents/MacOS/Blender`. Other installations were not searched. No install or export was attempted.
- Existing asset permission records remain original CC0 with commercial-use/redistribution fields recorded. Those fields do not approve a future reference photograph, scan, `.blend`, or anatomy illustration.

## Baseline follow-ups, not silently fixed

| Existing concern                            | Status in this unit                                            | Later owner / evidence                                    |
| ------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| Animated hip-pad transform invariant        | Recorded review follow-up; not changed                         | QA: per-sample transform corruption fixture               |
| Landmine palm exemption extent              | Recorded review follow-up; not changed                         | QA: non-distal palm/shaft mutation                        |
| Standalone landmine inherited transforms    | Requires reconciliation against current root/node restrictions | QA: actual exported scaled-parent negative control        |
| Legacy band non-finite bind handling        | Recorded review follow-up; E2-specific guards do not close it  | QA: legacy NaN/infinity fixture                           |
| Legacy band anchor local/world handling     | Recorded review follow-up; not changed                         | QA: reparented/translated anchor fixture                  |
| Five lower-limb band body-region labels     | Existing metadata remains frozen, not endorsed                 | Data owner: corrected labels and catalog-query regression |
| Standalone cuff/handle inherited transforms | Requires reconciliation against current root/node restrictions | QA: actual exported scaled-parent negative control        |

These are not new findings established by the baseline checker, nor evidence of fixes or review approval. Existing final-catalog review limitations remain separate from v1 preservation and from future anatomy review.

## Verification and remaining gates

The CLI harness uses owned synthetic temporary trees for valid capture/check behavior and corrupted/missing bytes, refreshed mutable hashes, duplicate IDs, unsafe paths, malformed inventories, non-regular files, symlinks, timing corruption and future files outside the protected corpus. No real delivery file is mutated by these tests.

Required engineering proof is the focused Node suite, actual check, repeated actual capture comparison, current review-manifest check, project tests/lint/types/build/format, preview validation, asset QA, and diff check. Observe results before marking recovery tasks complete. Python tests are N/A unless Python changes; browser tests are N/A for this CLI-only unit with no viewer change.

### Observed engineering verification

| Check                                              | Observed result                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Focused baseline Node suite                        | 12 passed, including CLI and corrupted-fixture cases                                                  |
| `pnpm character:check` / default CLI               | 100 exercises and 420 artifacts preserved; no writes                                                  |
| Two actual captures compared with frozen inventory | Identical serialization and SHA256 `3f3b59509ede5d20a752237e4b59acc924af0b05c924623708108c60582eb5f3` |
| Current review-manifest check                      | Exact hashes verified for 220 assets                                                                  |
| `pnpm test`                                        | 77 Vitest and 43 Node tests passed                                                                    |
| Lint, typecheck, build, formatting and diff checks | Passed                                                                                                |
| `pnpm validate:preview`                            | 100 examples and 220 asset records validated                                                          |
| `pnpm assets:qa`                                   | 100 clips and 19 standalone props passed                                                              |

The first full lint run rejected implicit Node globals in the new test fixture. The fixture now imports `Buffer` from `node:buffer` and uses `globalThis.structuredClone`; focused tests, lint and the final software chain were rerun successfully. No shared lint rule was relaxed. The production build still reports its existing large-chunk advisory; no code splitting or viewer change is part of this unit. No assets were regenerated, and the final frozen check still verifies all 420 artifacts and 34 protected legacy inputs.

**Still pending:** named desktop and physical-mobile targets, controlled visual reference views, load/decode time, frame-time distributions, draw calls, GPU/memory measurements, switching/leak evidence and human baseline acceptance. No FPS or hardware result is inferred from file counts or viewport emulation. CV2-01 therefore remains only partially accepted; CV2-02 reference-body approval and CV2-03 Blender export proof have not been performed.

Rollback removes the new baseline command/tool/tests/inventory/evidence document together. It does not regenerate or revert any of the 100 legacy clips, equipment, highlights, registry, provenance, or the detailed plan.
