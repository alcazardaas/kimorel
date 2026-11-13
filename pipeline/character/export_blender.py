"""Optional Blender editable-source bridge; run after build.py.

blender --background --python pipeline/character/export_blender.py
Requires Blender 4.2+ with the bundled glTF importer/exporter. Not a runtime dependency.
"""
from pathlib import Path
import bpy

root = Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'assets/exercises/bodyweight-squat.glb'))
bpy.context.scene.render.fps = 30
bpy.context.scene.frame_end = 120
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/characters/neutral-human.blend'))
