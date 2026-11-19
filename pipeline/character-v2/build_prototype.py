"""Blender 5.2 draft blockout/export spike; deliberately not production retopology."""
from array import array
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('prototype_geometry', HERE / 'prototype_geometry.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
OUT = HERE / 'prototype'
OUT.mkdir(exist_ok=True)
POINTS, PARENTS = g.skeleton()


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = .78
    return mat


def ellipsoid(name, center, radius):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=g.blender_point(center))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (radius[0], radius[2], radius[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def tube(name, points, radii):
    vertices, faces = g.loft(points, radii, 32)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([g.blender_point(v) for v in vertices], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def fuse(objects, name, voxel):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.remesh_voxel_size = voxel
    bpy.ops.object.voxel_remesh()
    smooth = obj.modifiers.new('draft-surface-smoothing', 'SMOOTH')
    smooth.factor = .45
    smooth.iterations = 10 if name == 'body-v2-draft' else 3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def body():
    objects = []
    # Original blockout volumes retain the legacy skeleton and broad silhouette.
    for name, center, radius in (
        ('pelvis', (0, 1.00, -.012), (.205, .175, .127)),
        ('abdomen', (0, 1.175, .003), (.153, .215, .101)),
        ('ribcage', (0, 1.365, -.006), (.220, .165, .117)),
        ('neck', (0, 1.55, 0), (.061, .115, .061)),
        ('head', (0, 1.71, .005), (.099, .143, .102)),
        ('jaw', (0, 1.635, .030), (.075, .062, .077)),
    ):
        objects.append(ellipsoid(name, center, radius))
    for side, sign in (('left', 1), ('right', -1)):
        for name, center, radius in (
            ('deltoid', (sign * .217, 1.423, 0), (.082, .084, .078)),
            ('pectoral', (sign * .104, 1.395, .069), (.115, .062, .061)),
            ('lat', (sign * .120, 1.292, -.062), (.078, .128, .065)),
            ('gluteal', (sign * .106, .985, -.068), (.112, .126, .086)),
            ('patella', (sign * .145, .515, .064), (.055, .054, .033)),
            ('calf', (sign * .145, .347, -.019), (.066, .135, .067)),
            ('heel', (sign * .145, .067, .018), (.052, .057, .073)),
            ('foot', (sign * .145, .057, .128), (.062, .049, .127)),
        ):
            objects.append(ellipsoid(side + '_' + name, center, radius))
        # One uninterrupted loft per limb avoids exposed planar joint caps.
        arm = [POINTS[f'{side}_upper_arm'], (sign * .29, 1.31, 0),
               POINTS[f'{side}_forearm'], (sign * .39, 1.07, 0), POINTS[f'{side}_hand']]
        objects.append(tube(side + '_arm_surface', arm, [.070, .073, .050, .054, .031]))
        leg = [(sign * .105, 1.02, 0), (sign * .145, .85, .002),
               (sign * .145, .68, .01), POINTS[f'{side}_shin'],
               (sign * .145, .42, .015), (sign * .145, .29, .025), POINTS[f'{side}_foot']]
        objects.append(tube(side + '_leg_surface', leg, [.085, .103, .088, .059, .059, .051, .038]))
    return fuse(objects, 'body-v2-draft', .005)


def hand(side):
    wrist = POINTS[side + '_hand']
    layout = g.hand_layout(side, wrist, POINTS[side + '_forearm'])
    # Palm orientation follows the legacy forearm direction; digits have actual gaps.
    palm = ellipsoid(side + '_palm', layout['center'], (.034, .046, .022))
    direction = Vector(g.blender_point(layout['along']))
    palm.rotation_mode = 'QUATERNION'
    palm.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction)
    objects = [palm]
    for digit, chain in layout['chains'].items():
        radii = [.009, .008, .007, .0055] if digit != 'little' else [.0075, .007, .006, .0048]
        objects.append(tube(side + '_' + digit, chain, radii))
        objects.append(ellipsoid(side + '_' + digit + '_tip', chain[-1], (radii[-1],) * 3))
    return fuse(objects, side + '-hand-v2-draft', .0025)


def armature():
    data = bpy.data.armatures.new('character-v2-deform')
    obj = bpy.data.objects.new('character-v2-rig', data)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name, point in POINTS.items():
        bone = data.edit_bones.new(name)
        bone.head = g.blender_point(point)
        children = [p for key, p in POINTS.items() if PARENTS[key] == name]
        if '_' in name and name.rsplit('_', 1)[-1].isdigit():
            side, digit, index = name.split('_')
            layout = g.hand_layout(side, POINTS[side + '_hand'], POINTS[side + '_forearm'])
            tail = layout['chains'][digit][int(index)]
        elif children:
            tail = children[0]
        else:
            tail = g.add(point, (0, .055, 0))
        if name == 'root':
            tail = (0, .08, 0)
        bone.tail = g.blender_point(tail)
        if (bone.tail - bone.head).length < .001:
            bone.tail.z += .03
    for name, parent in PARENTS.items():
        if parent:
            data.edit_bones[name].parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.show_in_front = True
    return obj


def distance_to_bone(point, bone):
    a, b = bone.head_local, bone.tail_local
    edge = b - a
    t = max(0, min(1, (point - a).dot(edge) / edge.length_squared))
    return (point - a - edge * t).length


def bind(mesh, rig, side=None):
    groups = {bone.name: mesh.vertex_groups.new(name=bone.name) for bone in rig.data.bones}
    for vertex in mesh.data.vertices:
        point = mesh.matrix_world @ vertex.co
        gltf = g.gltf_point(point)
        x, y, _ = gltf
        if side:
            candidates = [b for b in rig.data.bones if b.name == side + '_hand' or b.name.startswith(side + '_') and b.name.rsplit('_', 1)[-1].isdigit()]
        elif y < .91:
            prefix = 'left' if x > 0 else 'right'
            candidates = [rig.data.bones[prefix + '_' + part] for part in ('thigh', 'shin', 'foot')]
        elif abs(x) > .255 and y < 1.51:
            prefix = 'left' if x > 0 else 'right'
            candidates = [rig.data.bones[prefix + '_' + part] for part in ('upper_arm', 'forearm', 'hand')]
        else:
            candidates = [rig.data.bones[name] for name in ('pelvis', 'spine', 'chest', 'neck', 'head', 'left_clavicle', 'right_clavicle')]
        nearest = sorted((distance_to_bone(point, b), b.name) for b in candidates)[:3]
        weights = [1 / max(.008, distance) ** 5 for distance, _ in nearest]
        total = sum(weights)
        for (_, name), weight in zip(nearest, weights):
            groups[name].add([vertex.index], weight / total, 'REPLACE')
    modifier = mesh.modifiers.new('standard-linear-skin', 'ARMATURE')
    modifier.object = rig
    modifier.use_deform_preserve_volume = False
    mesh.parent = rig


def animate(rig):
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, 61
    scene.render.fps = 30
    for frame, amount in ((1, 0), (31, 1), (61, 0)):
        for name in POINTS:
            pose = rig.pose.bones[name]
            pose.rotation_mode = 'XYZ'
            pose.rotation_euler = (0, 0, 0)
            if name.rsplit('_', 1)[-1].isdigit():
                index = int(name.rsplit('_', 1)[-1])
                pose.rotation_euler.x = amount * (.45 if '_thumb_' in name else (1.0 if index != 3 else .7))
            pose.keyframe_insert(data_path='rotation_euler', frame=frame, group=name)
    rig.animation_data.action.name = 'hand-articulation-smoke'
    scene.frame_set(1)


def camera(position, target, scale, name):
    data = bpy.data.cameras.new(name)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    data.type = 'ORTHO'
    data.ortho_scale = scale
    bpy.context.scene.camera = obj
    return obj


def render_views():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 12
    scene.render.resolution_x = 640
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.world.color = (.25, .25, .25)
    scene.view_settings.view_transform = 'AgX'
    for name, position, power, size in (
        ('key', (3, -4, 4), 450, 4), ('fill', (-3, -2, 2), 250, 3), ('rim', (0, 3, 3), 350, 3),
    ):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.shape, data.size = power, 'DISK', size
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    for name, position in (
        ('front', (0, -4, 1)), ('side', (4, 0, 1)), ('back', (0, 4, 1)), ('quarter', (3, -4, 1.5)),
    ):
        camera(position, (0, 0, .93), 2.02, 'review-' + name)
        scene.render.filepath = str(OUT / (name + '.png'))
        bpy.ops.render.render(write_still=True)
    scene.frame_set(1)
    camera((1.2, -2, .90), (.45, 0, .87), .30, 'review-hand-open')
    scene.render.filepath = str(OUT / 'hand-open.png')
    bpy.ops.render.render(write_still=True)
    scene.frame_set(31)
    scene.render.filepath = str(OUT / 'hand-closed.png')
    bpy.ops.render.render(write_still=True)
    scene.frame_set(1)


def review_sheet():
    names = ['front', 'side', 'back', 'quarter', 'hand-open', 'hand-closed']
    width, height = 640, 800
    sheet = bpy.data.images.new('exported-GLB-review-sheet', width=width * 3, height=height * 2)
    pixels = array('f', [1.0]) * (width * height * 6 * 4)
    for index, name in enumerate(names):
        source = bpy.data.images.load(str(OUT / (name + '.png')), check_existing=False)
        sample = array('f', [0.0]) * (width * height * 4)
        source.pixels.foreach_get(sample)
        column, row = index % 3, 1 - index // 3
        for y in range(height):
            target = ((row * height + y) * width * 3 + column * width) * 4
            pixels[target:target + width * 4] = sample[y * width * 4:(y + 1) * width * 4]
        bpy.data.images.remove(source)
    sheet.pixels.foreach_set(pixels)
    sheet.filepath_raw = str(OUT / 'inspection-sheet.png')
    sheet.file_format = 'PNG'
    sheet.save()


def main():
    if bpy.app.version[:3] != (5, 2, 4):
        raise RuntimeError('Prototype is pinned to Blender 5.2.4 LTS')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    skin = material('neutral-review-surface', (.43, .55, .53))
    meshes = [body(), hand('left'), hand('right')]
    rig = armature()
    for mesh, side in zip(meshes, (None, 'left', 'right')):
        mesh.data.materials.append(skin)
        bind(mesh, rig, side)
    animate(rig)
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for obj in [*meshes, rig]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'character-v2.blend'))
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'character-v2.glb'), export_format='GLB', use_selection=True,
        export_yup=True, export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_influence_nb=4, export_extras=True, export_copyright='Original Kimorel draft geometry and motion; CC0-1.0; needs-review')
    # Review images are rendered from the exported GLB, not the source scene.
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(OUT / 'character-v2.glb'))
    render_views()
    review_sheet()
    reference = g.reference()
    record = {
        'status': 'draft-needs-human-anatomy-review', 'clinicalValidation': False,
        'direction': 'Preserve legacy joint centers and overall proportions; refine the surface and articulate hands.',
        'reference': reference, 'exportSkeletonJoints': len(POINTS), 'animation': 'hand-articulation-smoke',
        'toolchain': {'blender': bpy.app.version_string, 'buildHash': bpy.app.build_hash.decode(), 'export': 'GLB, linear skinning, four influences, +Y up'},
        'sourceLicense': 'CC0-1.0', 'approval': 'needs-review',
        'limitations': ['Procedural volume-remeshed blockout, not production quad retopology.', 'Three intersecting closed components: body plus separately rigged hands; wrist seams need artist review.', 'Nearest-segment draft weights are not painted production weights.', 'No anatomical muscle segmentation, corrective shapes, full body exercise retargeting or clinical validation.', 'Finger smoke animation proves joint deformation, not contact or realistic grip mechanics.'],
        'files': {},
    }
    for path in sorted(OUT.iterdir()):
        if path.suffix in ('.glb', '.blend', '.png'):
            record['files'][path.name] = {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    (OUT / 'manifest.json').write_text(json.dumps(record, indent=2) + '\n')
    (HERE / 'reference-body.json').write_text(json.dumps({'status': 'direction-confirmed-anatomy-review-pending', 'reference': reference, 'jointCentersMeters': POINTS, 'parents': PARENTS}, indent=2) + '\n')
    print('PROTOTYPE_COMPLETE', len(POINTS), str(OUT))


if __name__ == '__main__':
    main()
