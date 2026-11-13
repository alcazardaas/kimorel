# First Kimorel character

## Decision

Use **Kimorel neutral human v1**, an original, continuous skinned surface generated from the editable anatomical recipe in `pipeline/character/build.py`. Geometry and original motion are dedicated to CC0-1.0; generator/viewer code remains MIT. No third-party character, motion, texture or code was incorporated.

This is a deliberately stylized neutral human, not an anatomical atlas. It has shaped pelvis, waist, ribcage, neck, head, tapered limbs, hands and feet. Marching tetrahedra joins the shape into one indexed surface; glTF skin weights deform the mesh through an actual 18-joint skeleton. The viewer does not animate procedural primitives. Visual quality must still be reviewed; the character is original Kimorel work.

## Character contract and tradeoffs

- One original, indexed surface has 8,200 vertices and 16,396 triangles.
- One consistent 18-joint skeleton supports all three current exercises.
- The editable recipe defines proportions, skin weights and stable bone names.
- Geometry, motion and equipment are original work; permissions are recorded in [asset licensing](../asset-licensing.md).
- Neutral materials and no textures keep the character portable and inexpensive to load.

The stylized surface is deliberately simple. Its topology and approximate educational regions do not establish anatomical accuracy. Shoulder, pelvis and elbow deformation, contact plausibility and motion quality require human visual review. Future topology changes must retain the rig contract or document a versioned compatibility change.

## Ownership and review boundary

No third-party character, motion, texture or source code was incorporated into the original asset generator. Runtime and development dependencies retain their own licenses and notices. Any future external code or asset contribution must provide its own provenance and preserve applicable license obligations.

Source permissions, exported-file QA, human visual approval and clinical review remain separate decisions. Do not treat a passing technical check as permission to approve an asset.

## Reproduction and limitations

```bash
python3 pipeline/character/build.py
node scripts/glb-qa.mjs
python3 -m unittest discover -s pipeline/tests -v
```

The shared generator authors four-second squat, push-up and curl keyframe cycles at 30 samples/second. Sagittal leg IK keeps squat ankles fixed; reusable 3D IK maintains push-up wrists while the straight trunk pivots around fixed ankles. Curl props follow stable hand grips. This is original keyframe motion, not captured or clinically validated movement.

**Deviation:** Blender is not installed in the execution environment. The actual GLB is produced directly using documented glTF skin/animation structures, rather than Blender's exporter. `pipeline/character/export_blender.py` imports it into editable Blender form; that optional bridge was not executed. Do not claim a `.blend` source or Blender validation exists until it is run. The Python recipe is the editable authoritative source today.

### CPU skin review

The original-mesh contact sheet exposed thigh vertices incorrectly assigned to arm regions by a broad X threshold. The region gate was narrowed and low ankle/sole vertices explicitly weighted to the foot. This is why skeleton-contact QA alone is insufficient. Review the regenerated actual skin, not only joint trajectories. Browser lighting and full-cycle visual approval remain separate.
