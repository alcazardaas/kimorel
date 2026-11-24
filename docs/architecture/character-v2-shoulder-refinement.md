# Same-topology shoulder refinement experiment

This isolated variant tests local skin-weight continuity and a rebuilt shoulder corrective. It does not change neutral topology, approve anatomy or replace the default character. All earlier body files, masks and generators remain frozen.

## Why weights first

The frozen shoulder-elevation clip shows large local edge expansion and neighboring vertices with abrupt upper-arm influence differences. The original distance kernel retains only four competing influences, including stationary torso bones. At the cutoff, an arm influence can disappear rather than taper continuously. Existing bounded corrective relaxation softens some spikes but does not remove the underlying discontinuity or the neutral underarm bridge.

A read-only diagnostic on the left engineering patch found peak edge-length ratios of p95=2.531/max=5.389 with the existing corrective, versus2.886/8.848 without it. Temporary smoothed weights reduced uncorrected strain; mixing those weights with the old corrective made it worse again. Those causal controls are not final weighting or anatomical truth. The exported variant is evaluated independently against the original on the same patch; acceptance is not inferred from these earlier numbers.

## Method

`shoulder_weights.py` projects local stationary torso contributions onto the chest while retaining ipsilateral clavicle/upper-arm/forearm fields. Bounded graph-neighbor smoothing removes abrupt local influence changes. A smooth spatial collar blends fields inside an explicitly limited shoulder/upper-arm region; outside that support, original weight dictionaries are untouched. Each affected vertex retains at most four positive normalized influences.

This stationary-torso projection is only justified for the existing seven engineering stress clips, not arbitrary future head/trunk animations. Parameters and support dimensions are engineering choices, not population anatomy or clinical motion limits. No bone centers, neutral positions, mesh indices or muscle-region contours are edited.

The shoulder target is rebuilt in posed space under the **new** skin matrices, then mapped back through their inverse linear part. The old hip target remains unchanged. Existing bone channels and baked morph influence curves are preserved. Old shoulder deltas must not simply be reused after reweighting.

## Reproduce and inspect

The committed generated variant is a historical snapshot built at `6c21116`. The later collar/source stabilization below has NOT been applied to that GLB, blend file, images or masks. Its manifest intentionally records the historical generator/helper hashes, not the latest helper source. A separately approved new variant and native Blender run are required before claiming the corrected source changes visible deformation. The current builder refuses to overwrite the existing frozen GLB. No regeneration is part of source stabilization.

```sh
node scripts/character-v2-shoulder-qa.mjs
```

Inspect `pipeline/character-v2/shoulder-refinement/comparison.png`: matched old morph OFF, old morph ON and new weights/rebuilt morph ON closeups, followed by neutral and whole-body context. These are renders of actual exported GLBs reimported into Blender, not source-only viewport images or AI illustrations. Underarm shape limitations remain visible.

For an approved fresh output set, only after independent exported vertex/index equality and all shoulder gates pass may `node scripts/character-v2-shoulder-qa.mjs --bind-masks` stage and validate four separate mask copies and `muscle-catalog.json`, then exclusively publish them. The existing historical output paths deliberately refuse republication. Sparse coverage values remain the old proposals; character/hash/catalog bindings change. The original masks and catalog are never rewritten. Anatomy review remains pending and activation roles stay empty.

## Engineering gates

- Exact neutral exported position/index/normal bytes and vertex order;26,939vertices and unchanged topology.
- Fifty joint identities/rest centers, seven clip identities/durations/channels, unchanged hip morph position/normal data.
- Finite normalized four-influence weights, unchanged remote weights, constrained local bone neighborhoods.
- Multiple interior shoulder samples with lower p95 and maximum local edge expansion than old morph ON, plus normal-turn and triangle-area diagnostics.
- Actual distal-arm travel and neutral loop return, so freezing motion cannot manufacture improvement.
- Negative controls for stale old morph/new weights, frozen animation, remote weight spill, NaN weights, excessive displacement and changed neutral geometry.
- Existing deformation QA for closed connected topology, digit separation, preserved proportions and stress clips.

The patch is an engineering coordinate neighborhood, not an anatomical muscle boundary. Edge stretch, normal turns and triangle area are artifact diagnostics, not proof of correct anatomy, volume preservation or absence of self-intersection. Qualified anatomy/artist review, physical-device testing and broader motion pilots remain pending.

## Recovery boundary

Remove only the new shoulder generator/helper/tests/doc, variant outputs and rebound masks to roll back. No earlier artifact is regenerated. Same-source repetition compares canonical GLB and comparison-sheet hashes; editable blend files and individual render metadata may vary and must not be represented as byte-reproducible without evidence. A partial failed run is not an accepted variant and does not authorize mask reuse.

The completed first export retains exact neutral/index/normal bytes and reduces aggregate bilateral peak patch edge expansion from p95=2.531/max=5.453 to2.450/4.885; normal-turn p95 falls from0.218 to0.190radians. This is modest artifact reduction, not a resolved underarm: broad webbing, pinching and an outer-arm fold remain visible. The comparison received engineering visual readback only. Four rebound masks retain exactly their previous coverage values with new hash/version bindings and remain pending anatomical review.

The five new canonical generated JSON paths are narrowly excluded from Prettier to preserve shared serializer/hash bytes; authored parameters, source, tests, provenance and documentation remain formatted normally.

## Source stabilization after the historical build

The earlier projection had a collar bug: any positive support replaced original torso identities with chest, even as support approached zero. The corrected helper now starts from the **original** distribution. A three-stage sparse handoff collapses only within original support, exchanges an original anchor for chest, then expands into the four local target names. This avoids pruning a five-to-eight-influence union into a discontinuous top-four result. At most four positive influences exist at each stage; zero support preserves the original dictionary exactly. Floating-point sum error remains bounded by normalized input rounding tolerance.

Continuity is proven in the collar factor for fixed endpoint distributions, including the two phase boundaries. This does not prove global spatial continuity when original distributions or chosen anchors change across vertices. The graph-smoothed local target remains an engineering proposal, not anatomical weight painting. Existing historical strict QA gates remain unchanged; they validate the historical exported file, not the newly corrected helper. A future artifact needs collar-aware gates and full new deformation/export evidence rather than inheriting historical metrics.

Shoulder mask rebinding now validates a private temporary bundle first, including the actual staged catalog and all four mask hashes/domains. Publication uses exclusive file creation and writes the catalog last. Ordinary write/validation/readback failures remove only files this attempt created, with device/inode ownership checks; preexisting files and exclusive-create collisions are never deleted or overwritten. A clean retry follows successful rollback. Temporary staging is removed on both success and failure.

This is **recoverable ordinary-failure publication**, not crash-atomic multi-file storage. Concurrent readers can observe intermediate mask files before the final catalog; process termination/power loss, malicious path replacement and filesystem cleanup failures are not atomicity guarantees. Cleanup ownership/IO failures are surfaced, not silently retried. The underlying single-file writer remains a primitive; bundle behavior is provided by the new publication wrapper.

Focused regressions cover zero/epsilon collar behavior, four-influence phase continuity, normalized weights and unchanged remote support. Publication tests inject a failure after every exclusive open, corrupt staged catalogs/masks, fail final readback, retry after rollback and protect every preexisting target plus a concurrent exclusive-create collision. No historical artifact is rewritten by these tests. Retargeted pilot work has not started.
