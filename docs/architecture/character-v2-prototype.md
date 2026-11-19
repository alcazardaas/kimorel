# Character v2: separate Blender draft

This is an **original procedural Blender blockout and export experiment**, not a production-retopologized or anatomy-approved character. It implements the confirmed direction: retain the current character's overall proportions while improving the body silhouette and replacing mitten hands with five individually articulated digits. The existing character remains the default for all 100 exercises.

## Review the visible draft

The generated review files are deliberately outside the shipping `assets/` tree:

- [Six-view inspection sheet](../../pipeline/character-v2/prototype/inspection-sheet.png): front, side, back; three-quarter, open hand, flexed hand.
- [Editable Blender source](../../pipeline/character-v2/prototype/character-v2.blend).
- [Exported GLB](../../pipeline/character-v2/prototype/character-v2.glb).
- [Reference measurements and semantic joints](../../pipeline/character-v2/reference-body.json).
- [Draft provenance and file hashes](../../pipeline/character-v2/prototype/manifest.json).

The PNGs are rendered after reimporting the exported GLB into a clean Blender scene. They are not image-generation artwork or screenshots of a different source mesh. They do not replace independent Three.js loading and animation checks.

## Preserved proportions and proposed changes

The reference generator reads the original neutral-human GLB, not an invented population-average body. It preserves the 18 legacy joint centers and derives the source mesh's actual bounds. These measurements are a compatibility reference, **not a claim of ideal human proportions**.

The blockout refines the rib-cage/waist/pelvic silhouette and adds modest original pectoral, deltoid, back, gluteal, knee, calf, heel and foot volumes. Those are proposed visual landmarks, not anatomically segmented muscles or measured activation. No anatomy illustration, external model, scan or captured motion is incorporated.

A separate left/right hand surface contains a palm, four fingers and a distinct thumb. The export skeleton has 50 joints: the 18 legacy joints, two clavicle helpers and 30 digit-chain joints. The thumb chains are functional animation controls, not a claim that every digit has identical anatomical bone structure. A two-second `hand-articulation-smoke` clip flexes the digit joints, then returns to neutral. It is a rig/export test, not a validated equipment grip.

## Source and reproducible route

- [`prototype_geometry.py`](../../pipeline/character-v2/prototype_geometry.py): reference extraction, coordinate conversion, semantic joints, digit chains and closed loft geometry. Runs without Blender.
- [`build_prototype.py`](../../pipeline/character-v2/build_prototype.py): original volume assembly/remeshing, armature, draft weights, GLB export/reimport and CPU review rendering.
- [`character-v2-prototype-qa.mjs`](../../scripts/character-v2-prototype-qa.mjs): independent Three.js GLTFLoader and actual skinned-vertex checks.

The toolchain is pinned to Blender 5.2.4 LTS. Parent setup verified the official Apple Silicon DMG against its published SHA-256 (`e73d564f97061b2496ccc5a0bd738937d2d3d0acae23621a00bbc7534dfd135f`), and the executable reports build `cd5dc428cce1`. No automatic installer is part of this source.

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup \
  --python pipeline/character-v2/build_prototype.py

python3 -m unittest pipeline/tests/test_character_v2_prototype.py -v
node scripts/character-v2-prototype-qa.mjs
node --test scripts/character-v2-prototype-qa.test.mjs
pnpm character:check
```

The Blender command writes only the new prototype directory and reference JSON; it never regenerates v1. A native-approved unsandboxed launch may be required on this machine: the initial sandboxed background startup crashed before Python evaluation, while the approved background smoke test succeeded. This is an environment observation, not a reason to bypass operating-system permissions or quarantine.

Coordinate conversion is explicit: glTF `(X,Y,Z)` becomes Blender `(X,-Z,Y)`; export uses standard glTF +Y up, meters and +Z forward. The source control positions are semantic names rather than a proposed universal bone-index contract. Blender bone rest axes differ from v1's identity-rest convention; direct reuse of v1 local rotations is not authorized or proven.

The exported armature uses ordinary linear skinning, with at most four delivered influences. Blender's Preserve Volume mode is disabled. There are no Blender-only drivers or runtime-specific IK requirements. The exporter behavior is based on the [Blender 5.2 API](https://docs.blender.org/api/5.2/bpy.ops.export_scene.html) and must be tested against the actual exported file, not assumed from a viewport.

## Technical checks and acceptance limits

The pure-Python tests verify reference-center preservation, left/right symmetry, five three-segment digit chains per hand, coordinate round trips and closed finite lofts. Independent exported QA checks finite position/normal/weight values, normalized weights, valid skin joints, indexed nondegenerate triangles, stature, digit hierarchy, actual hand-skin movement and loop closure. Negative fixtures remove motion, corrupt a digit identity, enlarge the character and remove normals.

`pnpm character:check` remains the independent v1 preservation gate. New prototype source and outputs live outside its explicitly frozen paths. No baseline refresh, shipping-registry modification or asset-approval promotion is permitted to make these checks pass.

## Deliberate draft limitations

- The body is a voxel-remeshed volume blockout, **not production quad edge flow**. It is a starting point for an artist, not completed CV2-04 topology acceptance.
- The closed body and separately rigged hand surfaces overlap at the wrists. Seams/internal intersections require review and a later continuous production surface.
- Weights are generated from anatomical neighborhoods/nearby segments, **not carefully painted and reviewed production weights**.
- Shoulder-girdle controls, distributed forearm twist, corrective shapes, toe articulation and the full deformation stress suite remain future work.
- The digit smoke test proves real skeletal deformation, not natural grip contact, thumb opposition throughout motion or clinically appropriate movement.
- There is no muscle atlas, cutaway, force model or activation measurement.
- No existing exercise has been retargeted to the draft. The three-exercise pilot and all 100 v2 migrations remain pending.
- Source `.blend` files and render PNGs are tool-generated review artifacts; byte determinism must be measured rather than assumed. Exact hashes identify each observed result, not guaranteed cross-platform equivalence.
- No human/anatomy, physical-device or release approval is inferred. New geometry and smoke motion follow the project's original CC0 dedication, while their review status remains `needs-review`.

The parent should inspect the actual renders and obtain product/anatomy feedback before treating the reference/body phases as accepted. CV2-01C device/human evidence and the production contracts still remain open. The later pilot must include squat, push-up and shoulder press in the actual browser, with contact/equipment refitting and version-aware fallback.

## Observed prototype proof

The refined exported draft has 141,192 position vertices and 282,372 triangles across three skinned surfaces, with 50 export joints. Each welded surface is connected; this does not mean the three surfaces form one continuous production skin. Actual exported stature is 1.843587m versus the original 1.848183m, and all 18 legacy joint centers agree within the 1e-5m engineering comparison threshold. These figures are file/export measurements, not an anatomy certificate.

Independent GLTFLoader evaluation observes 0.115370m maximum hand-skin travel and zero end-pose loop error. The exported keys start at 0.033333s and end at 2.033333s, so QA samples the actual exported clip duration rather than assuming the final key is at 2.0s. Negative fixtures reject missing motion, changed digit identity, global enlargement, missing normals, raw NaN and unnormalized weights. Raw weights are checked before loader normalization could conceal a bad source.

Two final runs of the same generator produced byte-identical GLB and inspection-sheet files. The `.blend` and six individual render PNG byte hashes varied; they are **not claimed byte-deterministic**. The manifest identifies the latest observed files. The body still has simplified barrel-like abdominal/chest/gluteal forms, overlapping wrist seams and palm/knuckle dimples. The draft is intentionally unoptimized (roughly 10 MB GLB and 7.3 MB `.blend`); production retopology, painted weights and device budgets remain pending.

The initial render exposed planar limb-cap transitions even though the body was technically connected. Uninterrupted arm/leg lofts and buried proximal thigh caps corrected the most obvious hip/elbow cuts without increasing whole-body voxel density. This demonstrates why connected topology and passing file checks do not replace multiview artistic/anatomical review.
