# Review the exact generated assets

Run `pnpm assets:build`, `pnpm assets:preview`, `pnpm assets:qa` and `pnpm validate:preview`. Contact sheets show t=0,1,2,3,4 seconds: start, quarter-cycle, midpoint, three-quarter-cycle, return. `*-muscle-contact-sheet.png` adds metadata-driven primary coral and secondary amber. CPU flat lighting deliberately exposes facets; it is not the browser's smooth-material rendering.

## Local browser checklist

1. Run `nvm use && pnpm dev`, select each registered exercise and enable **Visual review mode**. Confirm the shown asset file, bytes and SHA256 match `shasum -a 256 assets/exercises/<id>.glb`. `pnpm build` refuses a stale generated hash manifest.
2. Confirm review starts paused. Test Play/Pause, Restart and 0.25×/0.5× speed. Scrub with pointer and keyboard to 0, 1, 2, 3 and 4 seconds; use Previous/Next frame (1/30 second) while paused. Bounds must clamp, not wrap. Remember a pose, change camera/time, and Recall pose.
3. Inspect front, side, back and three-quarter presets, orbit and reset. Horizontal push-up framing must stay centered. Toggle skeleton and ground grid; check joints, shoulder/elbow/hip/knee deformation, wrist alignment, palm/sole contact, intersections and dumbbell grip throughout the loop.
4. Toggle Muscle highlights. On push-up, chest/triceps must be strong coral and deltoids/abdominals pale amber; unmapped forearms must remain neutral on curl. Inspect back-leg regions and all region boundaries from behind. Colors must remain attached to the deforming mesh and switching exercises must update colors without stale highlights. Colors are not activation percentages.
5. Check desktop and narrow mobile viewports, keyboard controls and readable hash wrapping. With reduced motion enabled, initial autoplay must remain off. Explicit Play is still allowed. Background the tab/scroll offscreen and verify automatic frame work stops.
6. Switch all registered exercises repeatedly, enable/disable overlays and highlights, then unmount/remount. Inspect Console for errors and renderer resource counts for unbounded growth after cleanup. Component mocks and CPU QA do not establish GPU leak freedom.
7. Block a GLB request and reload: loading must become a meaningful asset error retaining original Console diagnostics, not a false WebGL capability claim. Unblock and reload. Check no stale pose, timer or error survives exercise switching.

## Formal human checklist

Record observations for anatomical plausibility, movement recognition, stable contact, equipment grip, deformation/intersections, camera framing, loop seam, region boundary plausibility and license provenance. Record browser/device and exact SHA256. Inspect neutral character, equipment and thumbnail records as well. Follow `docs/asset-licensing.md` only after explicit human review; no UI action writes an approval. Clinical review is a separate qualified process.

## Supported and elevated previews

For bench/box/wall exercises, inspect seat/back/rear-foot contact, actual support height, body/prop intersections and step clearance through the entire path, not just the five sheet samples. Confirm floor-press and fly are distinct elbow/shoulder paths; kickback should retain its authored upper-arm position while the elbow extends. Current 50 previews include five explicit static holds. Exact-hash human approval remains required for all 105 asset records, including the three new standalone props.
