# Foundation architecture

Kimorel is a static-first pnpm workspace. Nothing requires a backend, CMS, subscription or external runtime API.

## Dependency direction

```text
schemas (Zod + inferred contracts)
  ↑ core (framework-independent utilities)
  ↑ data (validated JSON examples)
core + data ← react (React + R3F; ID lookup or host metadata)
data + react ← demo (Vite static application)
```

`core` deliberately re-exports inferred schema types and taxonomies to avoid a second manually maintained contract. This means it depends on schemas/Zod, but not React or DOM. The schemas package remains the single source of truth. Generating JSON Schema is deferred until a non-TypeScript consumer needs it.

## Data and rendering

The data package validates its JSON registry, including unique IDs/slugs, enums, instructions, schema version and review state. It exports lookup/filter functions and a selective `@kimorel/data/exercises.json` subpath. Metadata is original CC0, pending review and explicitly illustrative. `animation: null` is a real unavailable state, not an invented URL.

The viewer accepts a stable exercise ID or a host-supplied `Exercise`. ID lookup imports metadata, never GLB bytes. The scene/Three stack remains lazy-loaded. Each mounted viewer owns its loaded scene, mixer and resources; stale asynchronous results are disposed. URL/clip changes remount the scene, while unrelated rerenders do not reset playback. Play/pause/restart, looping, speed and camera orbit/reset are implemented. Review mode adds scrubbing, frame stepping, camera presets and skeleton/grid overlays. Metadata-driven broad muscle highlights use exported skinned vertex labels; see [region architecture](muscle-regions.md). Rendering is demand-driven and suspended while hidden/offscreen. Reduced-motion disables autoplay.

`resolveAssetUrl` resolves validated relative paths under a caller-owned absolute HTTP(S) asset base. No Kimorel-hosted URLs are assumed. Asset files are never automatically bundled into the data package.

## Build and tooling

Each package emits ESM/declarations through TypeScript. pnpm builds dependencies topologically before the demo. Vite performs JSX transformation without a React-specific plugin to avoid an unnecessary dependency; Fast Refresh is consequently not configured. Unit/component tests use Vitest and React Testing Library; mocked component tests do not prove WebGL rendering.

The demo documentation page is a small static HTML overview from `docs/index.html`, served in development and copied into production. Markdown remains the detailed source documentation. A documentation framework is unnecessary at this scope.

## Production boundaries

The original editable character/motion recipe lives in `pipeline/character`; generated rest/animated GLBs and thumbnail are under `assets`. Provenance validation rejects unknown files and unapproved exercise references, then checks the exported GLB. Original files currently remain needs-review; licensing rights do not imply visual approval. Python standard-library tests run without dependencies; pytest/Ruff development pins and CI are configured. The optional Blender import/save bridge has not been executed. See [character decision](character-selection.md) and [skeleton](skeleton.md).

CI reads `.nvmrc` and `packageManager`, installs with a frozen lockfile, and runs the checks. Its strict asset gate currently fails because all original previews still need human approval; later steps cannot be described as passing CI until that gate is satisfied. There is no publication workflow. Before a real release: finish browser/visual validation, confirm dependency license obligations, review package exports, approve exact asset hashes, verify names/trademarks, benchmark assets, and perform a maintainer-controlled release.
