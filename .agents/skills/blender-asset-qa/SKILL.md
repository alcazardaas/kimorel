---
name: blender-asset-qa
description: 'Trigger: mesh QA, normals, weights, deformation and multi-angle asset inspection. Review Kimorel assets without auto-repair.'
license: MIT
metadata:
  author: 'EL4CTEO; Kimorel contributors'
  version: '1.0.0-kimorel'
---

## Activation Contract

Load for mesh qa, normals, weights, deformation and multi-angle asset inspection. Apply the local adoption policy before consulting historical examples.

## Hard Rules

- Default to read-only inspection. Run Blender only via the approved core skill and explicit job authority; use copies and fresh output paths for renders/reports.
- Do not install or run upstream `qa_check.py`, `review_shots.py` or `_bpyx.py`; they are not bundled. Their profiles and default report/render paths do not implement Kimorel's contracts.
- Never repair until pass, weld vertices, fill holes, apply transforms, delete hidden geometry, normalize/prune weights or change tolerances automatically. Report candidate versus pre-existing findings separately.
- Preserve tiny influences, semantic joints, topology/order, morphs, provenance and contact bounds. A generic four-influence or ground-zero heuristic cannot replace named native-weight or phase-specific proof.
- A passing mesh report or contact sheet is not anatomy, clinical, temporal-animation or physical-device acceptance.

## Decision Gates

| Finding                     | Required action                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Static mesh concern         | Record object/region, metric and visual evidence; do not auto-correct.                         |
| Deformation/contact concern | Use actual exported animation and existing phase-aware QA.                                     |
| Repair needed               | Return a scoped proposal and rollback; await authorized correction, no retry-until-clean loop. |

## Execution Steps

1. Identify exact input hashes and relevant project validator; distinguish source mesh, evaluated mesh and independently reimported GLB.
2. Inspect counts, finite attributes, topology, normals, native named weights, morphs, dimensions and external resources without changing them.
3. For authorized visual inspection render into a new directory and open actual front/side/back/quarter and relevant hand/foot/grip views; inspect wireframe separately where useful. Record sampled time and absent views.
4. Run the appropriate existing independent QA and corruption fixtures. Preserve failed evidence; report limits, approved warnings only when explicitly accepted, and pending human review.

## Output Contract

Return changed paths, exact checks and observed outcomes, pending evidence, and rollback scope. Separate measured facts from assumptions; do not claim safety or approval from a skill.

## References

- [Adoption policy](../README.md)
- [Pinned upstream QA guidance; correction table is not authority](../_sources/blender-asset-qa.txt)
