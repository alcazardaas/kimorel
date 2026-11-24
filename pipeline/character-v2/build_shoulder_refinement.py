"""Same-topology shoulder engineering variant. Parent runs pinned native Blender."""
import hashlib
import importlib.util
import json
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
OUT = HERE / 'shoulder-refinement'


def module(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


base = module('build_correctives')
w = module('shoulder_weights')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def update_weights(mesh):
    points = [base.g.gltf_point(tuple(v.co)) for v in mesh.data.vertices]
    adjacency = [set() for _ in points]
    for edge in mesh.data.edges:
        a, b = edge.vertices
        adjacency[a].add(b)
        adjacency[b].add(a)
    names = {group.index: group.name for group in mesh.vertex_groups}
    bones = {b.name for b in bpy.data.objects['character-v2-rig'].data.bones}
    original = [{names[g.group]: g.weight for g in v.groups if names[g.group] in bones} for v in mesh.data.vertices]
    params = json.loads((OUT / 'parameters.json').read_text())
    refined, masks = w.refine(points, adjacency, original, params['iterations'], params['step'])
    changed = 0
    for i, weights in enumerate(refined):
        if masks[i] <= 0:
            assert weights == original[i]
            continue
        changed += 1
        for name in original[i]:
            mesh.vertex_groups[name].remove([i])
        assert len(weights) <= 4 and abs(sum(weights.values())-1) < 1e-7
        for name, weight in weights.items():
            mesh.vertex_groups[name].add([i], weight, 'REPLACE')
    return changed


def rebuild_shoulder(mesh, rig, action):
    keys = mesh.data.shape_keys
    keys.animation_data.action = None
    for track in keys.animation_data.nla_tracks:
        track.mute = True
    for key in keys.key_blocks:
        key.value = 0.
    base.select_action(rig, None, action, 31)
    before = base.evaluated_points(mesh)
    rest = [tuple(v.co) for v in mesh.data.vertices]
    params = base.c.PARAMETERS['shoulder-elevation']
    centers = [base.g.blender_point(base.POINTS[side+'_upper_arm']) for side in ('left', 'right')]
    masks = [base.c.mask(point, centers, params['radiusMeters']) for point in rest]
    adjacency = [set() for _ in rest]
    for edge in mesh.data.edges:
        a, b = edge.vertices
        adjacency[a].add(b)
        adjacency[b].add(a)
    after = base.c.relax(before, adjacency, masks, params['iterations'], params['step'], params['maxPosedDeltaMeters'])
    matrices = {b.name: rig.pose.bones[b.name].matrix @ b.matrix_local.inverted() for b in rig.data.bones}
    names = {g.index: g.name for g in mesh.vertex_groups}
    shape = keys.key_blocks['shoulder-elevation-patch']
    changed, maximum = 0, 0.
    for i, vertex in enumerate(mesh.data.vertices):
        linear = Matrix.Identity(4)*0.
        for influence in vertex.groups:
            transform = matrices.get(names[influence.group])
            if transform is not None:
                linear += transform*influence.weight
        linear = linear.to_3x3()
        if abs(linear.determinant()) < .02:
            raise RuntimeError('Unsafe inverse shoulder skin matrix')
        delta = Vector(base.c.bounded(linear.inverted() @ (Vector(after[i])-Vector(before[i])), params['maxRestDeltaMeters']))
        shape.data[i].co = vertex.co + delta
        changed += delta.length > 1e-8
        maximum = max(maximum, (linear @ delta).length)
    return {'verticesChanged': changed, 'maxPosedDeltaMeters': maximum}


def caption(label, camera):
    data = bpy.data.curves.new('refinement-caption', 'FONT')
    data.body, data.align_x, data.size = label, 'CENTER', .029
    obj = bpy.data.objects.new('refinement-caption', data)
    bpy.context.collection.objects.link(obj)
    obj.location = camera.matrix_world @ Vector((0, camera.data.ortho_scale*.40, -1))
    obj.rotation_euler = camera.rotation_euler
    mat = bpy.data.materials.new('refinement-caption-white')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    emission, output = nodes.new('ShaderNodeEmission'), nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    data.materials.append(mat)
    return obj, data


def render_panel(name, label, close=True):
    camera = base.stage.base.camera((1, -3, 1.7) if close else (3, -4, 1.5), (.16, 0, 1.38) if close else (0, 0, .95), .72 if close else 2.2, name)
    bpy.context.view_layer.update()
    obj, data = caption(label, camera)
    bpy.context.scene.render.filepath = str(OUT / (name+'.png'))
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.curves.remove(data)


def imported(path):
    old = set(bpy.context.scene.objects)
    actions_before = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = set(bpy.context.scene.objects)-old
    meshes = [o for o in objects if o.type == 'MESH' and any(mod.type == 'ARMATURE' for mod in o.modifiers)]
    assert len(meshes) == 1, 'Expected one reimported skinned body, not a helper mesh'
    assert meshes[0].data.shape_keys is not None, 'Reimported body lacks corrective keys'
    return (meshes[0], next(o for o in objects if o.type == 'ARMATURE'), set(bpy.data.actions)-actions_before)


def render_proof():
    base.OUT = OUT
    base.setup_render()
    mesh, rig, actions = imported(OUT / 'character.glb')
    shoulder = next(a for a in actions if a.name.split('.')[0] == 'shoulder-elevation')
    base.select_action(rig, mesh.data.shape_keys, shoulder, 31)
    assert mesh.data.shape_keys.key_blocks['shoulder-elevation-patch'].value > .9, 'New ON render lacks active morph'
    render_panel('new-on', 'NEW WEIGHTS + REBUILT MORPH')
    render_panel('new-whole', 'NEW DRAFT', False)
    base.select_action(rig, mesh.data.shape_keys, shoulder, 1)
    render_panel('neutral-whole', 'NEUTRAL UNCHANGED', False)
    mesh.hide_render = True
    old_mesh, old_rig, old_actions = imported(HERE / 'correctives/character-v2-correctives.glb')
    old_shoulder = next(a for a in old_actions if a.name.split('.')[0] == 'shoulder-elevation')
    base.select_action(old_rig, old_mesh.data.shape_keys, old_shoulder, 31)
    assert old_mesh.data.shape_keys.key_blocks['shoulder-elevation-patch'].value > .9, 'Old ON render lacks active morph'
    render_panel('old-on', 'OLD MORPH ON')
    render_panel('old-whole', 'OLD DRAFT', False)
    old_mesh.data.shape_keys.animation_data_clear()
    for key in old_mesh.data.shape_keys.key_blocks:
        key.value = 0.
    bpy.context.view_layer.update()
    render_panel('old-off', 'OLD MORPH OFF')
    base.stage.sheet(['old-off', 'old-on', 'new-on', 'neutral-whole', 'old-whole', 'new-whole'], 'comparison', 3)


def main():
    if bpy.app.version[:3] != (5, 2, 4):
        raise RuntimeError('Pinned Blender5.2.4 LTS required')
    frozen = {str(p.relative_to(HERE)): digest(p) for name in ('correctives', 'deformation', 'prototype', 'muscles-upper-arm-draft', 'masks/upper-arm-draft') for p in (HERE/name).iterdir() if p.is_file()}
    source = HERE / 'correctives/source.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    mesh, rig = bpy.data.objects['connected-deformation-draft'], bpy.data.objects['character-v2-rig']
    neutral = [tuple(v.co) for v in mesh.data.vertices]
    topology = [tuple(p.vertices) for p in mesh.data.polygons]
    hip = [tuple(v.co) for v in mesh.data.shape_keys.key_blocks['hip-flexion-patch'].data]
    changed = update_weights(mesh)
    action = bpy.data.actions['shoulder-elevation']
    correction = rebuild_shoulder(mesh, rig, action)
    assert neutral == [tuple(v.co) for v in mesh.data.vertices]
    assert topology == [tuple(p.vertices) for p in mesh.data.polygons]
    assert hip == [tuple(v.co) for v in mesh.data.shape_keys.key_blocks['hip-flexion-patch'].data]
    base.select_action(rig, mesh.data.shape_keys, bpy.data.actions['hand-closure'], 1)
    base.stage.activate(mesh)
    rig.select_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source.blend'))
    bpy.ops.export_scene.gltf(filepath=str(OUT/'character.glb'), export_format='GLB', use_selection=True,
        export_yup=True, export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_influence_nb=4, export_extras=True, export_morph=True, export_morph_normal=True,
        export_copyright='Original shoulder engineering proposal; CC0-1.0; needs-review')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    render_proof()
    assert all(digest(HERE/name) == sha for name, sha in frozen.items()), 'Frozen file changed'
    manifest = {'status': 'engineering-proposal-needs-review', 'humanApproval': False, 'anatomicalValidation': False,
        'sourceLicense': 'CC0-1.0', 'input': {'path': 'pipeline/character-v2/correctives/source.blend', 'sha256': digest(source)},
        'method': 'Same topology local four-influence field smoothing; rebuilt posed-space shoulder corrective; original hip target preserved',
        'changedWeightVertices': changed, 'correction': correction,
        'generatorSha256': digest(Path(__file__)), 'helperSha256': digest(HERE/'shoulder_weights.py'), 'parametersSha256': digest(OUT/'parameters.json'),
        'toolchain': {'blender': bpy.app.version_string, 'buildHash': bpy.app.build_hash.decode()},
        'limitations': ['Not anatomy/artist/device approved', 'Existing seven stress clips only', 'Neutral shoulder topology and silhouette unchanged'],
        'files': {p.name: {'bytes': p.stat().st_size, 'sha256': digest(p)} for p in sorted(OUT.iterdir()) if p.suffix in ('.glb', '.blend', '.png')}}
    (OUT/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print('SHOULDER_REFINEMENT_COMPLETE', changed, json.dumps(correction))


if __name__ == '__main__':
    main()
