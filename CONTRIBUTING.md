# Contributing to Kimorel

Start with the [local setup](README.md#local-setup), then make one focused, tested change. Follow the public [architecture](docs/architecture/README.md) and [roadmap](docs/roadmap.md); propose architectural changes before implementing them.

## Code changes

Use strict TypeScript, English identifiers and UI copy, stable kebab-case IDs and small public APIs. Keep React/browser dependencies out of core, schemas and data. Preserve metadata/asset separation. Run `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm validate:data` and `pnpm build`. Add regression tests for behavior, not just snapshots. Use Conventional Commits; do not add AI attribution trailers.

## Browser and loader verification

After `nvm use` and `pnpm install --frozen-lockfile`:

```sh
pnpm exec playwright install chromium
pnpm test:browser
```

The pinned Playwright runner builds the production demo and a separate test-only consumer. It owns temporary loopback servers on `127.0.0.1:4175` and `127.0.0.1:4176` and shuts them down after the run; keep those ports free. No public deployment or external test service is used. Sandbox environments may require permission for downloads, browser execution and loopback listeners.

Tests load the real GLBs and renderer from the production build under `/kimorel/`, then exercise an independently hosted CORS asset base, missing/aborted requests and clip recovery. Unexpected page errors, console errors, failed requests and non-loopback network requests fail the suite. Intentional failure cases identify their exact asset URLs. Screenshots and renderer details are attached to the HTML report; traces are retained on failure. Open it with `pnpm exec playwright show-report`. Generated `playwright-report/`, `test-results/` and `.cache/` outputs are ignored.

Chromium uses **SwiftShader software WebGL2**, not a fake Scene or an automatic fallback that skips rendering assertions. Mobile projects emulate a viewport/touch device; they do not prove physical-device or hardware-GPU behavior. Screenshots are diagnostic evidence, not automatic visual or clinical approval. Lack of a working WebGL2 context fails the tests.

`pnpm test` also runs deferred-loader regressions with real Three.js resource objects and a mocked renderer boundary. They verify late-load/unmount callbacks, disposal and stale completion handling—not browser memory counters. `pnpm typecheck` includes browser/config/consumer sources. Keep browser evidence separate from exact-hash human asset approval and the unchanged strict release gate.

## Exercise metadata

Add an original English record to `packages/data/src/exercises.json`. Reuse canonical IDs across categories. The schema in `packages/schemas/src/index.ts` is authoritative; types are inferred rather than duplicated. Use `example: true`, `review.status: pending` and `animation: null` for illustrative metadata. Never invent a GLB path. Run metadata validation and tests. Translation records should reference stable IDs; do not represent machine-translated clinical guidance as reviewed.

## Animation submissions

Before submitting files, document creator, source URL, exact license evidence, download date, commercial/redistribution rights, modifications and attribution in `assets/ASSET_LICENSES.json`. Keep pending-review assets out of approved release manifests. Clearly labeled original development previews may be kept in the source repository for review; this is not movement approval. Do not commit unclear-rights files merely to request review; provide a source link first. Read [licensing](docs/asset-licensing.md) and [pipeline requirements](docs/animation-pipeline.md).

## Review

Maintainers review behavior, tests, accessibility, provenance and API boundaries. Visual review and appropriate qualified clinical review remain necessary before an exercise is approved. Automated checks cannot certify anatomical accuracy. Publication, deployment and package-name availability checks are separate maintainer actions; CI does not publish.
