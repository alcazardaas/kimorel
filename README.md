# Kimorel

**Human movement, openly animated.** An open-source foundation for reusable 3D exercise visualization, with no CMS, backend, account, paid API or subscription.

Fifty original exercise previews share one rigged human and metadata-driven playback, including standing, seated, dumbbell and floor movements with reusable bench, box and wall props. **Visual/browser approval is pending; no clinical validation is claimed.** The long-term goal is 100 unique validated movements; 50 technical previews are implemented, with 75/100 staged targets.

## Local setup

Install [nvm](https://github.com/nvm-sh/nvm) and Git. A modern WebGL2-capable browser is needed for the preview; exercise text remains available without WebGL.

```bash
nvm install
nvm use
npm install --global pnpm@10.15.0
pnpm install
pnpm dev
```

Open the local URL printed by Vite. `pnpm dev` builds package exports first, so it works without a previous build. When changing package source, rerun `pnpm build:packages` (or restart `pnpm dev`). No cloud keys, Blender or Python dependencies are required for Milestone 0.

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm validate:preview
pnpm validate:data # strict release gate: intentionally fails until human approval
pnpm build
```

`pnpm format` fixes formatting. The static site output is `apps/demo/dist`; serve it with any static HTTP server. Assets are not downloaded at build or runtime.

> Current automated checks run on Node 26.13.1. Assets stay `needs-review` and the strict approval gate intentionally rejects release until human review.

## Packages

| Path               | Responsibility                                                              |
| ------------------ | --------------------------------------------------------------------------- |
| `packages/schemas` | Authoritative Zod schemas, inferred types and stable taxonomies             |
| `packages/core`    | Framework-independent lookup, filtering and self-hosted asset URL utilities |
| `packages/data`    | Validated exercise registry and versioned JSON export                       |
| `packages/react`   | GLB viewer, playback, orbit/reset and loading/error handling                |
| `apps/demo`        | Static React/Vite catalog and accessible exercise details                   |
| `assets`           | Separate source/generated resources and asset provenance registry           |
| `pipeline`         | Original mesh/motion generator, CPU preview and optional Blender bridge     |

Each library emits ESM JavaScript, declarations and source maps into `dist`. Direct dependencies are exact pins; workspace imports use `workspace:*`. Packages are not published yet. Development uses workspace links, not an npm installation command that assumes publication.

```tsx
import { ExerciseViewer } from '@kimorel/react';

const viewer = (
  <ExerciseViewer
    exercise="bodyweight-squat"
    assetBaseUrl="/assets"
    autoPlay
    loop
    controls
  />
);
```

The viewer resolves stable IDs through the bundled metadata catalog and also accepts an `Exercise` object for host-owned metadata. This intentionally extends the M0 host-only API; core remains framework-independent. Asset URLs are resolved from metadata beneath the host's base URL. Play/pause/restart, speed, loop, timeline scrubbing, camera presets, orbit/zoom and reset are real controls over the loaded GLB, not a placeholder animation. Timeline and camera presets are available without review mode; frame stepping, pose bookmarks, skeleton and grid toggles remain review-only. Viewer buttons do not submit a surrounding host form. GLB bytes stay outside JavaScript and npm package exports. The demo copies its registry-defined, independently cacheable preview assets during build. Reduced-motion preferences disable autoplay; hidden/offscreen viewers pause rendering.

## Documentation and contributing

Start with [architecture](docs/architecture/README.md), [roadmap](docs/roadmap.md), [animation production](docs/animation-pipeline.md) and [asset licensing](docs/asset-licensing.md). The demo has a bundled static documentation overview at `/docs/`. Follow [CONTRIBUTING.md](CONTRIBUTING.md) for changes and [SECURITY.md](SECURITY.md) for vulnerability reports.

## Licensing

Original software is [MIT](LICENSE). Original example metadata in `packages/data/src/exercises.json` is dedicated under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Original human, motion and equipment assets are dedicated to CC0 in [asset dedication](docs/asset-license-cc0.md). No third-party 3D or motion assets are included. Dependencies retain their own licenses; third-party assets must never be relabeled CC0.

A source preview is not an approved asset release.
