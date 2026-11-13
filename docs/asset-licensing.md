# Asset provenance and human approval

All current character, three motions, dumbbell and thumbnails are original Kimorel work dedicated to [CC0-1.0](asset-license-cc0.md). No third-party models, motions or code were incorporated. Generator/viewer software is MIT. All eight inventory records remain **needs-review**. Valid redistribution rights are not visual movement approval or clinical validation.

## Validation layers

- `pnpm validate:preview`: validate authoritative schemas, IDs/paths, references, regular files/no symlinks, inventory coverage, permissions, provenance and all three exported animation QA profiles. It permits pending review and prints every pending record. This is explicitly NOT a public release manifest.
- `pnpm validate:data`: performs those checks and refuses every unapproved asset. Approved records require a human review record and SHA256 matching the exact current bytes. This gate remains enabled in CI; it is expected to fail until review is completed.
- `pnpm assets:qa`: technical skeleton/skin/animation/contact/equipment checks, not human approval.

`assets/ASSET_LICENSES.json` is the inventory, not a list of released assets. Its schema is `assetManifestSchema` in `packages/schemas`. Every file has a stable ID, safe relative path, origin, creator, source/license evidence where applicable, license, modifications, commercial-use and redistribution flags, attribution and review status. Third-party work must provide source URL, license evidence and download date independently of any software repository license.

## Review locally

1. Regenerate and run all technical checks. Open `docs/reviews/*-contact-sheet.png`; verify the five phases, but do not approve from these images alone.
2. Run `nvm use && pnpm dev`. Inspect each exercise from front, side, back and orbit views at normal/slow speed. Check shoulder/pelvis/elbow deformation, limb intersections, hands/feet contact, prop grip, loop seam and camera framing. Check desktop/mobile, play/pause/restart/speed/loop, switching and reduced-motion behavior. Repeat switching and inspect GPU resource counts for growth.
3. Fix and regenerate any unacceptable asset, then repeat QA and visual review. Do not hide defects by changing tolerances.
4. Only after your review, change each accepted inventory record to `approved` and add `visualReview: { reviewer, date, sha256, notes }`. Use your real reviewer name, ISO date, output from `shasum -a 256 <asset-file>`, and specific review notes. Review the neutral character, equipment and thumbnails too. No approval command runs automatically.
5. Review educational metadata independently; set the exercise review status only if that review is actually completed. A clinical-review requirement needs a qualified reviewer, not this technical record.
6. Run `pnpm validate:data` and CI again. A later byte change invalidates its recorded approval hash. Do not publish previews as approved assets.

The source repository and local demo intentionally include clearly labeled, legally redistributable original development previews so contributors can perform the review. Inclusion in the source repository is not visual or clinical approval. Approved asset releases and production distributions must use only records admitted by the strict gate. No package publication or deployment is configured or authorized.

## Dedicated review interface

Enable **Visual review mode** in the demo. It reuses the same renderer/mixer and adds timeline, 30-fps stepping, camera presets, skeleton/grid toggles and a remembered pose. The exact current asset identity is shown from generated `packages/data/src/asset-review.json`. `pnpm assets:hashes` regenerates this file from actual bytes; production build and preview validation refuse stale identities. The display is a review aid, not a cryptographic verification of a remote server's cached response. Compare the downloaded bytes' SHA256 when reviewing a remote host.

Use the complete checklist in [reviews/README.md](reviews/README.md). New broad region labels change human GLB hashes even though geometry/motion are unchanged; inspect both neutral and highlighted views before approval. All current records remain pending. The review UI never approves or edits provenance.
