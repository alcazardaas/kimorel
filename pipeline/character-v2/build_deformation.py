"""Separate connected/reduced engineering draft; never overwrites prototype inputs.

Run only with the approved Blender 5.2.4 binary. Render proof is reimported GLB.
"""
from array import array
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Quaternion, Vector

HERE = Path(__file__).resolve().parent
OUT = HERE / 'deformation'
INPUT = HERE / 'prototype' / 'character-v2.blend'


def module(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


base = module('build_prototype')
g = base.g
w = module('deformation_weights')
POINTS, _ = g.skeleton()
STRESSES = ('shoulder-elevation', 'elbow-flexion', 'forearm-twist', 'wrist-flexion',
            'hip-flexion', 'knee-flexion', 'hand-closure')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def reduce_surface(obj, triangle_target):
    """Independent hand budgets preserve detail instead of whole-body decimation."""
    activate(obj)
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = world
    obj.modifiers.clear()
    obj.vertex_groups.clear()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.calc_loop_triangles()
    modifier = obj.modifiers.new('region-budget-collapse', 'DECIMATE')
    assert 'ratio' in modifier.bl_rna.properties, 'Installed decimator API changed'
    modifier.ratio = min(1., triangle_target / len(obj.data.loop_triangles))
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def separated_hand(side):
    wrist = POINTS[side + '_hand']
    layout = g.hand_layout(side, wrist, POINTS[side + '_forearm'])
    limit = w.digit_radius_limit(layout['chains'])
    palm = base.ellipsoid(side + '_palm', layout['center'], (.034, .046, .022))
    palm.rotation_mode = 'QUATERNION'
    palm.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(g.blender_point(layout['along'])))
    objects = [palm]
    for digit, chain in layout['chains'].items():
        original = [.009, .008, .007, .0055] if digit != 'little' else [.0075, .007, .006, .0048]
        radii = original if digit == 'thumb' else [min(r, limit) for r in original]
        objects.append(base.tube(side + '_' + digit, chain, radii))
        objects.append(base.ellipsoid(side + '_' + digit + '_tip', chain[-1], (radii[-1],) * 3))
    return base.fuse(objects, side + '-separated-hand', .0015)


def connected_surface():
    body = bpy.data.objects['body-v2-draft']
    # Body 38k plus 8k per hand leaves margin for Boolean intersection loops.
    reduce_surface(body, 38000)
    for side in ('left', 'right'):
        original = bpy.data.objects[side + '-hand-v2-draft']
        bpy.data.objects.remove(original, do_unlink=True)
        hand = separated_hand(side)
        reduce_surface(hand, 8000)
        activate(body)
        modifier = body.modifiers.new(side + '-wrist-exact-union', 'BOOLEAN')
        assert 'EXACT' in modifier.bl_rna.properties['solver'].enum_items.keys()
        modifier.operation, modifier.solver, modifier.object = 'UNION', 'EXACT', hand
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.data.objects.remove(hand, do_unlink=True)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    # Exact unions create actual shared wrist topology, not merely one object.
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    nonmanifold = sum(not edge.is_manifold for edge in bm.edges)
    bm.to_mesh(body.data)
    bm.free()
    if nonmanifold:
        raise RuntimeError(f'Connected draft has {nonmanifold} nonmanifold edges')
    body.name = 'connected-deformation-draft'
    for face in body.data.polygons:
        face.use_smooth = True
    body.data.calc_loop_triangles()
    triangles = len(body.data.loop_triangles)
    if triangles > 60000:
        raise RuntimeError(f'Triangle engineering budget exceeded: {triangles}')
    return body, triangles


def bind(mesh, rig):
    groups = {bone.name: mesh.vertex_groups.new(name=bone.name) for bone in rig.data.bones}
    segments = {bone.name: (g.gltf_point(bone.head_local), g.gltf_point(bone.tail_local))
                for bone in rig.data.bones}
    for vertex in mesh.data.vertices:
        point = g.gltf_point(vertex.co)
        values = w.normalized_weights(point, segments, w.regional_priors(point, POINTS))
        for name, weight in values.items():
            groups[name].add([vertex.index], weight, 'REPLACE')
    modifier = mesh.modifiers.new('generated-regional-linear-skin', 'ARMATURE')
    modifier.object = rig
    modifier.use_deform_preserve_volume = False  # Match standard exported glTF skinning.
    mesh.parent = rig


def rotation(bone, axis, radians):
    """World rest axis to local bone rotation; no anatomical ROM assertion."""
    rest = bone.bone.matrix_local.to_quaternion()
    return rest.inverted() @ Quaternion(axis, radians) @ rest


def stress_pose(rig, name, amount):
    for bone in rig.pose.bones:
        bone.rotation_mode = 'QUATERNION'
        bone.rotation_quaternion = (1, 0, 0, 0)
    for side, sign in (('left', 1), ('right', -1)):
        target, axis, angle = {
            'shoulder-elevation': ('upper_arm', (0, 1, 0), -sign * 65),
            'elbow-flexion': ('forearm', (1, 0, 0), -80),
            'forearm-twist': ('forearm', None, 50),
            'wrist-flexion': ('hand', (1, 0, 0), -40),
            'hip-flexion': ('thigh', (1, 0, 0), -55),
            'knee-flexion': ('shin', (1, 0, 0), 80),
            'hand-closure': ('hand', None, 0),
        }[name]
        pose = rig.pose.bones[side + '_' + target]
        radians = math.radians(angle) * amount
        pose.rotation_quaternion = rotation(pose, axis, radians) if axis else Quaternion((0, 1, 0), radians)
        if name == 'hand-closure':
            for digit in ('thumb', 'index', 'middle', 'ring', 'little'):
                for index in range(1, 4):
                    pose = rig.pose.bones[f'{side}_{digit}_{index}']
                    pose.rotation_quaternion = Quaternion((1, 0, 0), amount * (.40 if digit == 'thumb' else .75))


def animate(rig):
    rig.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end, scene.render.fps = 1, 61, 30
    for name in STRESSES:
        rig.animation_data_create().action = None
        for frame, amount in ((1, 0), (31, 1), (61, 0)):
            stress_pose(rig, name, amount)
            for bone in rig.pose.bones:
                bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=bone.name)
        action = rig.animation_data.action
        action.name = name
        action.use_fake_user = True
    scene.frame_set(1)


def select_action(rig, name, peak=False):
    action = next(action for action in bpy.data.actions if action.name == name)
    rig.animation_data_create().action = action
    rig.animation_data.action_slot = action.slots[0]
    # Imported glTF keys start at 1/30s in this pinned exporter. Actual frame
    # range is read rather than assuming an exactly 2-second clip.
    start, end = action.frame_range
    bpy.context.scene.frame_set(round((start + end) / 2 if peak else start))


def render(name, position, target=(0, 0, .93), scale=2.02):
    base.camera(position, target, scale, 'review-' + name)
    bpy.context.scene.render.filepath = str(OUT / (name + '.png'))
    bpy.ops.render.render(write_still=True)


def sheet(names, filename, columns):
    width, height = 480, 600
    rows = math.ceil(len(names) / columns)
    image = bpy.data.images.new(filename, width=width * columns, height=height * rows)
    pixels = array('f', [.035, .035, .035, 1.]) * (width * height * columns * rows)
    for index, name in enumerate(names):
        source = bpy.data.images.load(str(OUT / (name + '.png')), check_existing=False)
        sample = array('f', [0.]) * (width * height * 4)
        source.pixels.foreach_get(sample)
        column, row = index % columns, rows - 1 - index // columns
        for y in range(height):
            offset = ((row * height + y) * width * columns + column * width) * 4
            pixels[offset:offset + width * 4] = sample[y * width * 4:(y + 1) * width * 4]
        bpy.data.images.remove(source)
    image.pixels.foreach_set(pixels)
    image.filepath_raw, image.file_format = str(OUT / (filename + '.png')), 'PNG'
    image.save()


def render_proof():
    scene = bpy.context.scene
    scene.render.engine, scene.cycles.device, scene.cycles.samples = 'CYCLES', 'CPU', 12
    scene.render.resolution_x, scene.render.resolution_y = 480, 600
    scene.render.resolution_percentage = 100
    scene.world.color = (.25, .25, .25)
    scene.view_settings.view_transform = 'AgX'
    for name, position, power in (('key', (3, -4, 4), 450), ('fill', (-3, -2, 2), 250), ('rim', (0, 3, 3), 350)):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.shape, data.size = power, 'DISK', 4
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    rig = next(obj for obj in scene.objects if obj.type == 'ARMATURE')
    select_action(rig, 'hand-closure')
    for name, position in (('front', (0, -4, 1)), ('side', (4, 0, 1)), ('back', (0, 4, 1))):
        render(name, position)
    render('wrist-neutral', (1.2, -2, .90), (.45, 0, .87), .30)
    for name in STRESSES:
        select_action(rig, name, True)
        render(name, (3, -4, 1.5))
    select_action(rig, 'knee-flexion', True)
    render('knee-side', (4, 0, 1))
    select_action(rig, 'wrist-flexion', True)
    render('wrist-flexed', (1.2, -2, .90), (.45, 0, .87), .30)
    select_action(rig, 'hand-closure', True)
    render('hand-closed', (1.2, -2, .90), (.45, 0, .87), .30)
    sheet(['front', 'side', 'back', *STRESSES, 'knee-side', 'wrist-neutral', 'wrist-flexed', 'hand-closed', 'front', 'side'], 'stress-sheet', 4)
    # Direct baseline comparison under identical new camera/light settings.
    select_action(rig, 'hand-closure')
    new_objects = [obj for obj in scene.objects if obj.type in ('MESH', 'ARMATURE')]
    for obj in new_objects:
        obj.hide_render = True
    bpy.ops.import_scene.gltf(filepath=str(HERE / 'prototype' / 'character-v2.glb'))
    old_rig = next(obj for obj in scene.objects if obj.type == 'ARMATURE' and obj not in new_objects)
    old_rig.animation_data_clear()
    scene.frame_set(1)
    render('baseline-front', (0, -4, 1))
    render('baseline-wrist', (1.2, -2, .90), (.45, 0, .87), .30)
    sheet(['baseline-front', 'front', 'baseline-wrist', 'wrist-neutral'], 'comparison-sheet', 2)


def main():
    if bpy.app.version[:3] != (5, 2, 4):
        raise RuntimeError('Pinned Blender5.2.4 LTS required')
    OUT.mkdir(exist_ok=True)
    frozen = {str(p.relative_to(HERE)): digest(p) for p in (HERE / 'prototype').iterdir() if p.suffix != '.blend1'}
    bpy.ops.wm.open_mainfile(filepath=str(INPUT))
    rig = bpy.data.objects['character-v2-rig']
    rig.animation_data_clear()
    bpy.context.scene.frame_set(1)
    surface, triangles = connected_surface()
    bind(surface, rig)
    animate(rig)
    activate(surface)
    rig.select_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'source.blend'))
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'character-v2-deformation.glb'), export_format='GLB', use_selection=True,
        export_yup=True, export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_influence_nb=4, export_extras=True,
        export_copyright='Original Kimorel engineering draft; CC0-1.0; needs-review')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    bpy.ops.import_scene.gltf(filepath=str(OUT / 'character-v2-deformation.glb'))
    render_proof()
    assert all(digest(HERE / name) == sha for name, sha in frozen.items()), 'Frozen prototype changed'
    manifest = {'status': 'engineering-draft-needs-review', 'clinicalValidation': False, 'license': 'CC0-1.0',
        'humanApproval': False, 'inputSource': {'path': 'pipeline/character-v2/prototype/character-v2.blend', 'sha256': frozen['prototype/character-v2.blend']},
        'generatorSha256': digest(Path(__file__)), 'weightsSha256': digest(HERE / 'deformation_weights.py'),
        'blender': bpy.app.version_string, 'buildHash': bpy.app.build_hash.decode(), 'trianglesBeforeExport': triangles,
        'methods': ['Separate body/hand collapse budgets; hand radius bounded by semantic mid-shaft spacing minus4mm gap', 'Exact welded wrist Boolean unions', 'Generated smooth regional linear weights', 'Seven neutral-return engineering stress clips; no clinical ROM claim'],
        'limitations': ['Automatic triangle topology, not production anatomical edgeflow', 'Generated weights, no painted corrections or twist helper bones', 'No collision/contact or clinical validation', 'Device performance acceptance pending'],
        'stressClips': list(STRESSES), 'files': {}}
    for path in sorted(OUT.iterdir()):
        if path.suffix in ('.blend', '.glb', '.png'):
            manifest['files'][path.name] = {'bytes': path.stat().st_size, 'sha256': digest(path)}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('DEFORMATION_COMPLETE', triangles, str(OUT))


if __name__ == '__main__':
    main()
