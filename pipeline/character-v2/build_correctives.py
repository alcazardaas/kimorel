"""Bake bounded shoulder/hip pose-space proposals as standard glTF morphs.

Neutral topology and previous source stay untouched. No drivers ship in the GLB.
"""
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
OUT = HERE / 'correctives'


def module(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


stage = module('build_deformation')
g = stage.g
c = module('corrective_geometry')
POINTS, _ = g.skeleton()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def select_action(rig, keys, action, frame):
    for owner in (rig, keys):
        if owner is None:
            continue
        slot = next((slot for slot in action.slots if slot.target_id_type == owner.id_type), None)
        if slot:
            owner.animation_data_create().action = action
            owner.animation_data.action_slot = slot
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


def evaluated_points(mesh):
    evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    return [tuple(v.co) for v in evaluated.data.vertices]


def build_shape(mesh, rig, action, name):
    params = c.PARAMETERS[name]
    rest = [tuple(v.co) for v in mesh.data.vertices]
    centers = [g.blender_point(POINTS[side + '_' + params['joint']]) for side in ('left', 'right')]
    masks = [c.mask(point, centers, params['radiusMeters']) for point in rest]
    adjacency = [set() for _ in rest]
    for edge in mesh.data.edges:
        a, b = edge.vertices
        adjacency[a].add(b)
        adjacency[b].add(a)
    select_action(rig, mesh.data.shape_keys, action, 31)
    before = evaluated_points(mesh)
    after = c.relax(before, adjacency, masks, params['iterations'], params['step'], params['maxPosedDeltaMeters'])
    shape = mesh.shape_key_add(name=name + '-patch', from_mix=False)
    group = mesh.vertex_groups.new(name='review-mask-' + name)
    # With identity object transforms the blended bone matrices take rest mesh
    # coordinates to posed mesh coordinates. Invert their LINEAR part for deltas;
    # applying an inverse point transform would incorrectly include translation.
    matrices = {bone.name: rig.pose.bones[bone.name].matrix @ bone.matrix_local.inverted() for bone in rig.data.bones}
    groups = {group.index: group.name for group in mesh.vertex_groups}
    max_rest = max_posed = 0.
    active = 0
    for i, vertex in enumerate(mesh.data.vertices):
        if masks[i] <= 0:
            continue
        group.add([i], masks[i], 'REPLACE')
        skin = Matrix.Identity(4) * 0.
        for influence in vertex.groups:
            bone = matrices.get(groups[influence.group])
            if bone is not None:
                skin += bone * influence.weight
        linear = skin.to_3x3()
        if abs(linear.determinant()) < .02:
            raise RuntimeError('Near-singular local skin matrix; cannot recover safe corrective')
        delta = Vector(after[i]) - Vector(before[i])
        rest_delta = Vector(c.bounded(linear.inverted() @ delta, params['maxRestDeltaMeters']))
        shape.data[i].co = vertex.co + rest_delta
        active += rest_delta.length > 1e-8
        max_rest = max(max_rest, rest_delta.length)
        max_posed = max(max_posed, (linear @ rest_delta).length)
    shape.value = 0.
    return {'verticesChanged': active, 'maxRestDeltaMeters': max_rest, 'maxPosedDeltaMeters': max_posed, 'parameters': params}


def bake_weights(mesh, rig, actions):
    keys = mesh.data.shape_keys
    for name in stage.STRESSES:
        action = actions[name]
        keys.animation_data_create().action = action
        keys.animation_data.action_slot = action.slots.new(keys.id_type, keys.name)
        for frame in range(1, 62):
            select_action(rig, keys, action, frame)
            for correction, params in c.PARAMETERS.items():
                angle = math.degrees(rig.pose.bones['left_' + params['joint']].rotation_quaternion.angle)
                key = keys.key_blocks[correction + '-patch']
                _, onset, peak = params['activationDegrees']
                key.value = c.activation(angle, onset, peak) if name == correction else 0.
                key.keyframe_insert(data_path='value', frame=frame)
        action.use_fake_user = True
    select_action(rig, keys, actions['hand-closure'], 1)
    # Installed exporter action.py only discovers non-active Key actions from
    # explicit NLA associations (the single-armature fallback applies to rigs).
    for name, action in actions.items():
        track = keys.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.action_slot = next(slot for slot in action.slots if slot.target_id_type == keys.id_type)
        track.mute = True  # Stashed, not stacked during source evaluation.
    keys.animation_data.action = None
    for key in keys.key_blocks:
        key.value = 0.


def setup_render():
    scene = bpy.context.scene
    scene.render.engine, scene.cycles.device, scene.cycles.samples = 'CYCLES', 'CPU', 16
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
    stage.OUT = OUT


def render_patch(label, name):
    if name == 'shoulder-elevation':
        position, target = (1, -3, 1.7), (.16, 0, 1.38)
    else:
        position, target = (2, -3, 1.15), (.10, -.06, .96)
    scale = .72
    camera = stage.base.camera(position, target, scale, 'review-' + label)
    bpy.context.view_layer.update()
    # Actual Blender text rendered in camera space, never an AI/raster overlay.
    data = bpy.data.curves.new('ablation-caption', 'FONT')
    data.body = 'OLD' if label.endswith('-old') else ('MORPH OFF' if label.endswith('-off') else 'MORPH ON')
    data.align_x, data.size = 'CENTER', .034
    caption = bpy.data.objects.new('ablation-caption', data)
    bpy.context.collection.objects.link(caption)
    caption.location = camera.matrix_world @ Vector((0, scale * .40, -1))
    caption.rotation_euler = camera.rotation_euler
    mat = bpy.data.materials.new('caption-white')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    emission, output = nodes.new('ShaderNodeEmission'), nodes.new('ShaderNodeOutputMaterial')
    emission.inputs['Color'].default_value = (1, 1, 1, 1)
    mat.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    data.materials.append(mat)
    bpy.context.scene.render.filepath = str(OUT / (label + '.png'))
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(caption, do_unlink=True)
    bpy.data.curves.remove(data)


def render_proof():
    setup_render()
    scene = bpy.context.scene
    rig = next(obj for obj in scene.objects if obj.type == 'ARMATURE')
    mesh = next(obj for obj in scene.objects if obj.type == 'MESH')
    keys = mesh.data.shape_keys
    if keys is None:
        raise RuntimeError('Reimported GLB contains no morph targets')
    actions = {name: next(a for a in bpy.data.actions if a.name == name) for name in stage.STRESSES}
    select_action(rig, keys, actions['hand-closure'], 1)
    stage.render('neutral-front', (0, -4, 1))
    for name in c.PARAMETERS:
        select_action(rig, keys, actions[name], 31)
        render_patch(name + '-on', name)
        stage.render(name + '-whole', (3, -4, 1.5))
        # Morph OFF ablation: leave the bone action active at the same pose.
        keys.animation_data_clear()
        for key in keys.key_blocks:
            key.value = 0.
        scene.frame_set(31)
        render_patch(name + '-off', name)
    for obj in (rig, mesh):
        obj.hide_render = True
    old_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(HERE / 'deformation/character-v2-deformation.glb'))
    old_rig = next(obj for obj in scene.objects if obj.type == 'ARMATURE' and obj != rig)
    imported = set(bpy.data.actions) - old_actions
    for name in c.PARAMETERS:
        action = next(action for action in imported if action.name.split('.')[0] == name)
        select_action(old_rig, None, action, 31)
        render_patch(name + '-old', name)
    names = [name + suffix for name in c.PARAMETERS for suffix in ('-old', '-off', '-on')]
    stage.sheet(names, 'corrective-ablation-sheet', 3)
    stage.sheet(['neutral-front', 'shoulder-elevation-whole', 'hip-flexion-whole'], 'context-sheet', 3)


def main():
    if bpy.app.version[:3] != (5, 2, 4):
        raise RuntimeError('Pinned Blender5.2.4 LTS required')
    OUT.mkdir(exist_ok=True)
    frozen = {str(path.relative_to(HERE)): digest(path) for folder in ('prototype', 'deformation') for path in (HERE / folder).iterdir() if path.suffix != '.blend1'}
    source = HERE / 'deformation/source.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    mesh = bpy.data.objects['connected-deformation-draft']
    rig = bpy.data.objects['character-v2-rig']
    for obj in (mesh, rig):
        if any(abs(obj.matrix_world[i][j] - Matrix.Identity(4)[i][j]) > 1e-6 for i in range(4) for j in range(4)):
            raise RuntimeError('Corrective input must have identity object transforms')
    actions = {name: bpy.data.actions[name] for name in stage.STRESSES}
    mesh.shape_key_add(name='Basis', from_mix=False)
    evidence = {name: build_shape(mesh, rig, actions[name], name) for name in c.PARAMETERS}
    bake_weights(mesh, rig, actions)
    stage.activate(mesh)
    rig.select_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'source.blend'))
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'character-v2-correctives.glb'), export_format='GLB', use_selection=True,
        export_yup=True, export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_influence_nb=4, export_extras=True, export_morph=True, export_morph_normal=True,
        export_copyright='Original Kimorel automated corrective proposal; CC0-1.0; needs-review')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    bpy.ops.import_scene.gltf(filepath=str(OUT / 'character-v2-correctives.glb'))
    render_proof()
    assert all(digest(HERE / name) == sha for name, sha in frozen.items()), 'Frozen input artifact changed'
    manifest = {'status': 'automated-corrective-proposal-needs-review', 'humanApproval': False, 'clinicalValidation': False,
        'sourceLicense': 'CC0-1.0', 'input': {'path': 'pipeline/character-v2/deformation/source.blend', 'sha256': digest(source)},
        'generatorSha256': digest(Path(__file__)), 'helperSha256': digest(HERE / 'corrective_geometry.py'),
        'toolchain': {'blender': bpy.app.version_string, 'buildHash': bpy.app.build_hash.decode()},
        'method': 'Compact semantic posed-space relaxation, inverse linear skin delta, baked shared-action morph weights; no drivers',
        'shapes': evidence, 'limitations': ['Automated targets, not artist-approved corrections', 'Known stress poses only, not general motion correctness', 'No anatomical/clinical/contact or performance acceptance'], 'files': {}}
    for path in sorted(OUT.iterdir()):
        if path.suffix in ('.blend', '.glb', '.png'):
            manifest['files'][path.name] = {'bytes': path.stat().st_size, 'sha256': digest(path)}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('CORRECTIVES_COMPLETE', json.dumps(evidence))


if __name__ == '__main__':
    main()
