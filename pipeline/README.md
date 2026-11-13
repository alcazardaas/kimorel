# Original character and three-exercise workflow

The authoritative editable source is `character/build.py`: original anatomical surface recipe, v1 rig, skinning and equipment; `character/motions.py` holds reusable motion math and three clips. Python 3.9+ standard library is enough to regenerate the character, equipment and three exercise GLBs; no motion-capture package, motion pack or Blender is required for this authoring route.

```bash
python3 pipeline/character/build.py
python3 pipeline/character/preview.py
pnpm assets:qa
python3 -m unittest discover -s pipeline/tests -v
```

The CPU preview writes an actual skinned-mesh contact sheet for each exercise to `docs/reviews/*-contact-sheet.png` (five phases) and thumbnails to `assets/thumbnails/`. It does not substitute for real-browser or Blender review.

## Optional Python development tools

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r pipeline/requirements-dev.txt
.venv/bin/python -m pytest
.venv/bin/python -m ruff check pipeline
```

[pytest 8.4.2](https://pypi.org/project/pytest/8.4.2/) and [Ruff 0.14.5](https://pypi.org/project/ruff/0.14.5/) are stable exact pins verified through PyPI, chosen to support Python 3.9. They are development-only, not generator dependencies. The execution environment lacks both packages and installation was unsuccessful in the restricted environment; CI installs them on Python 3.12. The same tests ran using standard-library unittest.

## Blender bridge

With Blender 4.2+ installed:

```bash
blender --background --python pipeline/character/export_blender.py
```

This imports the generated squat and saves an editable `.blend`; the bridge was not executed here because Blender is unavailable. Register its generated source file in the provenance inventory before checking it in. Do not silently publish regenerated or Blender-edited files without QA and visual review.

See [character selection](../docs/architecture/character-selection.md) and [skeleton contract](../docs/architecture/skeleton.md).
