# Kimorel skeleton v1

## Contract

- glTF coordinates: right-handed, +Y up, +Z forward, meters. Height about 1.86m.
- Rest pose: relaxed A-pose, feet flat, knees nearly straight; no baked object scale.
- Root remains at world origin. Pelvis translation is in-place exercise motion, not locomotion.
- Identity bone rest rotations; translations define each joint. Do not assume bone local Y points along a limb when retargeting.
- Lowercase stable names with `left_` / `right_`, character's anatomical left/right.
- Clip `rep`: one complete cycle, four seconds, 30Hz, linear keyframe interpolation. Endpoints match.

```text
root
└─ pelvis
   ├─ spine → chest → neck → head
   │            ├─ left_upper_arm → left_forearm → left_hand
   │            └─ right_upper_arm → right_forearm → right_hand
   ├─ left_thigh → left_shin → left_foot
   └─ right_thigh → right_shin → right_foot
```

The chest is the parent of both upper arms. Hand joints are future equipment attachment anchors; foot joints are ankle/contact anchors. Future equipment should use documented grip offsets, not exercise-specific runtime branches. Finger animation and toe articulation are absent in v1.

Squat constraints: fixed ankles, two-bone sagittal leg solve with positive knee flexion, no root translation, smooth pelvis cycle and moderate torso lean. These are authoring constraints, not medical joint limits. Anatomical review and additional constraints are required for other movements.

## Files and export

`pipeline/character/build.py` contains editable proportions, surface recipe, parent hierarchy, skinning and motion keys. It writes `assets/characters/neutral-human.glb` (rest character) and `assets/exercises/bodyweight-squat.glb` (same rig/mesh plus `rep`). No external buffers, textures or runtime network services are needed. Keep regeneration and both exports together when changing the rig.

The optional Blender bridge imports the generated GLB and saves a `.blend`; Blender maps glTF axes on import. Preserve object/bone names and clip name. Re-export as GLB with skins and animations, meters, no external textures, and run exported-file QA again. Blender re-export is not bitwise deterministic and has not been tested here.

Muscle highlighting is not implemented. Future region masks can be authored on this neutral surface independently of exercise IDs; skinning territories alone are not medically precise activation maps.

## Three-exercise compatibility update

The 18 joint names, parent hierarchy, meter scale, rest pose and mesh topology are unchanged. Terminal hand influence now follows the hand/forearm direction rather than an arbitrary upward ray. Distal palms are rigidly hand-bound so stationary wrist targets do not hide moving contact skin; shoulder vertices blend with chest. Existing v1 assets must be regenerated together because weights changed, but bone-track compatibility is preserved.

`motions.py` is the shared quaternion/kinematics layer. Push-up uses fixed wrist targets with reachable IK and a straight trunk; curl uses elbow flexion with a stable shoulder. `left_hand_grip` / `right_hand_grip` are non-joint attachment nodes at anatomical signed X offset 0.02m, Y -0.055m, Z 0.005m from the hand. Dumbbell geometry is centered on its grip, handle along X; repeated props share one mesh/material. Standalone `assets/equipment/dumbbell.glb` contains no unused character data.

Eighteen joints suffice for these stylized squat/push-up/curl previews. They are NOT a complete physiotherapy rig: no clavicle/scapula articulation, forearm twist distribution, finger grip, toe joints or detailed spinal segmentation. Shoulder rotation and future rehab motions need a concrete deformation/kinematics audit before deciding whether a versioned rig extension is necessary. Do not infer anatomical fidelity from a bone count.

Camera target and position are optional validated metadata, applied by the generic viewer and reset control. Horizontal exercises do not select an exercise-specific renderer. Muscle-region highlighting remains unimplemented; it requires reviewed surface masks rather than pretending skinning territories are precise muscle activation regions.
