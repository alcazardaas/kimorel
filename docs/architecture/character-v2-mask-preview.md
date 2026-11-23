# Inspect draft masks in motion

This separate development page loads the frozen experimental body and four anatomical surface proposals. It does not alter the default catalog, public viewer API or any asset. **Anatomical review remains pending; coverage colors are not muscle activation.**

## Run explicitly

```sh
pnpm build:packages
pnpm exec vite --config vite.mask-preview.config.ts
```

Open `http://127.0.0.1:4177/`. Select a mask, orbit the body, scrub a stress clip or play at a slower speed. “Neutral surface” removes color, not animation. Reset camera restores the initial oblique view. Seven clips are engineering stress poses, not prescribed exercise ranges.

The application starts paused. A persistent draft badge and error states stay visible. The optional diagnostics report actual sampled skinned-vertex displacement and baked corrective morph influence; they do not certify deformation quality. Shoulder/hip corrections remain experimental, and existing underarm/palm/hip limitations remain visible.

## Identity and ownership

- The private loader verifies exact variant catalog SHA256, exact frozen GLB SHA256 and all four bound payload hashes before constructing the scene. Full existing draft schemas validate metadata and sparse payloads. Mesh0/primitive0 must have26,939vertices and an identity world transform.
- The server exposes six fixed draft endpoints only: catalog, GLB and four payloads. Unknown paths, queries, encoded traversal, backslashes and non-GET/HEAD methods are refused. Existing real directories and regular files are required; symlinks are refused. This is a loopback development server, not a production security boundary.
- Color attributes are indexed in bind space. Standard ThreeJS skinning and exported morph channels carry them with the surface; no geometry positions or canonical data are rewritten. Strongest coverage wins overlaps, with stable catalog order for ties. This is display composition, not recruitment summation.
- Each mount owns its loaded scene, mixer, geometry/materials, skeleton, orbit controls, renderer, animation frame and resize observer. Cancellation aborts fetches; late parsed scenes are disposed. Unmount cancels animation and releases owned resources. No global asset cache is used.
- Existing internal playback/disposal helpers are reused without changes. No new package exports, runtime routes, dependencies, production-build inputs or default navigation links are introduced.

ThreeJS primary references: [SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html), [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html). The actual pinned implementation is checked through TypeScript and real browser execution.

## Check this unit

```sh
pnpm exec vitest run apps/mask-preview/src/masks.test.ts
pnpm exec tsc -p apps/mask-preview/tsconfig.json
pnpm exec playwright test --config playwright.mask-preview.config.ts
```

The dedicated Chromium suite uses real WebGL with the existing software GPU setup on desktop/mobile viewports. It captures shoulder/all-mask screenshots, exercises selection/play/pause/scrub/speed, verifies actual deformation/morph diagnostics and neutral return, rejects corrupted payloads and checks endpoint restrictions/no external requests. Existing browsers must already be installed; no installation is part of this unit.

Unit tests load the real GLB and payloads, verify selected color support and neutral restoration, reject hash/domain/request/cancellation errors, and compare an actual masked vertex with morph on/off during bone motion. Browser screenshots and these tests are engineering evidence, not anatomy/artist approval or device-performance acceptance.

Rollback removes only the12new preview source/config/test/doc paths. The default demo, four canonical masks, source controls/provenance, frozen body and100v1exercises remain byte-exact. This is not an exercise pilot or100-exercise character migration.
