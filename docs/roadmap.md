# Roadmap

Quality and traceability come before catalog size. Implemented previews are not approved asset releases.

| Milestone | Outcome                                                                            | Current status                                                                                                    |
| --------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 0         | Reproducible workspace, typed metadata, tests, CI and docs                         | Implemented; local lint, types, tests and build pass                                                              |
| 1         | One approved character, one real GLB exercise, loader/playback and camera controls | Technical implementation present; human visual approval and browser/mobile/GPU evidence pending                   |
| 2         | Three reusable exercises, manifests, muscle mapping and switching                  | Technical implementation present, including fourteen broad muscle regions and review controls; acceptance pending |
| 3         | Deterministic motion normalization, retargeting, Blender export and QA             | Shared deterministic original-motion exporter and QA present; general retargeting/Blender workflow deferred       |
| 4         | First reviewed movement catalog                                                    | Fifty-four technical previews implemented; exact-asset human acceptance remains pending                           |
| 5         | Public packages, approved assets and static deployment                             | Deferred                                                                                                          |
| 6         | Expand to 25, 50, 75 and 100 unique movements                                      | 54 implemented; 75/100 planned, not present in the runtime registry                                               |

## Current implementation

Fifty original animated previews share one canonical character and rig. The original squat, push-up and curl are joined by lateral raise, Romanian deadlift, reverse lunge, calf raise, front raise, bent-over row, glute bridge, bird dog, dead bug and side-lying hip abduction. The next twelve add split squat, lateral lunge, standing hip extension, forearm plank, side plank, quadruped hip extension, fire hydrant, cat-cow, prone hamstring curl, supine heel slide, side-lying clamshell and reverse crunch. The two planks are genuine static hold clips. The viewer supports playback, camera presets, pose comparison and approximate muscle-region highlighting. The demo provides combined category, equipment and muscle filters; filtering keeps the current viewer selection until another movement is chosen.

The milestone-50 additions include hip/trunk mobility, seated knee/calf work, sit-to-stand, step-up, rear-foot-elevated squat, wall and hollow-body holds, unilateral bridge/hinge and floor dumbbell presses/flys/kickbacks. Original reusable bench, box and wall assets provide actual support surfaces. The catalog remains 50 implemented records, not 100 placeholders; future shoulder/bar/band/hanging/cervical capabilities are still planned.

## Next acceptance steps

1. Review each exact-hash asset from all camera views, including deformation, contacts, equipment grip and loop seams.
2. Record live desktop/mobile WebGL, reduced-motion, keyboard, cleanup and self-hosted asset-base evidence.
3. Record explicit human approval only after review; all 105 asset records remain `needs-review`. Then rerun strict release validation.
4. Keep qualified clinical review separate from technical QA and visual approval; educational previews are not clinical guidance.

See [validation evidence](validation.md) and [asset licensing](asset-licensing.md). The specification's 100 category slots are not necessarily 100 unique exercises. Normalize canonical IDs before expanding; never duplicate movements to satisfy category totals.

The upper-quarter capability pilot adds four previews (shoulder press, wrist curl, reverse wrist curl and serratus punch) without changing the original fifty assets. Remaining 46 IDs are planned, not placeholders in the runtime registry.
