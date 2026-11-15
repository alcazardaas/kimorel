# Roadmap

Quality and traceability come before catalog size. Implemented previews are not approved asset releases.

| Milestone | Outcome                                                                            | Current status                                                                                                    |
| --------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 0         | Reproducible workspace, typed metadata, tests, CI and docs                         | Implemented; local lint, types, tests and build pass                                                              |
| 1         | One approved character, one real GLB exercise, loader/playback and camera controls | Technical implementation present; human visual approval and browser/mobile/GPU evidence pending                   |
| 2         | Three reusable exercises, manifests, muscle mapping and switching                  | Technical implementation present, including thirteen broad muscle regions and review controls; acceptance pending |
| 3         | Deterministic motion normalization, retargeting, Blender export and QA             | Shared deterministic original-motion exporter and QA present; general retargeting/Blender workflow deferred       |
| 4         | First reviewed movement catalog                                                    | Thirteen technical previews implemented; exact-asset human acceptance remains pending                             |
| 5         | Public packages, approved assets and static deployment                             | Deferred                                                                                                          |
| 6         | Expand to 25, 50, 75 and 100 unique movements                                      | Deferred                                                                                                          |

## Current implementation

Thirteen original animated previews share one canonical character and rig. The original squat, push-up and curl are joined by lateral raise, Romanian deadlift, reverse lunge, calf raise, front raise, bent-over row, glute bridge, bird dog, dead bug and side-lying hip abduction. The viewer supports playback, camera presets, pose comparison and approximate muscle-region highlighting. The demo provides combined category, equipment and muscle filters; filtering keeps the current viewer selection until another movement is chosen.

## Next acceptance steps

1. Review each exact-hash asset from all camera views, including deformation, contacts, equipment grip and loop seams.
2. Record live desktop/mobile WebGL, reduced-motion, keyboard, cleanup and self-hosted asset-base evidence.
3. Record explicit human approval only after review; all 28 asset records remain `needs-review`. Then rerun strict release validation.
4. Keep qualified clinical review separate from technical QA and visual approval before expanding the catalog.

See [validation evidence](validation.md) and [asset licensing](asset-licensing.md). The specification's 100 category slots are not necessarily 100 unique exercises. Normalize canonical IDs before expanding; never duplicate movements to satisfy category totals.
