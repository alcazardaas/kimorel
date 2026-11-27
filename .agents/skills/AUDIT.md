# Skill adoption review — 2026-11-27

All seven active project-local skills were adapted and statically reviewed. Upstream scripts are **not installed or executed**. Original text is retained as hash-bound historical evidence, not a second active instruction set. This is not a security certification or dynamic/transitive-dependency audit.

## Reviewed skills and decisions

| Skill                      | Source concern / project mismatch                                                                                        | Applied adaptation                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| threejs-animation          | r186 examples versus installed r187; generic first-clip playback, skeletal cloning and mixer lifecycle assumptions       | Require installed-API verification, declared rep/hold identity, independent instance ownership and existing pause/visibility/reduced-motion behavior. No asset transforms.                               |
| threejs-performance        | Optional profiling packages; generic merge/LOD/compression; resource counters confused with byte measurements            | No automatic installs or frozen-asset optimization. Require named-device baseline, distinguish CPU/file/count/GPU-estimate evidence and preserve skinned/mask contracts.                                 |
| threejs-loaders            | Decoder/external-resource examples, lossy pipeline cross-reference, generic disposal without shared-cache ownership      | Restrict source/resource approval, no decoder downloads, explicit stale-response/retry handling and last-owner disposal. Preserve v2/v1 selection.                                                       |
| web-design-guidelines      | Generic keyboard, form, virtualization, styling and package advice cannot be mandatory project policy                    | Use bundled rules only; native semantics before custom keyboard handlers; report contextual advice separately from defects. No runtime network refresh or dependency additions.                          |
| blender-core               | Wrapper discovers environment/PATH/newest Blender; optional MCP; generic scale application and 5.3 advice                | Omit all wrappers/scripts. Pin approved 5.2.4/build/path, copy/fresh-output job scope, untrusted-file auto-exec prohibition, explicit context and no destructive transform/action/weight defaults.       |
| blender-asset-qa           | Upstream instructions say fix/recheck until pass; generic weld/fill/transform/rig fixes and default render outputs       | Omit all scripts. Read-only inspection first, no correction loops, fresh output paths only, project-specific independent QA and human/device acceptance boundaries.                                      |
| kimorel-character-pipeline | No generic downloaded skill covers original native weights, semantic identity, frozen inputs and current migration state | New project contract derived from actual adapter/export/restoration/QA code. Preserve tiny influences, exact provenance/topology and unchanged 6×/phase-aware gates; inventory is not export completion. |

## Immutable sources

Full pins, original paths, exact SHA-256 values and local file hashes are in `manifest.json`.

- CloudAI-X/threejs-skills: `0e181866f095b5f06d005133876e926515390d95`; retain exact MIT notice.
- vercel-labs/agent-skills: `5a37a6329fbad3666c3207392a6a7c0110e92efb`; pinned README declares MIT, no standalone LICENSE in inspected tree. Preserve README and attribution; no invented upstream notice.
- EL4CTEO/blender-skills: `11310568838d854fceff28e261e71854c2dab76b`; retain exact MIT notice.
- Bundled web-interface-guidelines source: `434b7f91364665f2f733b310ec54809bf8f37937`, SHA-256 `d246b026f4f29b5823a9cc857f9edf3d2507002e055e32040cadeaf3b38e0234`, independently matched to copied bytes.
- Custom project skill: verified adoption-base implementation `927e6fb`; supporting map identifies live code/docs and warns against stale historical scope.

## Verification

- Offline integrity/structure checker: all seven skills, six upstream skill records; hashes cover every local skill/reference/license/policy file and AGENTS.md, excluding the manifest itself.
- Eleven focused tests cover actual installation, tampered bytes, missing/unexpected files, symlinks, escaping manifest paths, invalid commit pins, source-hash inconsistency, missing registration/provenance, executable permissions, missing sections and external instruction references.
- Active frontmatter, ordered sections, concise body, local references, source pins and license evidence checked; no upstream executable files or executable file modes admitted.
- Scoped ESLint, Prettier checks, and Git whitespace checks run. Existing read-only v1 checker preserved all 100 exercises, 420 artifacts and 34 source inputs; no assets were regenerated.
- Registry refreshed: 20 total skills, including all seven project skills. `.atl/` and ODD recovery notes remain ignored by existing policy.

## Limitations and independent review

No Blender authoring, export, render, browser/device test or application-runtime change occurred. Actual Blender binary identity is a documented execution-time gate, not newly measured by this adoption. Upstream references include APIs outside this project/version; not every tutorial snippet is dynamically validated. No malware scanner, external analysis upload or optional dependency was run.

The checker is a local change-detection baseline, not a signed trust root: anyone changing both files and hashes can bypass content integrity. Review Git diffs and source provenance before accepting updates. Static safeguards are instructions, not an OS sandbox. Native independent review is parent-owned and pending; this report does not claim its approval.
