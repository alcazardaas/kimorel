# Connected, reduced-density deformation draft

This **separate engineering candidate** reduces the previous draft's triangle count by 5.32×, joins its wrists into one closed surface, and adds seven exported stress clips. It is **not** an anatomically accepted character, painted production rig, exercise pilot, or new application default.

## Inspect first

| Artifact                                                         | Review purpose                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pipeline/character-v2/deformation/comparison-sheet.png`         | Same-camera/light baseline versus new neutral body and wrist; old left, new right      |
| `pipeline/character-v2/deformation/stress-sheet.png`             | Exported-GLB neutral, stress, knee-side and hand views                                 |
| `pipeline/character-v2/deformation/source.blend`                 | Editable connected mesh, generated weights and seven actions                           |
| `pipeline/character-v2/deformation/character-v2-deformation.glb` | Independently loaded/animated standard glTF export                                     |
| `pipeline/character-v2/deformation/qa-report.json`               | Actual geometry, topology, digit and motion measurements                               |
| `pipeline/character-v2/deformation/manifest.json`                | Original-project CC0 provenance, input/source hashes and artifact hashes; needs-review |

Stress-sheet order, left to right by row:

1. Front, side, back, shoulder elevation.
2. Elbow flexion, forearm twist, wrist flexion, hip flexion.
3. Knee flexion (quarter), hand closure, knee flexion (side), neutral wrist.
4. Flexed wrist, closed hand, front, side.

All new render views come from **reimporting the exported GLB**, not the source viewport. Stress amplitudes are engineering review targets, not prescribed movement or clinical range-of-motion claims. Both legs flex together to expose skinning behavior; these clips are not balanced exercise demonstrations.

## Measured result

| Measure                                |                      Previous draft |                                                       New candidate |
| -------------------------------------- | ----------------------------------: | ------------------------------------------------------------------: |
| Position vertices                      |                             141,192 |                                                              26,939 |
| Triangles                              |                             282,372 |                                                              53,086 |
| Skinned surfaces                       |                       3 overlapping |                            1 welded, connected, closed two-manifold |
| GLB bytes                              |                          10,659,916 |                                                           1,920,224 |
| Export joints                          |                                  50 |                                                                  50 |
| Preserved legacy joint centers         |                                  18 |                                                18, within 0.00001 m |
| Neutral height                         |                          1.843587 m |                                                          1.843747 m |
| Neutral silhouette bound tolerance     |                           Reference |             Every axis endpoint within 0.02 m; height within 0.01 m |
| Long fingers resolved beyond each palm | Not proven; inherited webbing found | 4 separate mid-shaft components per hand plus separate distal thumb |
| Stress clips                           |                     Hand smoke only |                                       7 actual neutral-return clips |

The new height differs by approximately **0.16 mm** from the previous draft, not exactly zero. The triangle goal of ≤60,000 is an engineering reduction target, **not** a validated device performance budget. One material/surface does not guarantee a particular renderer's draw count or frame rate.

## Geometry and weights

The frozen previous `.blend` is read as input; its source generator and all original artifacts remain unchanged. New outputs are outside the shipping registry.

- Collapse reduction gives the body a 38,000-triangle budget and each hand an independent 8,000-triangle budget. Hands are not subjected to the body's much stronger reduction.
- New hands retain the existing semantic joint centers and layout. Finger radii are bounded by half the narrowest adjacent mid-shaft center spacing, less a **4 mm engineering air gap**. This is a separation constraint, not a population-derived anatomical measurement. A 1.5 mm voxel hand union resolves the gap.
- Exact Boolean unions create shared wrist topology. Ten-micrometer merge/dissolve cleanup removes intersection slivers before normals are recalculated. Independent export QA checks actual welded edges/components; putting overlapping objects in one mesh would fail.
- Smooth regional priors follow the sloped shoulder-to-wrist boundary. This prevents nearby thighs from receiving hand/forearm influences. A softer distance kernel blends up to four influences around joints.
- Export uses ordinary linear skinning; no Blender-only preserve-volume modifier is used to hide behavior unavailable to the application.

This is **automatic triangular topology**, not production anatomical edgeflow. Weights are generated, not hand-painted. There are no corrective shapes, twist helper joints, contact solving or muscle masks.

## Motion proof and its limits

Clips: shoulder elevation, elbow flexion, forearm twist, wrist flexion, hip flexion, knee flexion and hand closure. Actual exported duration is **2.033333 seconds**, not an assumed 2.0 seconds.

Independent Three.js `GLTFLoader` QA evaluates actual skinned vertices at neutral, quarter, peak, three-quarter and the true endpoint. It verifies raw weights before loader normalization, finite geometry/normals/skin data, valid joints, closed topology, preserved centers/bounds and ≤60,000 triangles.

- All seven clips return to neutral with endpoint error below 0.00001 m (observed zero).
- Lower-limb/hip sample vertices remain stationary during upper-only clips; upper-body samples remain stationary during lower-only clips (observed zero travel).
- Knee foot-joint motion remains sagittal: observed lateral drift zero, elevation 0.318269 m and backward travel 0.420107 m. The oblique view must not be mistaken for cross-body motion; a side render is included.
- Distal dominant-weight vertices prove movement for every digit, including each thumb. Semantic bone names alone are insufficient.
- Joint-neighborhood radius percentiles quantify local compression. They are **not** cross-section volume, collision checks or proof of no collapse. Observed radius P10 ratios around elbow/knee are approximately 0.80/0.78; visible creases remain.

### Remaining visible limitations

Shoulder elevation retains sharp underarm webbing; hip flexion has a fold, wrist flexion has a crease and closed palms compress. Thin separated fingers require anatomical/artist review. Original barrel-like torso and primitive muscle volumes remain. These limits are not accepted as production deformation quality.

Formal anatomical reference acceptance, artist retopology/painted weights/correctives, physical-device testing, muscle mapping, three-exercise pilot and 100-motion migration remain pending. The current application still uses v1.

## Reproduce and verify

Use the separately approved official Blender **5.2.4 LTS**, build `cd5dc428cce1`. A sandbox background launch previously crashed before Python; use the native-approved execution route, not another binary or a permission bypass.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python pipeline/character-v2/build_deformation.py
node scripts/character-v2-deformation-qa.mjs
node --test scripts/character-v2-deformation-qa.test.mjs
python3 -m unittest discover -s pipeline/tests -v
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
pnpm character:check
pnpm validate:preview
git diff --check
```

Two unchanged-source generator runs produced byte-identical GLB and both assembled review sheets. The `.blend` and 16 individual PNG byte hashes varied; no blanket byte-determinism claim is made. All 20 latest binary artifact hashes match the manifest.

The generator checks installed modifier RNA rather than assuming enum compatibility. High-level keyframe insertion/action-slot handling follows the [Blender 5.2.3 primary API examples](https://github.com/blender/blender/blob/v5.2.3/doc/python_api/rst/info_quickstart.rst); actual execution is pinned to and verified on 5.2.4. Direct 5.2 API website retrieval was unavailable during this unit.

Rollback removes only this new deformation generator/helper, its new tests/QA/document and `deformation/` outputs. Do not delete or regenerate `prototype/`, v1 assets, baseline inventory or exercise data.
