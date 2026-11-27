---
name: web-design-guidelines
description: 'Trigger: UI review, accessibility, playback controls, touch and reduced motion. Audit Kimorel interfaces.'
license: MIT
metadata:
  author: 'Vercel; Kimorel contributors'
  version: '1.0.0-kimorel'
---

## Activation Contract

Load for ui review, accessibility, playback controls, touch and reduced motion. Apply the local adoption policy before consulting historical examples.

## Hard Rules

- Use bundled local guidance only; do not fetch changing review instructions or install suggested packages.
- Treat guidelines as review heuristics, not WCAG certification or authority to redesign the app. Preserve established copy, framework and product behavior.
- Prefer native button/link/input semantics. Native controls already implement keyboard activation; do not add duplicate key handlers.
- Preserve zoom and focus visibility; provide keyboard alternatives to canvas gestures and meaningful loading/error feedback.
- Honor reduced motion and explicit playback controls. Do not claim physical-device or assistive-technology proof from static inspection.

## Decision Gates

| Finding                              | Required action                                                            |
| ------------------------------------ | -------------------------------------------------------------------------- |
| Observable accessibility defect      | Cite exact file/line and user impact; propose a minimal fix.               |
| Generic style/performance preference | Check project context; label advisory rather than mandatory.               |
| Conflicting upstream rules           | Prefer semantic correctness and existing requirements; report uncertainty. |

## Execution Steps

1. Inspect the requested UI and bundled guideline sections relevant to it.
2. Review labels, accessible names, focus order, pause/speed/scrub controls, keyboard operation, touch targets, zoom and reduced motion.
3. Check loading, failure, empty and long-content states; do not mandate virtualization, URL state or new dependencies from a generic threshold alone.
4. Distinguish source inspection from executed keyboard/browser/assistive-tech checks. Do not claim all guidelines passed when coverage is partial.

## Output Contract

Return changed paths, exact checks and observed outcomes, pending evidence, and rollback scope. Separate measured facts from assumptions; do not claim safety or approval from a skill.

## References

- [Adoption policy](../README.md)
- [Pinned upstream skill](../_sources/web-design-guidelines.txt)
- [Bundled guideline snapshot](../_sources/web-interface-guidelines.txt)
