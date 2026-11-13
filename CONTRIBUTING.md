# Contributing to Kimorel

Start with the [local setup](README.md#local-setup), then make one focused, tested change. Follow the public [architecture](docs/architecture/README.md) and [roadmap](docs/roadmap.md); propose architectural changes before implementing them.

## Code changes

Use strict TypeScript, English identifiers and UI copy, stable kebab-case IDs and small public APIs. Keep React/browser dependencies out of core, schemas and data. Preserve metadata/asset separation. Run `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm validate:data` and `pnpm build`. Add regression tests for behavior, not just snapshots. Use Conventional Commits; do not add AI attribution trailers.

## Exercise metadata

Add an original English record to `packages/data/src/exercises.json`. Reuse canonical IDs across categories. The schema in `packages/schemas/src/index.ts` is authoritative; types are inferred rather than duplicated. Use `example: true`, `review.status: pending` and `animation: null` for illustrative metadata. Never invent a GLB path. Run metadata validation and tests. Translation records should reference stable IDs; do not represent machine-translated clinical guidance as reviewed.

## Animation submissions

Before submitting files, document creator, source URL, exact license evidence, download date, commercial/redistribution rights, modifications and attribution in `assets/ASSET_LICENSES.json`. Keep pending-review assets out of approved release manifests. Clearly labeled original development previews may be kept in the source repository for review; this is not movement approval. Do not commit unclear-rights files merely to request review; provide a source link first. Read [licensing](docs/asset-licensing.md) and [pipeline requirements](docs/animation-pipeline.md).

## Review

Maintainers review behavior, tests, accessibility, provenance and API boundaries. Visual review and appropriate qualified clinical review remain necessary before an exercise is approved. Automated checks cannot certify anatomical accuracy. Publication, deployment and package-name availability checks are separate maintainer actions; CI does not publish.
