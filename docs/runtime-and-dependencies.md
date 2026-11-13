# Runtime and dependency selection

Verification date: 2026-11-13. Exact direct pins are in the package manifests. npm registry and official project sources were consulted; cached registry metadata was used when a live endpoint was inaccessible. No claim is made that every tool pin is the latest release.

| Dependency          | Selected | Rationale / evidence                                                                                                                                                                                 |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node                | 26.13.1  | Latest Node 26 LTS Lithium entry in [official index](https://nodejs.org/dist/index.json), 2026-11-10                                                                                                 |
| pnpm                | 10.15.0  | Existing stable installation, compatible with Node 26; [registry](https://registry.npmjs.org/pnpm/10.15.0). Latest researched is 12.18.0; no need to adopt a package-manager major during foundation |
| React / React DOM   | 19.3.1   | [Official registry](https://registry.npmjs.org/react/latest) stable tag; aligned renderer versions                                                                                                   |
| Three.js            | 0.187.0  | [Official registry](https://registry.npmjs.org/three/latest), MIT                                                                                                                                    |
| React Three Fiber   | 9.8.2    | [Official release](https://github.com/pmndrs/react-three-fiber/releases/tag/v9.8.2); v9 peers React >=19 <19.4 and Three >=0.156                                                                     |
| Vite                | 8.3.8    | [Official npm versions](https://www.npmjs.com/package/vite?activeTab=versions); Node >=22.12 branch includes 26                                                                                      |
| Vitest              | 5.1.0    | [Official registry](https://registry.npmjs.org/vitest/latest), peers Vite 6.4/7/8 and Node 22.12/24/26                                                                                               |
| TypeScript          | 5.9.3    | Deliberately conservative compiler pin for typescript-eslint compatibility, rather than native TS 7.0.2 latest                                                                                       |
| ESLint / @eslint/js | 9.39.5   | Compatible flat-config line, exact cached tarball evidence; newer ESLint 10 exists                                                                                                                   |
| typescript-eslint   | 8.71.1   | Exact cached package evidence; compatible TypeScript 5.9 line                                                                                                                                        |
| Prettier            | 3.9.6    | Exact cached package metadata                                                                                                                                                                        |
| Zod                 | 4.5.2    | Confirmed cached official-registry metadata; newer 4.6 releases discovered but not fully verified                                                                                                    |

React Three Fiber compatibility and `frameloop="demand"` were checked against [official documentation](https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/scaling-performance.mdx). The static scene avoids animation loops and unnecessary GPU activity. React's major version must match Fiber's renderer expectations; do not upgrade either independently.

Other exact tooling pins (React Testing Library, jsdom and type declarations) are in root `package.json`. Frozen installation, typechecking, tests and production build pass on the selected runtime. The selected `@types/three` version is slightly older than Three's runtime, so these checks remain important when upgrading. The first-commit audit inspected installed dependency license metadata; it is not a security vulnerability audit or a substitute for retaining each dependency's license notices.

## Reproducibility boundary

CI obtains Node from `.nvmrc` and pnpm from `packageManager`. `engine-strict` rejects the wrong runtime, `save-exact` avoids new floating direct dependencies, and CI uses `--frozen-lockfile`. A generated lockfile must be produced by successful dependency resolution; it must never be hand-authored to disguise blocked registry access.

The table above records original selection rationale, not an ongoing guarantee of latest releases. Browser/GPU behavior and a network-backed dependency vulnerability audit remain unverified.
