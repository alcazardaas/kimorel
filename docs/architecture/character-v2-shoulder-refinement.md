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

The pinned native Blender5.2.4 execution requires parent/user approval; sandbox background execution is known to fail before useful processing. Do not download another toolchain or bypass quarantine.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python pipeline/character-v2/build_shoulder_refinement.py
node scripts/character-v2-shoulder-qa.mjs
```

Inspect `pipeline/character-v2/shoulder-refinement/comparison.png`: matched old morph OFF, old morph ON and new weights/rebuilt morph ON closeups, followed by neutral and whole-body context. These are renders of actual exported GLBs reimported into Blender, not source-only viewport images or AI illustrations. Underarm shape limitations remain visible.

Only after independent exported vertex/index equality and all shoulder gates pass may `node scripts/character-v2-shoulder-qa.mjs --bind-masks` exclusively create four separate mask copies and `muscle-catalog.json`. Sparse coverage values remain the old proposals; character/hash/catalog bindings change. The original masks and catalog are never rewritten. Anatomy review remains pending and activation roles stay empty.

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
