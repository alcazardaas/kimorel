# Four anatomical draft surface masks

An isolated catalog variant now proposes left/right deltoid and biceps brachii coverage on the frozen corrective mesh. These are **pending anatomical surface approximations**, not approved muscle boundaries, activation maps or shipping assets. The original empty catalog and all body files remain unchanged.

## Inspect first

1. Open `pipeline/character-v2/muscles-upper-arm-draft/inspection.svg`: front, back, both sides, oblique and shoulder/arm closeup. Four colors identify four masks; intensity is coverage weight, not recruitment. Existing underarm geometry artifacts are deliberately retained.
2. Edit `regions.json` in that directory. Longitudinal values are fractions of shoulder-to-elbow length; angular values describe surface contours around that axis. Zero degrees is anterior (+Z); 90 degrees is lateral for each side.
3. Run `node scripts/character-v2-upper-arm-masks.mjs` for read-only recomputation. `--write` exclusively creates all new output files and refuses existing outputs. It is intended for a fresh isolated output set, not automatic overwriting.
4. Validate the committed variant with `node scripts/character-v2-muscles-qa.mjs pipeline/character-v2/muscles-upper-arm-draft/catalog.json`.

The generator is source-native Node/ThreeJS geometry processing and SVG projection. No Blender, downloaded anatomy artwork, external models or new dependencies are used. SVG triangles come from the actual frozen mesh, with back-face culling, opaque depth-sorted triangles, normal-based shading and clipped panel drawing areas. Opaque same-color edge coverage prevents antialias cracks from showing hidden colored surfaces. It is a technical surface visualization, not a raster illustration or anatomical simulation.

## Evidence versus authored interpretation

| Source-supported anatomy                                                                                                                           | Authored approximation, requiring review                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Deltoid forms the rounded triangular shoulder contour, with clavicular/acromial/scapular origins converging toward the humeral deltoid tuberosity. | Contour knots, angular widths and distal taper on this simplified mesh. Bony attachment landmarks are not verified.         |
| Deltoid is superficial to shoulder-joint structures and proximal biceps tendons.                                                                   | A shoulder-cap patch excluding medial axilla and chest, not individual heads or a dissected volume.                         |
| Biceps brachii lies anterior in the arm, superficial to brachialis; proximal anatomy overlaps other structures.                                    | Conservative exposed belly patch only. No proximal origins, tendons, aponeurosis, separate heads or elbow/forearm painting. |

References: [Elsevier deltoid](https://www.elsevier.com/resources/anatomy/muscular-system/muscles-of-upper-limb-left/deltoid-muscle-left/19926), [Elsevier biceps](https://www.elsevier.com/resources/anatomy/muscular-system/muscles-of-upper-limb-left/biceps-brachii-muscle-left/22937), [Manipal anatomical specimen](https://mapkmc.manipal.edu/specimen/anat145/). Specific supported claims and exclusions are recorded in `provenance.json`. No reference images, wording passages or mesh data are copied into outputs.

“Superficial” supports an external-region candidate; it does not mean an entire muscle is visible through skin or that this model reproduces anatomical borders. No activation roles are authored. The 21 inherited legacy concepts remain unknown semantic concepts; four separate pending identities are added only in the variant.

## Method and safeguards

Curved knot interpolation defines tapering longitudinal/angular envelopes rather than boxes. Radial and anatomical-side guards exclude the torso and remote limbs. Feathered positive weights are evaluated on actual indexed vertices. Mesh adjacency selects the largest connected candidate patch; discarded vertices are reported, never hidden. All four current candidates already consist of one component, with zero discarded vertices. Bone centers provide coordinates only: bone skin weights do not select the muscles.

The exact character hash is `61e83ec439d3e04deeec2cd5da771181044bfaae3e75dcea75ec3b8342c9c587`; mesh0/primitive0 has26,939vertices. GLTFLoader verifies an identity mesh world transform before local positions are interpreted. Each canonical payload binds character/hash/catalog/version/side/identity/domain and its SHA is recorded in the variant. Existing shared Float32 support validation applies.

Left is anatomical left (+X), not the viewer's left in the front panel. Bilateral controls are mirrored initial proposals; resulting vertex counts need not match because mesh sampling differs. The controls are engineering parameters, not population measurements.

## Verification and limits

Focused tests independently check anatomical-side coordinates, conservative longitudinal/angular support, nonempty feathered weights, one connected patch, canonical repeat against saved outputs, and strict catalog bindings. Negative cases cover opposite side, remote limb support, broad circumferential spill, disconnected islands, stale hash/domain/side. These geometric gates cannot prove anatomical accuracy.

Qualified anatomy/artist review remains required for cap boundaries, biceps exposure, overlap and taper. Skin is not a muscle atlas; the mesh lacks verified bony landmarks, and underarm webbing remains. No clinical acceptance, recruitment estimate, device-performance acceptance, runtime rendering, exercise pilot or 100-exercise migration is implied.

Rollback removes only the new variant directory, four masks, generator/tests and this document. Existing catalogs/assets/generators/default UI remain byte-exact. A partial exclusive build may leave already-created new outputs; inspect and remove only that new draft set before a deliberate rebuild. No automatic cleanup or overwrite is performed.

The four generated payloads and generated variant catalog are explicitly excluded from Prettier: payload bytes use the existing shared canonical serializer and are SHA-bound by the catalog. Reformatting would break canonical repeat proof. Authored controls, provenance, source, tests and this document remain formatted normally; no shared serializer change is made.
