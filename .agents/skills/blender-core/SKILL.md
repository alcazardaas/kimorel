---
name: blender-core
description: 'Trigger: Blender, bpy, blend files and headless authoring. Use the approved Kimorel toolchain without destructive defaults.'
license: MIT
metadata:
  author: 'EL4CTEO; Kimorel contributors'
  version: '1.0.0-kimorel'
---

## Activation Contract

Load for blender, bpy, blend files and headless authoring. Apply the local adoption policy before consulting historical examples.

## Hard Rules

- Use only `/Applications/Blender.app/Contents/MacOS/Blender`, approved version 5.2.4 LTS, build `cd5dc428cce1`; verify identity before any authorized job. No PATH/newest-install fallback.
- Require explicit authority for the job, input and fresh output directory. Work on a copy; preserve original .blend, GLBs, proofs and manifests. This skill grants no Blender execution permission.
- Do not use upstream wrappers, optional MCP servers, installers or unreviewed scripts. Do not enable auto-run Python in an untrusted .blend; inspect embedded scripts/drivers and dependencies first.
- Never automatically apply transforms, remove modifiers/actions/NLA, prune/normalize weights, merge topology or reset a live session. Meter scale is a contract to inspect, not a reason to transform a bound rig.
- Prefer the data API, explicit object identity and bounded context overrides. Free temporary evaluated meshes; do not retain freed Blender ID references.

## Decision Gates

| Situation                           | Required action                                                            |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Wrong/missing executable or version | Stop; report the mismatch, no substitute installation.                     |
| Live session or overwrite target    | Preserve it; request a copy/fresh destination before mutation.             |
| API mismatch                        | Inspect 5.2.4 RNA and existing project code, not upstream 5.3 assumptions. |

## Execution Steps

1. Load the project character-pipeline skill for character work and inspect the existing generator/manifest and intended rollback.
2. Confirm approved executable identity, source hashes, trusted input, fresh output paths and script side effects before running anything.
3. For authorized background Python jobs use `--python-exit-code 1`; verify actual output/manifest and logs, not exit status alone. Use the project's documented invocation, not a generic export preset.
4. Preserve and inspect slotted actions/channel bags and locale-safe node types. Report unsupported APIs or context limits rather than improvising destructive fixes.

## Output Contract

Return changed paths, exact checks and observed outcomes, pending evidence, and rollback scope. Separate measured facts from assumptions; do not claim safety or approval from a skill.

## References

- [Adoption policy](../README.md)
- [Pinned upstream core guidance](../_sources/blender-core.txt)
- [Historical API table; includes inapplicable 5.3 entries](../_sources/blender-api-changes-5x.txt)
- [Historical patterns; not executable authority](../_sources/blender-bpy-patterns.txt)
